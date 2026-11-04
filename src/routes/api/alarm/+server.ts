import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import { ALARM_OFFSETS, checkAlarmToken, nextAlarm } from '#lib/server/alarm.js';

// 員工手機的自動化每天呼叫：回傳下一班要響的時間（純文字 HH:MM），沒有班回傳 off。
// 例：/api/alarm?u=3&k=密碼&before=30 → 18:30
export const GET: RequestHandler = async ({ url }) => {
	const id = Number(url.searchParams.get('u'));
	const token = url.searchParams.get('k') ?? '';
	const before = Number(url.searchParams.get('before') ?? 30);
	const text = (body: string, status = 200) =>
		new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

	if (!id || !checkAlarmToken(id, token)) return text('網址不正確，請到 App「我的帳號」重新複製', 403);
	if (!ALARM_OFFSETS.includes(before)) return text('提前分鐘數不正確', 400);
	const [emp] = await db.select({ active: employees.active }).from(employees).where(eq(employees.id, id));
	if (!emp?.active) return text('off');

	const next = await nextAlarm(id, before);
	return text(next ? next.time : 'off');
};
