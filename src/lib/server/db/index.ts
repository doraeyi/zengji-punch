import { drizzle } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';
import * as schema from './schema';
import { createFailoverPool } from './failover';
import { tunnelStream } from './cf-tunnel';
import {
	CF_ACCESS_CLIENT_ID,
	CF_ACCESS_CLIENT_SECRET,
	DATABASE_FALLBACK_HOSTS,
	DATABASE_TUNNEL_HOST,
	DATABASE_URL
} from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

// timezone 'Z'：JS Date 與 MySQL datetime 之間一律用 UTC 轉換，顯示時才換成台灣時間。
const options = { timezone: 'Z', connectionLimit: 10 } satisfies mysql.PoolOptions;

function createClient() {
	// 有 Service Token：只走 Cloudflare 通道（見 cf-tunnel.ts），帳密與資料庫名稱沿用 DATABASE_URL，主機名稱不用
	if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
		const tunnel = { hostname: DATABASE_TUNNEL_HOST, clientId: CF_ACCESS_CLIENT_ID, clientSecret: CF_ACCESS_CLIENT_SECRET };
		const pool = mysql.createPool({ uri: DATABASE_URL, connectTimeout: 10000, ...options, stream: () => tunnelStream(tunnel) });
		return { pool, status: () => ({ using: 'tunnel' }) };
	}
	// 沒有 Service Token：直連，主要主機連不上時自動改連 DATABASE_FALLBACK_HOSTS（見 failover.ts）
	const pool = createFailoverPool(DATABASE_URL, DATABASE_FALLBACK_HOSTS, options);
	return { pool: pool as unknown as Pool, status: pool.status };
}

const client = createClient();

/** 給 /api/ping 看目前怎麼連的（不含主機名稱） */
export const dbStatus = client.status;

export const db = drizzle(client.pool, { schema, mode: 'default' });
export * from './schema';
