import { error, fail } from '@sveltejs/kit';
import { asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, devices, employees, pushSubscriptions, shiftTemplates } from '#lib/server/db/index.js';
import { hashPassword, revokeDevices } from '#lib/server/auth.js';
import { requireOwner } from '#lib/server/guard.js';
import { notify } from '#lib/server/notify.js';
import { PALETTE, checkPassword, checkUsername, str } from '#lib/server/validate.js';

// 員工分頁（老闆）：員工名單、手機綁定與轉移帳號、時薪、固定班、密碼、停用

export const load: PageServerLoad = async ({ locals }) => {
	requireOwner(locals);

	const [people, deviceRows, templates, subs, revokedRows] = await Promise.all([
		db
			.select({
				id: employees.id,
				name: employees.name,
				username: employees.username,
				role: employees.role,
				color: employees.color,
				active: employees.active,
				hourlyWage: employees.hourlyWage
			})
			.from(employees)
			.orderBy(desc(employees.active), asc(employees.id)),
		db
			.select({
				id: devices.id,
				employeeId: devices.employeeId,
				label: devices.label,
				createdAt: devices.createdAt,
				lastSeenAt: devices.lastSeenAt
			})
			.from(devices)
			.where(isNull(devices.revokedAt))
			.orderBy(desc(devices.lastSeenAt)),
		db.select().from(shiftTemplates),
		db.select({ employeeId: pushSubscriptions.employeeId }).from(pushSubscriptions),
		// 最近被解除綁定的手機（看誰在「等新手機登入」）
		db
			.select({
				employeeId: devices.employeeId,
				label: devices.label,
				revokedAt: devices.revokedAt,
				reason: devices.revokeReason
			})
			.from(devices)
			.where(isNotNull(devices.revokedAt))
			.orderBy(desc(devices.revokedAt))
	]);

	return {
		people: people.map((p) => ({
			...p,
			devices: deviceRows.filter((d) => d.employeeId === p.id),
			/** 老闆按了轉移帳號、新手機還沒登入 */
			waiting: (() => {
				if (deviceRows.some((d) => d.employeeId === p.id)) return null;
				const last = revokedRows.find((r) => r.employeeId === p.id);
				return last?.reason === 'transfer' ? { label: last.label, at: last.revokedAt! } : null;
			})(),
			templates: templates.filter((t) => t.employeeId === p.id),
			/** 開了幾台裝置的推播通知 */
			pushDevices: subs.filter((x) => x.employeeId === p.id).length
		})),
		palette: PALETTE
	};
};

