import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db, devices, employees } from './db';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const DEVICE_COOKIE = 'zj_device';
/** 瀏覽器最多接受約 400 天的 cookie；每次造訪都會自動續期，所以實際上不會過期。 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scryptAsync(password, salt, 64);
	return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algo, saltB64, keyB64] = stored.split('$');
	if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
	const expected = Buffer.from(keyB64, 'base64');
	const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
	return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function setDeviceCookie(cookies: Cookies, token: string) {
	cookies.set(DEVICE_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: COOKIE_MAX_AGE
	});
}

export function clearDeviceCookie(cookies: Cookies) {
	cookies.delete(DEVICE_COOKIE, { path: '/' });
}

/** 用 cookie 裡的裝置 token 找出目前是誰。裝置被解除綁定或帳號停用都會回傳 null。 */
export async function resolveDevice(token: string) {
	const [row] = await db
		.select({
			deviceId: devices.id,
			lastSeenAt: devices.lastSeenAt,
			id: employees.id,
			name: employees.name,
			role: employees.role,
			color: employees.color
		})
		.from(devices)
		.innerJoin(employees, eq(devices.employeeId, employees.id))
		.where(
			and(eq(devices.tokenHash, sha256(token)), isNull(devices.revokedAt), eq(employees.active, true))
		)
		.limit(1);
	if (!row) return null;

	// 最後使用時間每小時更新一次就好，不必每個請求都寫資料庫
	if (Date.now() - row.lastSeenAt.getTime() > 60 * 60 * 1000) {
		await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, row.deviceId));
	}
	const { deviceId, lastSeenAt: _, ...user } = row;
	return { deviceId, user };
}

/** 從 User-Agent 猜一個好認的裝置名稱，給後台看「綁在哪支手機」用 */
export function deviceLabel(ua: string | null): string {
	if (!ua) return '未知裝置';
	const os = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? (ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\sBuild|\))/)?.[1] ?? 'Android')
				: /Windows/.test(ua)
					? 'Windows 電腦'
					: /Macintosh/.test(ua)
						? 'Mac'
						: '其他裝置';
	const browser = /Line\//.test(ua)
		? 'LINE 內建瀏覽器'
		: /CriOS|Chrome/.test(ua)
			? 'Chrome'
			: /Safari/.test(ua)
				? 'Safari'
				: /Firefox/.test(ua)
					? 'Firefox'
					: '';
	return [os, browser].filter(Boolean).join(' · ').slice(0, 120);
}

/** 建立一筆新的裝置綁定並寫入 cookie */
export async function bindDevice(cookies: Cookies, employeeId: number, ua: string | null) {
	const token = randomBytes(32).toString('base64url');
	const now = new Date();
	const [row] = await db
		.insert(devices)
		.values({
			employeeId,
			tokenHash: sha256(token),
			label: deviceLabel(ua),
			createdAt: now,
			lastSeenAt: now
		})
		.$returningId();
	setDeviceCookie(cookies, token);
	return row.id;
}

/** 解除某位員工所有有效裝置（換手機、改密碼、重設密碼時用） */
export async function revokeDevices(employeeId: number, reason: string) {
	await db
		.update(devices)
		.set({ revokedAt: new Date(), revokeReason: reason })
		.where(and(eq(devices.employeeId, employeeId), isNull(devices.revokedAt)));
}

export async function revokeDevice(deviceId: number, reason: string) {
	await db
		.update(devices)
		.set({ revokedAt: new Date(), revokeReason: reason })
		.where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)));
}

export async function activeDeviceCount(employeeId: number) {
	const rows = await db
		.select({ id: devices.id })
		.from(devices)
		.where(and(eq(devices.employeeId, employeeId), isNull(devices.revokedAt)));
	return rows.length;
}

// ── 簡單的登入失敗次數限制（單機記憶體即可，小店用不到分散式） ──
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 6;
const LOCK_MS = 10 * 60 * 1000;

export function loginLocked(key: string): number {
	const f = failures.get(key);
	if (!f || f.count < MAX_FAILS) return 0;
	const left = f.until - Date.now();
	if (left <= 0) {
		failures.delete(key);
		return 0;
	}
	return Math.ceil(left / 60000);
}

export function recordLoginFailure(key: string) {
	const f = failures.get(key) ?? { count: 0, until: 0 };
	f.count += 1;
	f.until = Date.now() + LOCK_MS;
	failures.set(key, f);
}

export function clearLoginFailures(key: string) {
	failures.delete(key);
}
