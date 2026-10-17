import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

// timezone 'Z'：JS Date 與 MySQL datetime 之間一律用 UTC 轉換，顯示時才換成台灣時間。
const client = mysql.createPool({ uri: DATABASE_URL, timezone: 'Z', connectionLimit: 5 });

export const db = drizzle(client, { schema, mode: 'default' });
export * from './schema';
