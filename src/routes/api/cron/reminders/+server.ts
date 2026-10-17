import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$app/env/private';
import { runReminders } from '#lib/server/reminders.js';

// 給外部排程（cron-job.org、Vercel Cron…）每分鐘呼叫一次，檢查忘記上班卡、半夜沒下班卡。
// 要帶 Authorization: Bearer <CRON_SECRET>（Vercel Cron 會自動帶），或 ?key=<CRON_SECRET>。
// 同一件事一天只會提醒一次，多呼叫幾次也不會重複發。

function authorized(request: Request, url: URL) {
	if (!CRON_SECRET) return false;
	const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('key') ?? '';
	const a = Buffer.from(given);
	const b = Buffer.from(CRON_SECRET);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!CRON_SECRET) error(503, '還沒設定 CRON_SECRET');
	if (!authorized(request, url)) error(401, 'unauthorized');
	await runReminders();
	return Response.json({ ok: true, at: new Date().toISOString() });
};
