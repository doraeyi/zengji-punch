import { fail } from '@sveltejs/kit';
import { asc, between, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, employees, punches, shifts } from '#lib/server/db/index.js';
import { attendance, summarize, type DayRecord } from '#lib/server/attendance.js';
import { canSchedule, requireOwner, requireScheduler } from '#lib/server/guard.js';
import { notify } from '#lib/server/notify.js';
import { ensureTemplateShifts } from '#lib/server/templates.js';
import { holidaysBetween } from '#lib/server/holidays.js';
import { str } from '#lib/server/validate.js';
import { fmtDay, hhmm, isDay, isMonth, localDay, monthDays, taipeiDate } from '#lib/time.js';

export const load: PageServerLoad = async ({ url, locals }) => {
	const me = locals.user!;
	const isOwner = me.role === 'owner';
	const monthParam = url.searchParams.get('month');
	const month = isMonth(monthParam) ? monthParam : localDay().slice(0, 7);
	const days = monthDays(month);
	const from = days[0];
	const to = days.at(-1)!;

	const staff = await db
		.select({ id: employees.id, name: employees.name, color: employees.color, role: employees.role, hourlyWage: employees.hourlyWage })
		.from(employees)
		.where(eq(employees.active, true))
		.orderBy(asc(employees.id));

	// 檢視對象：'all' = 全店班表；數字 = 某一個人（員工只能看自己）
	const whoParam = url.searchParams.get('who');
	let who: number | 'all' = isOwner ? 'all' : me.id;
	if (whoParam === 'all') who = 'all';
	else if (whoParam && isOwner && staff.some((s) => s.id === Number(whoParam))) who = Number(whoParam);

	// 固定班自動排進月曆（看未來的月份時會排到那個月底）
	await ensureTemplateShifts(to);

	const shiftRows = await db
		.select({
			id: shifts.id,
			employeeId: shifts.employeeId,
			day: shifts.day,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			note: shifts.note,
			leave: shifts.leave
		})
		.from(shifts)
		.where(between(shifts.day, from, to))
		.orderBy(asc(shifts.day), asc(shifts.startTime));

	// 打卡與薪資：老闆看得到所有人，員工只看得到自己
	const visible = isOwner ? staff.map((s) => s.id) : [me.id];
	const records: Record<number, DayRecord[]> = {};
	const [holidays] = await Promise.all([
		holidaysBetween(from, to),
		...visible.map(async (id) => (records[id] = await attendance(id, from, to)))
	]);

	const focus = who === 'all' ? null : who;
	return {
		month,
		today: localDay(),
		staff: staff.map(({ hourlyWage, ...s }) => ({ ...s, hourlyWage: isOwner || s.id === me.id ? hourlyWage : null })),
		who,
		shifts: shiftRows,
		records,
		summary: focus && records[focus] ? summarize(records[focus]) : null,
		holidays,
		/** 老闆或有排班權限的員工，月曆上會出現排班、修改、刪除的按鈕 */
		canEdit: canSchedule(me)
	};
};

const TIME_RE = /^\d{2}:\d{2}$/;

/** 有排班權限的員工只能動員工的班，不能改老闆 / 老闆娘的班 */
async function assertCanTouch(actor: App.User, employeeId: number) {
	if (actor.role === 'owner') return null;
	const [target] = await db.select({ role: employees.role }).from(employees).where(eq(employees.id, employeeId));
	return target?.role === 'owner' ? fail(403, { message: '不能修改老闆的班表' }) : null;
}

