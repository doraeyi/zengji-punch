import { eq } from 'drizzle-orm';
import { db, settings } from './db';
import { distanceMeters, insideFence, isValidPoint, fmtDistance, type Geofence } from '#lib/geo.js';

const KEY = 'geofence';
const DEFAULT: Geofence = { enabled: false, lat: 0, lng: 0, radius: 150 };

export async function getGeofence(): Promise<Geofence> {
	const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
	const value = (row?.value ?? {}) as Partial<Geofence>;
	return { ...DEFAULT, ...value };
}

export async function saveGeofence(fence: Geofence) {
	await db
		.insert(settings)
		.values({ key: KEY, value: fence })
		.onDuplicateKeyUpdate({ set: { value: fence } });
}

/** 打卡範圍有沒有作用在這個人身上（只管員工，且店家位置要設定好） */
export function fenceApplies(fence: Geofence, role: 'owner' | 'staff') {
	return fence.enabled && role === 'staff' && isValidPoint(fence) && !(fence.lat === 0 && fence.lng === 0);
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