async function getEmployee(id: number) {
	const [emp] = await db.select().from(employees).where(eq(employees.id, id));
	if (!emp) error(404, '找不到這位員工');
	return emp;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireOwner(locals);
		const form = await request.formData();
		const name = str(form, 'name');
		const username = str(form, 'username');
		const password = String(form.get('password') ?? '');
		const role = str(form, 'role') === 'owner' ? 'owner' : 'staff';
		const color = PALETTE.includes(str(form, 'color')) ? str(form, 'color') : PALETTE[0];
		const hourlyWage = Math.max(0, Math.round(Number(str(form, 'hourlyWage')) || 0));

		const problem = (!name && '請輸入名字') || checkUsername(username) || checkPassword(password);
		if (problem) return fail(400, { scope: 'create', message: problem });

		const [taken] = await db.select({ id: employees.id }).from(employees).where(eq(employees.username, username));
		if (taken) return fail(400, { scope: 'create', message: '這個帳號已經有人用了' });

		await db.insert(employees).values({
			name,
			username,
			role,
			color,
			hourlyWage,
			passwordHash: await hashPassword(password),
			createdAt: new Date()
		});
		await notify('staff', null, `新增員工 ${name}`);
		return { scope: 'create', ok: `已新增 ${name}，請把帳號密碼交給他登入綁定手機` };
	},

	update: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const form = await request.formData();
		const emp = await getEmployee(Number(form.get('id')));
		const name = str(form, 'name') || emp.name;
		const color = PALETTE.includes(str(form, 'color')) ? str(form, 'color') : emp.color;
		const role = str(form, 'role') === 'owner' ? 'owner' : 'staff';
		const hourlyWage = Math.max(0, Math.round(Number(str(form, 'hourlyWage')) || 0));
		if (emp.id === me.id && role !== 'owner') return fail(400, { scope: 'edit', message: '不能把自己改成員工' });
		await db.update(employees).set({ name, color, role, hourlyWage }).where(eq(employees.id, emp.id));
		if (hourlyWage !== emp.hourlyWage) await notify('staff', emp.id, `${name} 時薪改為 $${hourlyWage}`);
		if (role !== emp.role) {
			await notify('staff', emp.id, role === 'owner' ? `${me.name} 給了 ${name} 老闆權限` : `${me.name} 取消了 ${name} 的老闆權限`, {
				title: '🔑 權限變更',
				actorId: me.id,
				toEmployee:
					role === 'owner'
						? { title: '🔑 你有老闆權限了', body: '可以排班、發薪、管理員工，底部會多出「員工」和「管理」分頁', url: '/admin', tag: 'role' }
						: { title: '🔑 權限已變更', body: '你的帳號改回員工', url: '/', tag: 'role' }
			});
		}
		return { scope: 'edit', ok: '已儲存' };
	},

	/** 固定班：一週七天各自勾選與設定時間，整份覆蓋 */
	saveTemplates: async ({ request, locals }) => {
		requireOwner(locals);
		const form = await request.formData();
		const emp = await getEmployee(Number(form.get('id')));
		const rows = [];
		for (let w = 0; w < 7; w++) {
			if (form.get(`on_${w}`) !== 'on') continue;
			const start = str(form, `start_${w}`);
			const end = str(form, `end_${w}`);
			if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
				return fail(400, { scope: 'edit', message: '固定班的時間沒填完整' });
			}
			rows.push({ employeeId: emp.id, weekday: w, startTime: `${start}:00`, endTime: `${end}:00` });
		}
		await db.delete(shiftTemplates).where(eq(shiftTemplates.employeeId, emp.id));
		if (rows.length) await db.insert(shiftTemplates).values(rows);
		return { scope: 'edit', ok: `已儲存 ${emp.name} 的固定班（到月曆按「套用固定班」就會排上）` };
	},

	/** 換手機：解除這位員工所有綁定，他用新手機登入就會自動綁新的 */
	/**
	 * 轉移帳號（換手機）：舊手機立刻失效、推播停掉，也不能再登回這個帳號；
	 * 員工用新手機登入同一組帳號密碼，資料（打卡、班表、薪資）全部都在。
	 */
	transfer: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const emp = await getEmployee(Number((await request.formData()).get('id')));
		if (emp.id === me.id) return fail(400, { scope: 'edit', message: '不能轉移自己的帳號；要換手機請直接在新手機登入（老闆可以多支裝置）' });
		await revokeDevices(emp.id, 'transfer');
		await notify('staff', emp.id, `轉移 ${emp.name} 的帳號，等他用新手機登入`, { title: '📱 轉移帳號', actorId: me.id });
		return { scope: 'edit', ok: `已轉移 ${emp.name} 的帳號：舊手機已停用，請他用新手機登入同一組帳號密碼` };
	},

	resetPassword: async ({ request, locals }) => {
		requireOwner(locals);
		const form = await request.formData();
		const emp = await getEmployee(Number(form.get('id')));
		const password = String(form.get('password') ?? '');
		const problem = checkPassword(password);
		if (problem) return fail(400, { scope: 'edit', message: problem });
		await db.update(employees).set({ passwordHash: await hashPassword(password) }).where(eq(employees.id, emp.id));
		await revokeDevices(emp.id, 'reset');
		return { scope: 'edit', ok: `已重設 ${emp.name} 的密碼，舊手機綁定也一併解除` };
	},

	toggleActive: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const emp = await getEmployee(Number((await request.formData()).get('id')));
		if (emp.id === me.id) return fail(400, { scope: 'edit', message: '不能停用自己' });
		await db.update(employees).set({ active: !emp.active }).where(eq(employees.id, emp.id));
		if (emp.active) await revokeDevices(emp.id, 'deactivated');
		return { scope: 'edit', ok: emp.active ? `已停用 ${emp.name}` : `已恢復 ${emp.name}` };
	}
};