async function nameOf(id: number) {
	const [row] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, id));
	return row?.name ?? '';
}

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const owner = requireScheduler(locals);
		const form = await request.formData();
		const id = Number(form.get('id')) || null;
		const employeeId = Number(form.get('employeeId'));
		const day = str(form, 'day');
		const startTime = str(form, 'startTime');
		const endTime = str(form, 'endTime');
		const note = str(form, 'note').slice(0, 100) || null;
		const leave = form.get('leave') === 'on';

		if (!employeeId || !isDay(day) || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
			return fail(400, { message: '請選員工並填好日期與時間' });
		}
		const denied = await assertCanTouch(owner, employeeId);
		if (denied) return denied;
		if (id) {
			const [old] = await db.select({ employeeId: shifts.employeeId }).from(shifts).where(eq(shifts.id, id));
			const deniedOld = old ? await assertCanTouch(owner, old.employeeId) : null;
			if (deniedOld) return deniedOld;
		}
		// 在月曆上動過的班就不算「自動排的」，之後改固定班也不會蓋掉
		const values = { employeeId, day, startTime: `${startTime}:00`, endTime: `${endTime}:00`, note, leave, fromTemplate: false };
		if (id) await db.update(shifts).set(values).where(eq(shifts.id, id));
		else await db.insert(shifts).values(values);

		const name = await nameOf(employeeId);
		await notify(
			leave ? 'leave' : 'shift',
			employeeId,
			leave
				? `${owner.name} 登記 ${name} ${fmtDay(day)} 請假`
				: `${owner.name} ${id ? '修改' : '新增'}了 ${name} ${fmtDay(day)} ${startTime}–${endTime} 的班`,
			{
				title: leave ? '🏖️ 請假' : '📅 班表異動',
				actorId: owner.id,
				toEmployee: leave
					? { title: '🏖️ 已登記請假', body: `${fmtDay(day)} 請假${note ? `：${note}` : ''}，這天不用打卡`, url: '/schedule', tag: `shift-${day}` }
					: { title: '📅 你的班表有更新', body: `${fmtDay(day)} ${startTime}–${endTime}${note ? `（${note}）` : ''}`, url: '/schedule', tag: `shift-${day}` }
			}
		);
		return { saved: true };
	},

	remove: async ({ request, locals }) => {
		const owner = requireScheduler(locals);
		const id = Number((await request.formData()).get('id'));
		const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
		if (!row) return { removed: true };
		const denied = await assertCanTouch(owner, row.employeeId);
		if (denied) return denied;
		await db.delete(shifts).where(eq(shifts.id, id));
		await notify('shift', row.employeeId, `${owner.name} 刪除了 ${await nameOf(row.employeeId)} ${fmtDay(row.day)} ${hhmm(row.startTime)}–${hhmm(row.endTime)} 的班`, {
			title: '📅 班表異動',
			actorId: owner.id,
			toEmployee: { title: '📅 你的班被取消了', body: `${fmtDay(row.day)} ${hhmm(row.startTime)}–${hhmm(row.endTime)} 不用上班`, url: '/schedule', tag: `shift-${row.day}` }
		});
		return { removed: true };
	},

	/** 老闆補登打卡（員工忘了打） */
	addPunch: async ({ request, locals }) => {
		const owner = requireOwner(locals);
		const form = await request.formData();
		const employeeId = Number(form.get('employeeId'));
		const day = str(form, 'day');
		const time = str(form, 'time');
		const kind = str(form, 'kind');
		if (!employeeId || !isDay(day) || !TIME_RE.test(time) || (kind !== 'in' && kind !== 'out')) {
			return fail(400, { message: '補登資料不完整' });
		}
		await db.insert(punches).values({ employeeId, kind, at: taipeiDate(day, time), source: 'manual' });
		const label = kind === 'in' ? '上班' : '下班';
		await notify('punch', employeeId, `補登 ${await nameOf(employeeId)} ${fmtDay(day)} ${label} ${time}`, {
			title: '✍️ 補登打卡',
			actorId: owner.id,
			toEmployee: { title: '✍️ 老闆幫你補登了打卡', body: `${fmtDay(day)} ${label} ${time}`, url: '/schedule', tag: `fix-${day}` }
		});
		return { added: true };
	},

	deletePunch: async ({ request, locals }) => {
		requireOwner(locals);
		const id = Number((await request.formData()).get('id'));
		if (id) await db.delete(punches).where(eq(punches.id, id));
		return { deleted: true };
	}
};
