import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, pushSubscriptions } from '#lib/server/db/index.js';
import { deviceLabel } from '#lib/server/auth.js';
import { pushConfigured, pushTo } from '#lib/server/push.js';

type Body = {
	action: 'subscribe' | 'unsubscribe' | 'test';
	subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
};

/** 手機開啟 / 關閉推播、送測試通知。只有已綁定的裝置可以用。 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const me = locals.user;
	if (!me) error(401, '請先登入');
	if (!pushConfigured()) error(503, '伺服器還沒設定推播金鑰（VAPID）');

	const body = (await request.json()) as Body;
	const sub = body.subscription;

	if (body.action === 'subscribe') {
		const endpoint = sub?.endpoint;
		const p256dh = sub?.keys?.p256dh;
		const auth = sub?.keys?.auth;
		if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://') || endpoint.length > 500) {
			error(400, '訂閱資料不正確');
		}
		// 同一個瀏覽器重新訂閱（或換人登入）就覆蓋舊的
		await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
		await db.insert(pushSubscriptions).values({
			employeeId: me.id,
			deviceId: locals.deviceId,
			endpoint,
			p256dh,
			auth,
			label: deviceLabel(request.headers.get('user-agent')),
			createdAt: new Date()
		});
		const delivered = await pushTo([me.id], {
			title: '🔔 通知已開啟',
			body: me.role === 'owner' ? '員工打卡、請假、發薪都會通知你' : '打卡、班表異動、發薪水都會通知你',
			url: '/',
			tag: 'welcome'
		});
		return Response.json({ ok: true, delivered });
	}

	if (body.action === 'unsubscribe') {
		if (sub?.endpoint) {
			await db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.endpoint, sub.endpoint), eq(pushSubscriptions.employeeId, me.id)));
		}
		return Response.json({ ok: true });
	}

	if (body.action === 'test') {
		const delivered = await pushTo([me.id], {
			title: '🔔 測試通知',
			body: `${me.name}，這支手機可以正常收到通知 👍`,
			url: '/',
			tag: 'test'
		});
		return Response.json({ ok: true, delivered });
	}

	error(400, '不支援的動作');
};
