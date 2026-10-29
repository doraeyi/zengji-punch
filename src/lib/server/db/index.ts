import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool } from 'mysql2/promise';
import * as schema from './schema';
import { createFailoverPool } from './failover';
import { DATABASE_FALLBACK_HOSTS, DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

// 主要主機連不上時自動改連 DATABASE_FALLBACK_HOSTS（見 failover.ts）。
// timezone 'Z'：JS Date 與 MySQL datetime 之間一律用 UTC 轉換，顯示時才換成台灣時間。
export const dbClient = createFailoverPool(DATABASE_URL, DATABASE_FALLBACK_HOSTS, { timezone: 'Z', connectionLimit: 5 });

export const db = drizzle(dbClient as unknown as Pool, { schema, mode: 'default' });
export * from './schema';
