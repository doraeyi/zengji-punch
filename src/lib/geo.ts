// 打卡範圍（地理圍欄）的共用計算，前後端用同一套規則判斷

export type Point = { lat: number; lng: number };

export type Geofence = Point & {
	enabled: boolean;
	/** 允許打卡的半徑（公尺） */
	radius: number;
};

/** 手機定位誤差最多幫忙抵掉這麼多公尺，室內 GPS 常常飄 */
const MAX_ACCURACY_SLACK = 50;

/** 兩點距離（公尺），haversine 公式 */
export function distanceMeters(a: Point, b: Point): number {
	const R = 6371000;
	const rad = (d: number) => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** 在不在打卡範圍內：距離扣掉定位誤差（最多 50 公尺）後要在半徑內 */
export function insideFence(distance: number, accuracy: number, radius: number): boolean {
	return distance - Math.min(Math.max(accuracy, 0), MAX_ACCURACY_SLACK) <= radius;
}

export function fmtDistance(m: number): string {
	return m < 1000 ? `${Math.round(m)} 公尺` : `${(m / 1000).toFixed(1)} 公里`;
}

export function isValidPoint(p: Partial<Point>): p is Point {
	return (
		typeof p.lat === 'number' &&
		typeof p.lng === 'number' &&
		Number.isFinite(p.lat) &&
		Number.isFinite(p.lng) &&
		Math.abs(p.lat) <= 90 &&
		Math.abs(p.lng) <= 180
	);
}
