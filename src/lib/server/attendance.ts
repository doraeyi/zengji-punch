import { and, asc, between, eq, gte, lt, lte } from 'drizzle-orm';
import { db, employees, payouts, punches, shifts } from './db';
import { addDays, localDay, shiftWindow, taipeiDate } from '#lib/time.js';

/** 晚幾分鐘以上才算遲到 */
const LATE_GRACE_MIN = 5;

export type PunchRow = { id: number; kind: 'in' | 'out'; at: Date; source: string; distance: number | null };
/** 一天只有一段：最早一筆是上班卡、最晚一筆是下班卡；只有一筆時 out 為 null */
export type Session = { in: PunchRow | null; out: PunchRow | null; minutes: number; paidMinutes: number };
export type DayRecord = {
	day: string;
	shift: { id: number; startTime: string; endTime: string; leave: boolean; note: string | null } | null;
	sessions: Session[];
	/** 中間多按的打卡（不影響計算，只是讓老闆看得到） */
	extra: PunchRow[];
	/** 實際打卡的總分鐘數 */
	minutes: number;
	/** 計薪分鐘數（早到不算，晚走照算） */
	paidMinutes: number;
	/** 當天薪資（元） */
	amount: number;
	lateMinutes: number;
	/** 這天被哪一筆發薪紀錄涵蓋（已領） */
	payoutId: number | null;
	status: 'ok' | 'late' | 'missing-out' | 'absent' | 'off' | 'upcoming' | 'leave' | 'working';
};

/**
 * 某位員工在 [from, to] 這幾天（含）的出勤與薪資。
 *
 * 每天以「最早一筆 = 上班卡、最晚一筆 = 下班卡」計算，中間多按的不影響。
 * 計薪規則：
 * - 有排班時，比班表早到的時間不算，從班表上班時間起算；遲到就從實際打卡時間算。
 * - 下班照實際打卡時間算（例如排 16:00–19:00、19:30 下班 → 3.5 小時）。
 * - 沒排班卻有打卡，照實際時間算。
 * - 還沒打下班卡的那段先不算錢。
 */
export async function attendance(employeeId: number, from: string, to: string): Promise<DayRecord[]> {
	const [punchRows, shiftRows, payoutRows, [emp]] = await Promise.all([
		db
			.select({ id: punches.id, kind: punches.kind, at: punches.at, source: punches.source, distance: punches.distance })
			.from(punches)
			.where(
				and(
					eq(punches.employeeId, employeeId),
					gte(punches.at, taipeiDate(from)),
					lt(punches.at, taipeiDate(addDays(to, 1)))
				)
			)
			.orderBy(asc(punches.at)),
		db
			.select({
				id: shifts.id,
				day: shifts.day,
				startTime: shifts.startTime,
				endTime: shifts.endTime,
				leave: shifts.leave,
				note: shifts.note
			})
			.from(shifts)
			.where(and(eq(shifts.employeeId, employeeId), between(shifts.day, from, to)))
			.orderBy(asc(shifts.startTime)),
		db
			.select({ id: payouts.id, periodStart: payouts.periodStart, periodEnd: payouts.periodEnd })
			.from(payouts)
			.where(and(eq(payouts.employeeId, employeeId), lte(payouts.periodStart, to), gte(payouts.periodEnd, from))),
		db.select({ wage: employees.hourlyWage, role: employees.role }).from(employees).where(eq(employees.id, employeeId))
	]);
	const wage = emp?.wage ?? 0;
	// 老闆 / 老闆娘排了班但不一定打卡，沒打卡不算缺勤
	const isOwner = emp?.role === 'owner';

	// 依台灣日期分組
	const byDay = new Map<string, PunchRow[]>();
	for (const p of punchRows) {
		const d = localDay(p.at);
		byDay.set(d, [...(byDay.get(d) ?? []), p]);
	}

	const now = new Date();
	const today = localDay(now);
	const days: DayRecord[] = [];
	for (let day = from; day <= to; day = addDays(day, 1)) {
		const shift = shiftRows.find((s) => s.day === day) ?? null;
		const window = shift ? shiftWindow(day, shift.startTime, shift.endTime) : null;
		const list = byDay.get(day) ?? [];
		const daySessions: Session[] = [];
		if (list.length) {
			const first = list[0];
			const last = list.length > 1 ? list.at(-1)! : null;
			const minutes = last ? Math.floor((last.at.getTime() - first.at.getTime()) / 60000) : 0;
			// 早到不算：從班表上班時間起算；晚走照實際下班卡算
			const start = window && first.at < window.start && !shift!.leave ? window.start : first.at;
			const paidMinutes = last ? Math.max(0, Math.floor((last.at.getTime() - start.getTime()) / 60000)) : 0;
			daySessions.push({ in: first, out: last, minutes, paidMinutes });
		}
		const extra = list.slice(1, -1);
		const minutes = daySessions.reduce((sum, s) => sum + s.minutes, 0);
		const paidMinutes = daySessions.reduce((sum, s) => sum + s.paidMinutes, 0);

		let lateMinutes = 0;
		const firstIn = daySessions.find((s) => s.in)?.in;
		if (window && firstIn && !shift!.leave) {
			const diff = Math.round((firstIn.at.getTime() - window.start.getTime()) / 60000);
			if (diff > LATE_GRACE_MIN) lateMinutes = diff;
		}

		const openToday = daySessions.some((s) => s.in && !s.out) && day === today;
		let status: DayRecord['status'];
		if (shift?.leave && !daySessions.length) status = 'leave';
		else if (openToday) status = 'working';
		else if (daySessions.some((s) => !s.in || !s.out)) status = 'missing-out';
		else if (daySessions.length) status = lateMinutes ? 'late' : 'ok';
		else if (!shift || isOwner) status = 'off';
		else status = window!.end < now ? 'absent' : 'upcoming';

		const payout = payoutRows.find((p) => p.periodStart <= day && day <= p.periodEnd);
		days.push({
			day,
			shift,
			sessions: daySessions,
			extra,
			minutes,
			paidMinutes,
			amount: Math.round((paidMinutes * wage) / 60),
			lateMinutes,
			payoutId: payout?.id ?? null,
			status
		});
	}
	return days;
}

export function summarize(days: DayRecord[]) {
	return {
		workDays: days.filter((d) => d.sessions.length).length,
		minutes: days.reduce((s, d) => s + d.minutes, 0),
		paidMinutes: days.reduce((s, d) => s + d.paidMinutes, 0),
		amount: days.reduce((s, d) => s + d.amount, 0),
		paidAmount: days.filter((d) => d.payoutId).reduce((s, d) => s + d.amount, 0),
		unpaidAmount: days.filter((d) => !d.payoutId).reduce((s, d) => s + d.amount, 0),
		late: days.filter((d) => d.lateMinutes > 0).length,
		issues: days.filter((d) => d.status === 'missing-out' || d.status === 'absent').length,
		leave: days.filter((d) => d.status === 'leave').length
	};
}
