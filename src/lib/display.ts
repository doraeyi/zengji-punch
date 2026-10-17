// 畫面上共用的小工具（前後端都可用）

/** 月曆格子很窄，名字只放兩個字：周冠穎 → 冠穎、老闆娘 → 闆娘 */
export function shortName(name: string): string {
	return name.length >= 3 ? name.slice(-2) : name;
}

/** '16:00:00' → '16'、'16:30:00' → '16:30' */
export function shortTime(t: string): string {
	return t.slice(3, 5) === '00' ? String(Number(t.slice(0, 2))) : t.slice(0, 5);
}

/** 分鐘 → '3.5' 小時（最多一位小數） */
export function hours(minutes: number): string {
	return String(Math.round((minutes / 60) * 10) / 10);
}

/** 月曆格子放不下長名稱，用大家習慣的簡稱；點開那天會顯示全名 */
const HOLIDAY_SHORT: Record<string, string> = {
	開國紀念日: '元旦',
	和平紀念日: '228',
	農曆除夕: '除夕',
	行憲紀念日: '行憲紀念'
};
export function shortHoliday(name: string): string {
	return HOLIDAY_SHORT[name] ?? name;
}
