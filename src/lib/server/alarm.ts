import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { CRON_SECRET, VAPID_PRIVATE_KEY } from '$app/env/private';
import { db, shifts } from './db';
import { ensureTemplateShifts } from './templates';
import { addDays, fmtTime, localDay, shiftWindow } from '#lib/time.js';

// 上班鬧鐘：員工的手機（iPhone 捷徑自動化、Android MacroDroid）每天打開自己的鬧鐘網址，
// 拿到「下一班幾點要響」，再把同一個鬧鐘改成那個時間。網址帶一組只屬於這位員工的密碼，不用登入。

/** 往後找多久內的班；晚上跑自動化時要找得到隔天的班 */
const LOOKAHEAD_MS = 36 * 60 * 60 * 1000;
export const ALARM_OFFSETS = [0, 5, 10, 15, 30, 45, 60, 90, 120];

function secret() {
	const key = VAPID_PRIVATE_KEY || CRON_SECRET;
	return key ? `alarm:${key}` : null;
}

/** 這位員工鬧鐘網址的密碼；伺服器沒有設定密鑰時回傳 null（功能關閉） */
export function alarmToken(employeeId: number) {
	const key = secret();
	return key ? createHmac('sha256', key).update(String(employeeId)).digest('base64url').slice(0, 22) : null;
}

export function checkAlarmToken(employeeId: number, token: string) {
	const expected = alarmToken(employeeId);
	if (!expected || token.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/** 下一個還沒開始的班（36 小時內），以及提前 before 分鐘的鬧鐘時間；沒有班回傳 null */
export async function nextAlarm(employeeId: number, before: number, now = new Date()) {
	await ensureTemplateShifts();
	const today = localDay(now);
	const rows = await db
		.select({ day: shifts.day, startTime: shifts.startTime, endTime: shifts.endTime })
		.from(shifts)
		.where(and(eq(shifts.employeeId, employeeId), eq(shifts.leave, false), gte(shifts.day, today), lte(shifts.day, addDays(today, 2))))
		.orderBy(asc(shifts.day), asc(shifts.startTime));
	for (const s of rows) {
		const { start } = shiftWindow(s.day, s.startTime, s.endTime);
		const ring = new Date(start.getTime() - before * 60000);
		if (ring > now && start.getTime() - now.getTime() <= LOOKAHEAD_MS) {
			return { day: s.day, start, ring, time: fmtTime(ring), shiftTime: fmtTime(start) };
		}
	}
	return null;
}
