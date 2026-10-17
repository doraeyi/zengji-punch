import { eq } from 'drizzle-orm';
import { db, settings } from './db';

// 台灣節日：資料來自行政院人事行政總處「政府行政機關辦公日曆表」
// （透過開源整理 github.com/ruyut/TaiwanCalendar，以 jsDelivr 取得），每年一份。
// 抓下來存進 settings 表當快取，一週更新一次；抓不到就用快取或固定日期的備援。

export type Holiday = {
	name: string;
	/** 勞基法的國定假日：上班要給雙倍工資（補假、小年夜這類只有公家機關放的不算） */
	double: boolean;
};
export type HolidayMap = Record<string, Holiday>;

const SOURCE = (year: number) => `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;
const REFRESH_MS = 7 * 24 * 3600 * 1000;

/** 只有公家機關放、不屬於勞基法國定假日的名稱 */
const NOT_LABOR_HOLIDAY = /補假|小年夜|調整|補行/;

/** 抓不到資料時的備援：國曆固定日期的國定假日（農曆節日沒辦法用固定日期） */
const FIXED: [string, string][] = [
	['01-01', '開國紀念日'],
	['02-28', '和平紀念日'],
	['04-04', '兒童節'],
	['05-01', '勞動節'],
	['09-28', '教師節'],
	['10-10', '國慶日'],
	['10-25', '光復節'],
	['12-25', '行憲紀念日']
];

function fallback(year: number): HolidayMap {
	return Object.fromEntries(FIXED.map(([md, name]) => [`${year}-${md}`, { name, double: true }]));
}

type Cached = { fetchedAt: number; days: HolidayMap };
const memory = new Map<number, Cached>();

async function fetchYear(year: number): Promise<HolidayMap> {
	const res = await fetch(SOURCE(year), { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const rows = (await res.json()) as { date: string; isHoliday: boolean; description: string }[];
	const days: HolidayMap = {};
	for (const r of rows) {
		if (!r.isHoliday || !r.description) continue; // 一般週末沒有名稱，不用記
		const day = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
		// 名稱太長的縮短，月曆格子放得下
		const name = r.description.replace('孔子誕辰紀念日/', '').replace('臺灣光復暨金門古寧頭大捷紀念日', '光復節');
		days[day] = { name, double: !NOT_LABOR_HOLIDAY.test(r.description) };
	}
	if (!Object.keys(days).length) throw new Error('empty');
	return days;
}

/** 某一年的節日（有快取） */
export async function holidaysOf(year: number): Promise<HolidayMap> {
	const now = Date.now();
	const mem = memory.get(year);
	if (mem && now - mem.fetchedAt < REFRESH_MS) return mem.days;

	const key = `holidays:${year}`;
	const [row] = await db.select().from(settings).where(eq(settings.key, key));
	const stored = row?.value as Cached | undefined;
	if (stored && now - stored.fetchedAt < REFRESH_MS) {
		memory.set(year, stored);
		return stored.days;
	}

	try {
		const days = await fetchYear(year);
		const value: Cached = { fetchedAt: now, days };
		await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
		memory.set(year, value);
		return days;
	} catch (err) {
		console.warn(`[holidays] ${year} 抓取失敗，改用${stored ? '舊的快取' : '固定日期備援'}`, (err as Error).message);
		const days = stored?.days ?? fallback(year);
		// 失敗時一小時後再試，不要每個請求都去打
		memory.set(year, { fetchedAt: now - REFRESH_MS + 3600 * 1000, days });
		return days;
	}
}

/** 某段日期內的節日 */
export async function holidaysBetween(from: string, to: string): Promise<HolidayMap> {
	const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
	const all: HolidayMap = {};
	for (const y of years) Object.assign(all, await holidaysOf(y));
	return Object.fromEntries(Object.entries(all).filter(([d]) => d >= from && d <= to));
}

// ── 國定假日雙倍薪（老闆可以在後台關掉）──
const DOUBLE_KEY = 'holidayDoublePay';

export async function holidayDoublePay(): Promise<boolean> {
	const [row] = await db.select().from(settings).where(eq(settings.key, DOUBLE_KEY));
	return row ? row.value === true : true;
}

export async function setHolidayDoublePay(on: boolean) {
	await db.insert(settings).values({ key: DOUBLE_KEY, value: on }).onDuplicateKeyUpdate({ set: { value: on } });
}
