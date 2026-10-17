import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import { VAPID_PUBLIC_KEY } from '$app/env/public';
import { db, employees, pushSubscriptions } from './db';

// 標準 Web Push（VAPID）：不需要 Firebase 或任何第三方帳號。
// 瀏覽器用公鑰訂閱，伺服器用私鑰簽名後，把加密訊息送到各瀏覽器自己的推播服務。

export function pushConfigured() {
	return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

if (pushConfigured()) {
	webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export type PushPayload = {
	title: string;
	body: string;
	/** 點通知後打開的頁面 */
	url?: string;
	/** 同一個 tag 的通知會互相取代，不會疊一堆 */
	tag?: string;
};

/** 推給指定的人（他們所有訂閱過的裝置），回傳成功送達的裝置數 */
export async function pushTo(employeeIds: number[], payload: PushPayload): Promise<number> {
	if (!pushConfigured() || !employeeIds.length) return 0;
	const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.employeeId, employeeIds));
	const body = JSON.stringify(payload);

	const results = await Promise.allSettled(
		subs.map((s) =>
			webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
				TTL: 60 * 60 * 24,
				urgency: 'high',
				timeout: 8000
			})
		)
	);

	let delivered = 0;
	const gone: number[] = [];
	results.forEach((r, i) => {
		if (r.status === 'fulfilled') delivered++;
		else {
			const code = (r.reason as { statusCode?: number })?.statusCode;
			// 404 / 410：使用者取消訂閱或換了瀏覽器，這筆訂閱已經失效
			if (code === 404 || code === 410) gone.push(subs[i].id);
			else console.error('[push] failed', code, (r.reason as Error)?.message);
		}
	});
	if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
	return delivered;
}

/** 推給所有老闆 / 老闆娘（可排除做這件事的人自己） */
export async function pushToOwners(payload: PushPayload, exceptId?: number | null): Promise<number> {
	const owners = await db
		.select({ id: employees.id })
		.from(employees)
		.where(eq(employees.role, 'owner'));
	return pushTo(
		owners.map((o) => o.id).filter((id) => id !== exceptId),
		payload
	);
}
