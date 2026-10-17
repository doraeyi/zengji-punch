import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db, punches, shifts } from './db';
import { notify } from './notify';
import { checkFence, getGeofence } from './geofence';
import { addDays, fmtDay, fmtTime, hhmm, localDay, shiftWindow, taipeiDate } from '#lib/time.js';

// 打卡規則：每天「最早一筆 = 上班卡、最晚一筆 = 下班卡」，中間多按的不影響。
// 所以員工不用記自己按到第幾下，下班後再按一次就會更新下班時間。

/** 同一個人一分鐘內連按，視為手滑 */
const DOUBLE_TAP_MS = 60 * 1000;

/** 某人某天（台灣時間）的所有打卡，依時間排序 */
export async function dayPunches(employeeId: number, day: string) {
	return db
		.select({ id: punches.id, at: punches.at, source: punches.source })
		.from(punches)
		.where(and(eq(punches.employeeId, employeeId), gte(punches.at, taipeiDate(day)), lt(punches.at, taipeiDate(addDays(day, 1)))))
		.orderBy(asc(punches.at));
}

/** 今天的上班卡（最早）與下班卡（最晚，至少要兩筆才算） */
export function firstLast(list: { at: Date }[]) {
	return { first: list[0]?.at ?? null, last: list.length > 1 ? list.at(-1)!.at : null };
}

/** 某人某天的班（取第一個） */
export async function shiftOn(employeeId: number, day: string) {
	const [row] = await db
		.select({ startTime: shifts.startTime, endTime: shifts.endTime, leave: shifts.leave })
		.from(shifts)
		.where(and(eq(shifts.employeeId, employeeId), eq(shifts.day, day)))
		.limit(1);
	return row ?? null;
}

export type PunchOutcome =
	| { ok: true; kind: 'in' | 'out'; at: Date; notified: number; updated: boolean }
	| { ok: false; message: string };

export async function punch(
	user: { id: number; name: string; role: 'owner' | 'staff' },
	deviceId: number | null,
	/** 手機當下的定位；有開打卡範圍時，員工一定要在店家附近 */
	position: { lat?: number; lng?: number; accuracy?: number } = {}
): Promise<PunchOutcome> {
	const fence = checkFence(await getGeofence(), user.role, position);
	if (!fence.ok) return { ok: false, message: fence.message };

	const at = new Date();
	at.setMilliseconds(0);
	const day = localDay(at);
	const today = await dayPunches(user.id, day);
	const last = today.at(-1);

	if (last && at.getTime() - last.at.getTime() < DOUBLE_TAP_MS) {
		return { ok: false, message: '剛剛已經打過卡了' };
	}

	// 今天第一下是上班卡，之後每一下都是（更新）下班卡
	const kind = today.length ? 'out' : 'in';

	// 員工不能早於班表的下班時間打下班卡；要提早走得先請老闆改班表或登記請假
	if (kind === 'out' && user.role === 'staff') {
		const shift = await shiftOn(user.id, day);
		if (shift && !shift.leave) {
			const { end } = shiftWindow(day, shift.startTime, shift.endTime);
			if (at < end) {
				return {
					ok: false,
					message: `今天排班到 ${hhmm(shift.endTime)}，還不能打下班卡。要提早走請找老闆改班表或登記請假。`
				};
			}
		}
	}

	await db.insert(punches).values({ employeeId: user.id, kind, at, deviceId, source: 'app', distance: fence.distance });

	const updated = today.length > 1; // 已經有下班卡，這次是更新
	const label = kind === 'in' ? '上班' : updated ? '下班（更新）' : '下班';
	const isStaff = user.role === 'staff';
	// 老闆一定收到；員工自己也收到一則當收據
	const notified = await notify('punch', user.id, `${user.name} ${label}打卡 ${fmtTime(at)}`, {
		title: `${kind === 'in' ? '🟢' : '⚪'} ${label}打卡`,
		actorId: isStaff ? null : user.id,
		toEmployee: isStaff
			? { title: `✅ ${label}打卡成功`, body: `${fmtDay(day)} ${fmtTime(at)}，已通知老闆`, url: '/schedule', tag: 'punch-self' }
			: undefined
	});
	return { ok: true, kind, at, notified, updated };
}
