import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { RequestHandler } from './$types';
import { BACKUP_SECRET } from '$app/env/private';
import { db } from '#lib/server/db/index.js';

// 給 VM 上的備援每 5 分鐘抓一份完整資料（deploy/backup/sync.mjs）：每張表的建表語法和全部資料。
// 要帶 Authorization: Bearer <BACKUP_SECRET>。內容有密碼雜湊和推播金鑰，密鑰不能外流。

function authorized(request: Request) {
	if (!BACKUP_SECRET) return false;
	const a = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
	const b = Buffer.from(BACKUP_SECRET);
	return a.length === b.length && timingSafeEqual(a, b);
}

// 日期和 JSON 都原樣用字串傳，寫回資料庫時不會因為時區或格式轉換跑掉
// （JSON 欄位 mysql2 會當成二進位讀，要指定 utf8，中文才不會變亂碼）
const typeCast = (field: { type: string; string: (encoding?: string) => string | null }, next: () => unknown) =>
	field.type === 'JSON' ? field.string('utf8') : ['DATETIME', 'TIMESTAMP', 'DATE'].includes(field.type) ? field.string() : next();

export const GET: RequestHandler = async ({ request }) => {
	if (!BACKUP_SECRET) error(503, '還沒設定 BACKUP_SECRET');
	if (!authorized(request)) error(401, 'unauthorized');

	const pool = db.$client as unknown as Pool;
	const [names] = await pool.query<RowDataPacket[]>(
		"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
	);
	const tables = [];
	for (const { name } of names) {
		const [[create]] = await pool.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${name}\``);
		const [rows, fields] = await pool.query({ sql: `SELECT * FROM \`${name}\``, rowsAsArray: true, typeCast });
		tables.push({ name, ddl: create['Create Table'] as string, columns: fields.map((f) => f.name), rows });
	}
	return Response.json({ version: 1, at: new Date().toISOString(), tables }, { headers: { 'cache-control': 'no-store' } });
};
