import { error, fail } from '@sveltejs/kit';
import { asc, desc, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, devices, employees, notifications, pushSubscriptions, shiftTemplates } from '#lib/server/db/index.js';
import { hashPassword, revokeDevices } from '#lib/server/auth.js';
import { requireOwner } from '#lib/server/guard.js';
import { notify } from '#lib/server/notify.js';
import { pushConfigured } from '#lib/server/push.js';
import { getGeofence, saveGeofence } from '#lib/server/geofence.js';
import { isValidPoint } from '#lib/geo.js';
import { PALETTE, checkPassword, checkUsername, str } from '#lib/server/validate.js';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const me = requireOwner(locals);
	// 先讓 layout 算完未讀數，再把通知標成已讀
	await parent();

	const [people, deviceRows, feed, templates, [self], subs, fence] = await Promise.all([
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
		db
			.select({
				id: notifications.id,
				kind: notifications.kind,
				text: notifications.text,
				createdAt: notifications.createdAt,
				color: employees.color
			})
			.from(notifications)
			.leftJoin(employees, eq(notifications.employeeId, employees.id))
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(30),
		db.select().from(shiftTemplates),
		db.select({ seen: employees.seenNotificationId }).from(employees).where(eq(employees.id, me.id)),
		db.select({ employeeId: pushSubscriptions.employeeId }).from(pushSubscriptions),
		getGeofence()
	]);

	const seen = self?.seen ?? 0;
	const newest = Math.max(0, ...feed.map((f) => f.id));
	if (newest > seen) {
		await db.update(employees).set({ seenNotificationId: newest }).where(eq(employees.id, me.id));
	}

	return {
		people: people.map((p) => ({
			...p,
			devices: deviceRows.filter((d) => d.employeeId === p.id),
			templates: templates.filter((t) => t.employeeId === p.id),
			/** 開了幾台裝置的推播通知 */
			pushDevices: subs.filter((x) => x.employeeId === p.id).length
		})),
		feed: feed.map((f) => ({ ...f, unread: f.id > seen })),
		pushReady: pushConfigured(),
		fence,
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
	unbind: async ({ request, locals }) => {
		requireOwner(locals);
		const emp = await getEmployee(Number((await request.formData()).get('id')));
		await revokeDevices(emp.id, 'transfer');
		return { scope: 'edit', ok: `已解除 ${emp.name} 的手機綁定，請他用新手機登入` };
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

	/** 打卡範圍：店家座標 + 半徑，員工要在範圍內才能打卡 */
	saveFence: async ({ request, locals }) => {
		const me = requireOwner(locals);
		const form = await request.formData();
		const enabled = form.get('enabled') === 'on';
		// 座標可以是「用我現在的位置」帶進來的，也可以貼 Google 地圖的「25.0330, 121.5654」
		const [lat, lng] = str(form, 'coords').split(/[,，\s]+/).filter(Boolean).map(Number);
		const radius = Math.min(2000, Math.max(30, Math.round(Number(str(form, 'radius')) || 150)));
		const point = { lat, lng };
		if (enabled && !isValidPoint(point)) {
			return fail(400, { scope: 'fence', message: '店家座標不正確，請在店裡按「用我現在的位置」，或貼上 Google 地圖的座標' });
		}
		const current = await getGeofence();
		await saveGeofence({ enabled, radius, ...(isValidPoint(point) ? point : { lat: current.lat, lng: current.lng }) });
		await notify('staff', null, enabled ? `打卡範圍已開啟（店家 ${radius} 公尺內）` : '打卡範圍已關閉', { actorId: me.id, title: '📍 打卡範圍' });
		return { scope: 'fence', ok: enabled ? `已開啟：員工要在店家 ${radius} 公尺內才能打卡` : '已關閉打卡範圍，任何地方都能打卡' };
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
