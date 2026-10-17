import { and, between, eq, gt, inArray } from 'drizzle-orm';
import { db, employees, settings, shiftTemplates, shifts } from './db';
import { addDays, addMonths, localDay, monthDays, weekdayOf } from '#lib/time.js';

// 固定班自動排進月曆：不用按按鈕。
// 每位員工記一個「已經排到哪一天」（settings 的 templateFill:<id>），
// 只往後補新的日子，所以老闆在月曆上刪掉或改掉某一天，不會被補回來。
// 老闆改了固定班時，明天以後還沒被手動改過的班會依新的固定班重排。

/** 最多往後排到幾天後（看很後面的月份時才會排到） */
const MAX_AHEAD_DAYS = 180;

const fillKey = (employeeId: number) => `templateFill:${employeeId}`;

/** 預設排到下個月底 */
export function defaultHorizon(today = localDay()) {
	return monthDays(addMonths(today.slice(0, 7), 1)).at(-1)!;
}

let running: Promise<void> = Promise.resolve();
let lastRun = { at: 0, end: '', day: '' };

/** 把固定班補到 until 這天（含）。同時有多個請求呼叫時會排隊，避免重複新增 */
export function ensureTemplateShifts(until?: string, force = false) {
	const today = localDay();
	const wanted = until && until > defaultHorizon(today) ? until : defaultHorizon(today);
	// 10 分鐘內已經排到這麼後面就不用再查資料庫
	if (!force && lastRun.day === today && Date.now() - lastRun.at < 10 * 60 * 1000 && wanted <= lastRun.end) {
		return running;
	}
	const job = running
		.then(() => fill(wanted))
		.then(() => {
			lastRun = { at: Date.now(), end: wanted, day: today };
		})
		.catch((err) => console.error('[templates] fill failed', err));
	running = job;
	return job;
}

async function fill(until?: string) {
	const today = localDay();
	const cap = addDays(today, MAX_AHEAD_DAYS);
	const target = [until ?? defaultHorizon(today), defaultHorizon(today)].sort().at(-1)!;
	const end = target > cap ? cap : target;

	const templates = await db
		.select({
			employeeId: shiftTemplates.employeeId,
			weekday: shiftTemplates.weekday,
			startTime: shiftTemplates.startTime,
			endTime: shiftTemplates.endTime
		})
		.from(shiftTemplates)
		.innerJoin(employees, eq(shiftTemplates.employeeId, employees.id))
		.where(eq(employees.active, true));
	if (!templates.length) return;

	const ids = [...new Set(templates.map((t) => t.employeeId))];
	const marks = await db
		.select()
		.from(settings)
		.where(inArray(settings.key, ids.map(fillKey)));
	const filledThrough = new Map(marks.map((m) => [Number(m.key.split(':')[1]), String(m.value)]));

	for (const id of ids) {
		const done = filledThrough.get(id);
		const start = done && done >= today ? addDays(done, 1) : today;
		// done 是昨天或更早 → 從今天開始排
		if (start > end) continue;

		const mine = templates.filter((t) => t.employeeId === id);
		const existing = await db
			.select({ day: shifts.day })
			.from(shifts)
			.where(and(eq(shifts.employeeId, id), between(shifts.day, start, end)));
		const taken = new Set(existing.map((e) => e.day));

		const rows = [];
		for (let day = start; day <= end; day = addDays(day, 1)) {
			const t = mine.find((x) => x.weekday === weekdayOf(day));
			if (t && !taken.has(day)) {
				rows.push({ employeeId: id, day, startTime: t.startTime, endTime: t.endTime, fromTemplate: true });
			}
		}
		if (rows.length) await db.insert(shifts).values(rows);
		await db
			.insert(settings)
			.values({ key: fillKey(id), value: end })
			.onDuplicateKeyUpdate({ set: { value: end } });
	}
}

/**
 * 老闆改了某人的固定班：明天以後、還是自動排的班先拿掉，再依新的固定班重排。
 * 今天的班不動（可能已經在上班了）；老闆手動改過的班也不動。
 */
export async function rebuildTemplateShifts(employeeId: number) {
	const today = localDay();
	await db
		.delete(shifts)
		.where(and(eq(shifts.employeeId, employeeId), eq(shifts.fromTemplate, true), gt(shifts.day, today)));
	// 今天還沒有班的話（例如第一次設定固定班），今天也依新的固定班排；今天已經有班就不動
	const [todayShift] = await db
		.select({ id: shifts.id })
		.from(shifts)
		.where(and(eq(shifts.employeeId, employeeId), eq(shifts.day, today)))
		.limit(1);
	const mark = todayShift ? today : addDays(today, -1);
	await db
		.insert(settings)
		.values({ key: fillKey(employeeId), value: mark })
		.onDuplicateKeyUpdate({ set: { value: mark } });
	await ensureTemplateShifts(undefined, true);
}
