// VM 上的備援同步：每 5 分鐘從打卡系統的 /api/backup 抓一份完整資料，寫進 VM 本機的 MySQL，
// 同時把每一份存成壓縮檔留 7 天。NAS 掛了就用這份資料在 VM 上開打卡系統（見 README.md）。
//
// 環境變數：
//   BACKUP_URL     預設 https://tsangkee.doraeyi.com/api/backup
//   BACKUP_SECRET  和 Vercel 上設定的一樣
//   DATABASE_URL   VM 本機的 MySQL，例如 mysql://root:密碼@db:3306/zengji_punch
//   INTERVAL_MIN   幾分鐘抓一次，預設 5；設 0 只跑一次
//   DATA_DIR       備份檔放哪，預設 /backups
//
// 緊急模式（打卡系統在 VM 上跑）時，DATA_DIR 裡會有 EMERGENCY 檔案，這時不會覆蓋本機資料庫。
//
// 也可以反過來用：把 VM 的資料倒回 NAS（NAS 修好後）：
//   node sync.mjs --once --from <VM 打卡系統的 /api/backup> --to <NAS 的 DATABASE_URL>

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import mysql from 'mysql2/promise';

const args = process.argv.slice(2);
const arg = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};

const URL_ = arg('--from') ?? process.env.BACKUP_URL ?? 'https://tsangkee.doraeyi.com/api/backup';
const SECRET = process.env.BACKUP_SECRET;
const DB_URL = arg('--to') ?? process.env.DATABASE_URL;
const INTERVAL_MIN = args.includes('--once') ? 0 : Number(process.env.INTERVAL_MIN ?? 5);
const DATA_DIR = process.env.DATA_DIR ?? '/backups';
const KEEP_DAYS = 7;
// 倒回 NAS 時（有指定 --to）：不存檔、不看 EMERGENCY
const RESTORE = Boolean(arg('--to'));

if (!SECRET || !DB_URL) {
	console.error('需要 BACKUP_SECRET 和 DATABASE_URL');
	process.exit(1);
}

const log = (...m) => console.log(new Date().toISOString(), ...m);
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
// 建表語法裡的 AUTO_INCREMENT=123 每次都會變，比對結構時拿掉
const shape = (ddl) => ddl.replace(/ AUTO_INCREMENT=\d+/, '');

async function fetchBackup() {
	const res = await fetch(URL_, { headers: { authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`備份網址回 ${res.status}：${(await res.text()).slice(0, 200)}`);
	const text = await res.text();
	const data = JSON.parse(text);
	if (data.version !== 1 || !Array.isArray(data.tables) || !data.tables.length) throw new Error('備份內容格式不對');
	return { text, data };
}

function saveFile(text, at) {
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(join(DATA_DIR, `backup-${at.replace(/[:.]/g, '-')}.json.gz`), gzipSync(text));
	writeFileSync(join(DATA_DIR, 'latest.json'), text);
	const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
	for (const f of readdirSync(DATA_DIR)) {
		if (f.startsWith('backup-') && statSync(join(DATA_DIR, f)).mtimeMs < cutoff) rmSync(join(DATA_DIR, f));
	}
}

async function apply(data) {
	const conn = await mysql.createConnection({ uri: DB_URL, timezone: 'Z', multipleStatements: false });
	try {
		await conn.query('SET FOREIGN_KEY_CHECKS = 0');
		await conn.query('CREATE TABLE IF NOT EXISTS `_backup_meta` (`name` varchar(64) PRIMARY KEY, `shape` char(16) NOT NULL, `synced_at` varchar(30) NOT NULL)');
		const [metaRows] = await conn.query('SELECT name, shape FROM `_backup_meta`');
		const known = new Map(metaRows.map((r) => [r.name, r.shape]));

		// 結構有變（或還沒有這張表）才重建
		for (const t of data.tables) {
			const s = hash(shape(t.ddl));
			if (known.get(t.name) === s) continue;
			await conn.query(`DROP TABLE IF EXISTS \`${t.name}\``);
			await conn.query(t.ddl);
			log(`建立資料表 ${t.name}`);
		}

		await conn.beginTransaction();
		for (const t of data.tables) {
			await conn.query(`DELETE FROM \`${t.name}\``);
			const cols = t.columns.map((c) => `\`${c}\``).join(', ');
			for (let i = 0; i < t.rows.length; i += 500) {
				await conn.query(`INSERT INTO \`${t.name}\` (${cols}) VALUES ?`, [t.rows.slice(i, i + 500)]);
			}
			await conn.query('REPLACE INTO `_backup_meta` (name, shape, synced_at) VALUES (?, ?, ?)', [t.name, hash(shape(t.ddl)), data.at]);
		}
		await conn.commit();
		await conn.query('SET FOREIGN_KEY_CHECKS = 1');
		return data.tables.reduce((n, t) => n + t.rows.length, 0);
	} catch (err) {
		await conn.rollback().catch(() => {});
		throw err;
	} finally {
		await conn.end();
	}
}

async function runOnce() {
	if (!RESTORE && existsSync(join(DATA_DIR, 'EMERGENCY'))) {
		log('緊急模式中（有 EMERGENCY 檔案），不覆蓋本機資料庫');
		return;
	}
	try {
		const { text, data } = await fetchBackup();
		if (!RESTORE) saveFile(text, data.at);
		const rows = await apply(data);
		log(`同步完成：${data.tables.length} 張表、${rows} 筆（資料時間 ${data.at}）`);
	} catch (err) {
		log('同步失敗，保留上一份資料：', err.message);
		if (!INTERVAL_MIN) process.exitCode = 1;
	}
}

await runOnce();
if (INTERVAL_MIN > 0) setInterval(runOnce, INTERVAL_MIN * 60_000);
