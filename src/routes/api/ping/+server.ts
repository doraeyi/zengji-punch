import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index.js';

// 給 GitHub Actions 每 5 分鐘呼叫一次，讓 Vercel 函式和資料庫連線保持醒著，
// 員工打開 App 時才不用等伺服器冷啟動（見 .github/workflows/keep-warm.yml）。
export const GET: RequestHandler = async () => {
	const t = Date.now();
	await db.execute(sql`select 1`);
	return Response.json({ ok: true, dbMs: Date.now() - t }, { headers: { 'cache-control': 'no-store' } });
};
