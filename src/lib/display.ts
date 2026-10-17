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
