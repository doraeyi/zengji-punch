// 店家在台灣，所有顯示與「哪一天」的判斷都以台灣時間為準。
export const TZ = 'Asia/Taipei';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const partsFmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

function parts(d: Date) {
	const p: Record<string, string> = {};
	for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
	return p;
}

/** 台灣時間的日期字串 YYYY-MM-DD */
export function localDay(d: Date = new Date()): string {
	const p = parts(d);
	return `${p.year}-${p.month}-${p.day}`;
}

/** 台灣時間 HH:MM */
export function fmtTime(d: Date): string {
	const p = parts(d);
	return `${p.hour}:${p.minute}`;
}

/** 台灣時間 HH:MM:SS */
export function fmtClock(d: Date): string {
	const p = parts(d);
	return `${p.hour}:${p.minute}:${p.second}`;
}

/** 'YYYY-MM-DD' → 該日是星期幾（0 = 日） */
export function weekdayOf(day: string): number {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayLabel(day: string): string {
	return WEEKDAYS[weekdayOf(day)];
}

/** 'YYYY-MM-DD' → '10/16（四）' */
export function fmtDay(day: string, withWeekday = true): string {
	const [, m, d] = day.split('-').map(Number);
	return withWeekday ? `${m}/${d}（${weekdayLabel(day)}）` : `${m}/${d}`;
}

export function addDays(day: string, n: number): string {
	const [y, m, d] = day.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return t.toISOString().slice(0, 10);
}

/** 該週的星期一 */
export function weekStart(day: string): string {
	const wd = weekdayOf(day);
	return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function isDay(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 'HH:MM:SS' → 'HH:MM' */
export function hhmm(t: string): string {
	return t.slice(0, 5);
}

/** 分鐘數 → '7 小時 30 分' */
export function fmtDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (h === 0) return `${m} 分`;
	return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

export function fmtMoney(n: number): string {
	return `$${n.toLocaleString('en-US')}`;
}

/** 台灣沒有日光節約時間，固定 UTC+8 */
export const TZ_OFFSET = '+08:00';

/** 台灣當地的 日期 + 時間 → Date */
export function taipeiDate(day: string, time = '00:00'): Date {
	return new Date(`${day}T${time.length === 5 ? `${time}:00` : time}${TZ_OFFSET}`);
}

/** 'YYYY-MM' → 該月所有日期 */
export function monthDays(month: string): string[] {
	const [y, m] = month.split('-').map(Number);
	const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function addMonths(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1 + n, 1));
	return t.toISOString().slice(0, 7);
}

export function isMonth(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

/** 班次的起訖 Date；下班時間早於上班時間代表跨夜，下班算隔天 */
export function shiftWindow(day: string, startTime: string, endTime: string) {
	const start = taipeiDate(day, startTime);
	let end = taipeiDate(day, endTime);
	if (end <= start) end = taipeiDate(addDays(day, 1), endTime);
	return { start, end };
}
