import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, employees } from '#lib/server/db/index.js';
import { ALARM_OFFSETS, checkAlarmToken, nextAlarm, remindPrefsOf } from '#lib/server/alarm.js';

// 員工手機的自動化每天呼叫：回傳下一班要響的時間（純文字 HH:MM），沒有班回傳 off。
// 例：/api/alarm?u=3&k=密碼 → 18:30（提前幾分鐘照 App 裡的設定；也可以加 &before=30 指定）
export const GET: RequestHandler = async ({ url }) => {
	const id = Number(url.searchParams.get('u'));
	const token = url.searchParams.get('k') ?? '';
	const given = url.searchParams.get('before');
	const text = (body: string, status = 200) =>
		new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

	if (!id || !checkAlarmToken(id, token)) return text('網址不正確，請到 App「我的帳號」重新複製', 403);
	if (given !== null && !ALARM_OFFSETS.includes(Number(given))) return text('提前分鐘數不正確', 400);
	const [emp] = await db.select({ active: employees.active }).from(employees).where(eq(employees.id, id));
	if (!emp?.active) return text('off');

	const before = given !== null ? Number(given) : (await remindPrefsOf([id])).get(id)!.before;
	const next = await nextAlarm(id, before);
	return text(next ? next.time : 'off');
};
