import { fail } from '@sveltejs/kit';
import { and, asc, between, desc, eq, gte, inArray } from 'drizzle-orm';
import { db, employees, leaveRequests, shifts } from './db';
import { notify } from './notify';
import { fmtDay, localDay } from '#lib/time.js';

// 請假申請：員工在月曆上按「我要請假」→ 推播給老闆 → 老闆核准或駁回 → 推播回員工。
// 核准後那天的班標成請假（不用打卡、不算缺勤、不計薪）。

export type LeaveRequest = {
	id: number;
	employeeId: number;
	day: string;
	reason: string | null;
	status: 'pending' | 'approved' | 'rejected';
};

const columns = {
	id: leaveRequests.id,
	employeeId: leaveRequests.employeeId,
	day: leaveRequests.day,
	reason: leaveRequests.reason,
	status: leaveRequests.status
};

/** 月曆用：這段期間的申請（員工只看得到自己的） */
export function leaveRequestsBetween(from: string, to: string, onlyEmployee?: number): Promise<LeaveRequest[]> {
	const range = between(leaveRequests.day, from, to);
	return db
		.select(columns)
		.from(leaveRequests)
		.where(onlyEmployee ? and(range, eq(leaveRequests.employeeId, onlyEmployee)) : range)
		.orderBy(desc(leaveRequests.id));
}

/** 管理分頁用：還沒審的申請 */
export function pendingLeaveRequests() {
	return db
		.select({ ...columns, name: employees.name, color: employees.color })
		.from(leaveRequests)
		.innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
		.where(and(eq(leaveRequests.status, 'pending'), gte(leaveRequests.day, localDay())))
		.orderBy(asc(leaveRequests.day), asc(leaveRequests.id));
}

export async function requestLeave(user: App.User, day: string, reason: string | null) {
	if (day < localDay()) return fail(400, { message: '已經過去的日子不能請假' });
	const [shift] = await db
		.select({ id: shifts.id, leave: shifts.leave })
		.from(shifts)
		.where(and(eq(shifts.employeeId, user.id), eq(shifts.day, day)));
	if (!shift) return fail(400, { message: '這天沒有你的班' });
	if (shift.leave) return fail(400, { message: '這天已經是請假了' });
	const [pending] = await db
		.select({ id: leaveRequests.id })
		.from(leaveRequests)
		.where(and(eq(leaveRequests.employeeId, user.id), eq(leaveRequests.day, day), eq(leaveRequests.status, 'pending')));
	if (pending) return fail(400, { message: '這天已經申請過了，等老闆審核' });

	await db.insert(leaveRequests).values({ employeeId: user.id, day, reason, createdAt: new Date() });
	await notify('leave', user.id, `${user.name} 申請 ${fmtDay(day)} 請假${reason ? `：${reason}` : ''}，等你核准`, {
		title: '🏖️ 請假申請',
		actorId: user.id
	});
	return { requested: true };
}

export async function cancelLeave(user: App.User, id: number) {
	const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
	if (!row || row.employeeId !== user.id || row.status !== 'pending') return { cancelled: true };
	await db.delete(leaveRequests).where(eq(leaveRequests.id, id));
	await notify('leave', user.id, `${user.name} 取消了 ${fmtDay(row.day)} 的請假申請`, { title: '🏖️ 請假申請取消', actorId: user.id });
	return { cancelled: true };
}

export async function decideLeave(owner: App.User, id: number, approve: boolean) {
	const [row] = await db
		.select({ ...columns, name: employees.name })
		.from(leaveRequests)
		.innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
		.where(eq(leaveRequests.id, id));
	if (!row) return fail(404, { message: '找不到這筆申請' });
	if (row.status !== 'pending') return fail(400, { message: '這筆申請已經審核過了' });

	await db
		.update(leaveRequests)
		.set({ status: approve ? 'approved' : 'rejected', decidedBy: owner.id, decidedAt: new Date() })
		.where(eq(leaveRequests.id, id));
	if (approve) {
		// 動過的班不算自動排的，之後改固定班也不會把請假蓋掉
		await db
			.update(shifts)
			.set({ leave: true, fromTemplate: false, ...(row.reason ? { note: row.reason } : {}) })
			.where(and(eq(shifts.employeeId, row.employeeId), eq(shifts.day, row.day)));
	}

	const verdict = approve ? '核准' : '駁回';
	await notify('leave', row.employeeId, `${owner.name} ${verdict}了 ${row.name} ${fmtDay(row.day)} 的請假`, {
		title: approve ? '🏖️ 請假已核准' : '🏖️ 請假被駁回',
		actorId: owner.id,
		toEmployee: {
			title: approve ? '🏖️ 請假核准了' : '🏖️ 請假沒有通過',
			body: approve ? `${fmtDay(row.day)} 請假，這天不用打卡` : `${fmtDay(row.day)} 還是要上班喔`,
			url: '/schedule',
			tag: `leave-${row.day}`
		}
	});
	return { decided: true };
}

/** 員工被刪掉班時，順便收掉那天還沒審的申請 */
export async function dropPendingLeave(employeeId: number, days: string[]) {
	if (!days.length) return;
	await db
		.delete(leaveRequests)
		.where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, 'pending'), inArray(leaveRequests.day, days)));
}
