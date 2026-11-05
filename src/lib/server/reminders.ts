import { and, eq, inArray } from 'drizzle-orm';
import { db, employees, reminders, shifts } from './db';
import { notify } from './notify';
import { pushTo } from './push';
import { remindPrefsOf } from './alarm';
import { dayPunches, workDay } from './punch';
import { ensureTemplateShifts } from './templates';
import { addDays, fmtDay, fmtTime, hhmm, localDay, shiftWindow } from '#lib/time.js';

/** 班表上班時間過了幾分鐘還沒打卡，就提醒員工 */
export const MISSING_IN_AFTER_MIN = 5;

/**
 * 搶一個「這個人、這天、這種提醒」的名額；已經送過就回傳 false。
 * 靠資料庫的唯一索引，伺服器重啟或同時跑兩份也不會重複發。
 */
async function claim(employeeId: number, day: string, kind: 'pre-shift' | 'missing-in' | 'missing-out') {
	try {
		await db.insert(reminders).values({ employeeId, day, kind, sentAt: new Date() });
		return true;
	} catch (err) {
		// drizzle 可能把 mysql2 的錯誤包在 cause 裡
		const e = err as { code?: string; cause?: { code?: string } };
		if (e.code === 'ER_DUP_ENTRY' || e.cause?.code === 'ER_DUP_ENTRY') return false;
		throw err;
	}
}


/** 每分鐘跑一次：檢查忘記上班卡、半夜還沒下班卡 */
export async function runReminders(now = new Date()) {
	const today = localDay(now);
	const yesterday = addDays(today, -1);
	// 先確定今天的固定班已經排進來，忘記打卡的提醒才抓得到
	await ensureTemplateShifts();

	// ⓪ 上班前提醒：照每個人選的「提前幾分鐘」推播給員工本人（明天凌晨的班也可能要今天提醒）
	const upcoming = await db
		.select({ employeeId: shifts.employeeId, day: shifts.day, startTime: shifts.startTime, endTime: shifts.endTime })
		.from(shifts)
		.innerJoin(employees, eq(shifts.employeeId, employees.id))
		.where(
			and(inArray(shifts.day, [today, addDays(today, 1)]), eq(shifts.leave, false), eq(employees.role, 'staff'), eq(employees.active, true))
		);
	const prefs = await remindPrefsOf([...new Set(upcoming.map((s) => s.employeeId))]);
	for (const s of upcoming) {
		const { before: mins, push } = prefs.get(s.employeeId)!;
		if (!push) continue;
		const { start } = shiftWindow(s.day, s.startTime, s.endTime);
		if (now < new Date(start.getTime() - mins * 60000) || now >= start) continue;
		if ((await dayPunches(s.employeeId, s.day)).length) continue;
		if (!(await claim(s.employeeId, s.day, 'pre-shift'))) continue;

		await pushTo([s.employeeId], {
			title: mins ? `🌶️ ${mins >= 60 ? `${mins / 60} 小時` : `${mins} 分鐘`}後要上班` : '🌶️ 上班時間到了',
			body: `${s.day === today ? '今天' : '明天'} ${hhmm(s.startTime)}–${hhmm(s.endTime)} 有班，到店記得打卡`,
			url: '/',
			tag: `pre-shift-${s.day}`
		});
	}

	// ① 今天有班（沒請假）、上班時間過了 5 分鐘還沒打卡 → 提醒員工本人
	const todayShifts = await db
		.select({
			employeeId: shifts.employeeId,
			startTime: shifts.startTime,
			endTime: shifts.endTime,
			name: employees.name
		})
		.from(shifts)
		.innerJoin(employees, eq(shifts.employeeId, employees.id))
		.where(and(eq(shifts.day, today), eq(shifts.leave, false), eq(employees.role, 'staff'), eq(employees.active, true)));

	for (const s of todayShifts) {
		const { start, end } = shiftWindow(today, s.startTime, s.endTime);
		const remindAt = new Date(start.getTime() + MISSING_IN_AFTER_MIN * 60000);
		if (now < remindAt || now >= end) continue;
		if ((await dayPunches(s.employeeId, today)).length) continue;
		if (!(await claim(s.employeeId, today, 'missing-in'))) continue;

		await notify('remind', s.employeeId, `${s.name} 今天 ${hhmm(s.startTime)} 的班，到 ${fmtTime(remindAt)} 還沒打上班卡（已提醒他）`, {
			pushOwners: false,
			toEmployee: {
				title: '⏰ 是不是忘記打上班卡了？',
				body: `今天 ${hhmm(s.startTime)}–${hhmm(s.endTime)} 有班，到店了記得按打卡`,
				url: '/',
				tag: `missing-in-${today}`
			}
		});
	}

	// ② 過了晚上 12 點，昨天只有上班卡、沒有下班卡 → 通知老闆和員工本人
	const staff = await db
		.select({ id: employees.id, name: employees.name })
		.from(employees)
		.where(and(eq(employees.role, 'staff'), eq(employees.active, true)));

	for (const p of staff) {
		// 昨天的班做到半夜、還在下班後的寬限時間內，先不提醒
		if ((await workDay(p.id, now)) === yesterday) continue;
		const list = await dayPunches(p.id, yesterday);
		if (list.length !== 1) continue;
		if (!(await claim(p.id, yesterday, 'missing-out'))) continue;

		const inAt = fmtTime(list[0].at);
		await notify('remind', p.id, `${p.name} ${fmtDay(yesterday)} 沒打下班卡（上班 ${inAt}），請補登下班時間`, {
			title: '⚠️ 沒打下班卡',
			toEmployee: {
				title: '⚠️ 昨天忘記打下班卡',
				body: `${fmtDay(yesterday)} 只有上班卡 ${inAt}，請跟老闆說幾點下班，讓他幫你補登`,
				url: '/schedule',
				tag: `missing-out-${yesterday}`
			}
		});
	}
}

/** 在伺服器裡每分鐘跑一次（開發模式熱更新時不會重複開多個計時器） */
export function startReminderLoop() {
	const g = globalThis as { __zjReminderTimer?: ReturnType<typeof setInterval> };
	if (g.__zjReminderTimer) clearInterval(g.__zjReminderTimer);
	const tick = () => runReminders().catch((err) => console.error('[reminders] failed', err));
	g.__zjReminderTimer = setInterval(tick, 60 * 1000);
	setTimeout(tick, 5000);
}
