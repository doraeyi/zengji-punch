import { eq } from 'drizzle-orm';
import { db, settings } from './db';
import { distanceMeters, insideFence, isValidPoint, fmtDistance, type Geofence } from '#lib/geo.js';

/** 曾記麻辣燙店面的位置（固定，不用在後台設定） */
export const STORE = { lat: 25.1477191, lng: 121.3990287 };

/** 打卡範圍一律開著，老闆只調半徑 */
const KEY = 'geofence';
const DEFAULT_RADIUS = 150;
export const RADIUS_MIN = 30;
export const RADIUS_MAX = 2000;

export async function getGeofence(): Promise<Geofence> {
	const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
	const radius = Number((row?.value as { radius?: number } | undefined)?.radius) || DEFAULT_RADIUS;
	return { enabled: true, ...STORE, radius };
}

export async function saveRadius(radius: number) {
	const value = { radius: Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(radius))) };
	await db.insert(settings).values({ key: KEY, value }).onDuplicateKeyUpdate({ set: { value } });
	return value.radius;
}

/** 打卡範圍有沒有作用在這個人身上：只管員工，老闆 / 老闆娘在哪都能打卡 */
export function fenceApplies(fence: Geofence, role: 'owner' | 'staff') {
	return fence.enabled && role === 'staff' && isValidPoint(fence);
}

export type FenceCheck = { ok: true; distance: number | null } | { ok: false; message: string };

/** 伺服器端再檢查一次手機送來的位置（前端按鈕鎖住不代表安全） */
export function checkFence(
	fence: Geofence,
	role: 'owner' | 'staff',
	position: { lat?: number; lng?: number; accuracy?: number }
): FenceCheck {
	if (!fenceApplies(fence, role)) return { ok: true, distance: null };
	const accuracy = position.accuracy ?? 0;
	if (!isValidPoint(position)) {
		return { ok: false, message: '抓不到你的位置，請允許定位後再打卡' };
	}
	const distance = distanceMeters(position, fence);
	if (!insideFence(distance, accuracy, fence.radius)) {
		return { ok: false, message: `你離店家還有 ${fmtDistance(distance)}，要在店家附近才能打卡` };
	}
	return { ok: true, distance: Math.round(distance) };
}
