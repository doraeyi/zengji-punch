import mysql from 'mysql2/promise';
import type { RequestHandler } from './$types';
import { tunnelStream } from '#lib/server/db/cf-tunnel.js';
import { CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, DATABASE_TUNNEL_HOST, DATABASE_URL } from '$app/env/private';

// 只用來測 Cloudflare 通道能不能從 Vercel 連到資料庫，不影響網站本身用的連線。
// 回傳內容不含任何金鑰，只說有沒有設定、格式像不像、連線結果。
export const GET: RequestHandler = async () => {
	const id = CF_ACCESS_CLIENT_ID ?? '';
	const secret = CF_ACCESS_CLIENT_SECRET ?? '';
	const env = {
		idSet: !!id,
		secretSet: !!secret,
		idLooksRight: /^[0-9a-f]{32}\.access$/.test(id),
		hasQuotesOrSpaces: /["'\s]/.test(id + secret)
	};
	if (!id || !secret || !DATABASE_URL) return Response.json({ ok: false, env, error: '沒有設定 Service Token' });
	const t = Date.now();
	const conn = await mysql
		.createConnection({ uri: DATABASE_URL, connectTimeout: 10000, stream: () => tunnelStream({ hostname: DATABASE_TUNNEL_HOST, clientId: id, clientSecret: secret }) })
		.catch((e: Error) => e);
	if (conn instanceof Error) return Response.json({ ok: false, env, ms: Date.now() - t, error: conn.message }, { headers: { 'cache-control': 'no-store' } });
	await conn.query('select 1');
	await conn.end();
	return Response.json({ ok: true, env, ms: Date.now() - t }, { headers: { 'cache-control': 'no-store' } });
};
