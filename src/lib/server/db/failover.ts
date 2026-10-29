import net from 'node:net';
import mysql from 'mysql2/promise';

// 資料庫自動切換：主要主機連不上時，改連備用主機；用備用期間每隔一段時間檢查主要的恢復了沒。
// 例如 liam.name404.com 被放到 Cloudflare 後面時 13306 過不去，就自動改走 kaikaizhen.myasustor.com。

type Host = { host: string; port: number };

/** 測一個主機能不能連（TCP），最多等這麼久 */
const PROBE_TIMEOUT_MS = 3000;
/** 用備用主機期間，多久重新檢查一次主要主機 */
const RECHECK_MS = 2 * 60 * 1000;
/** 這些錯誤代表「根本沒連上」，查詢一定還沒執行，可以安全地換主機重試 */
const CONNECT_ERRORS = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN']);
/** 這些錯誤代表連線中途斷了：不重試（避免重複寫入），但下一次查詢會重新選主機 */
const LOST_ERRORS = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE']);

function parseHosts(primary: URL, fallbacks: string | undefined): Host[] {
	const list: Host[] = [{ host: primary.hostname, port: Number(primary.port || 3306) }];
	for (const item of (fallbacks ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
		const [host, port] = item.split(':');
		if (!list.some((h) => h.host === host && h.port === Number(port || 3306))) {
			list.push({ host, port: Number(port || 3306) });
		}
	}
	return list;
}

function probe({ host, port }: Host): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({ host, port });
		const done = (ok: boolean) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}

/** 備用主機已經連上時，最多再等主要主機這麼久（主要被擋住時不會回應，不能等滿 PROBE_TIMEOUT_MS） */
const PRIMARY_GRACE_MS = 300;

/**
 * 同時測所有主機，照優先順序選能連的。
 * 優先的還沒回應、但後面的已經連上時，只再等 PRIMARY_GRACE_MS，就先用已連上的。
 */
async function pick(hosts: Host[]): Promise<number> {
	if (hosts.length === 1) return 0;
	return new Promise((resolve) => {
		const results: (boolean | undefined)[] = hosts.map(() => undefined);
		let grace: ReturnType<typeof setTimeout> | null = null;
		let settled = false;
		const finish = (i: number) => {
			if (settled) return;
			settled = true;
			if (grace) clearTimeout(grace);
			resolve(i);
		};
		const firstOk = () => results.findIndex((r) => r === true);
		const decide = () => {
			for (let i = 0; i < hosts.length; i++) {
				if (results[i] === undefined) {
					// 優先的還沒有結果：後面有已連上的就只再等一下
					if (firstOk() > i && !grace) grace = setTimeout(() => finish(firstOk()), PRIMARY_GRACE_MS);
					return;
				}
				if (results[i]) return finish(i);
			}
			finish(0); // 全部都連不上：還是用主要的，讓錯誤照常回報
		};
		hosts.forEach((h, i) =>
			probe(h).then((ok) => {
				results[i] = ok;
				decide();
			})
		);
	});
}

const label = (h: Host) => `${h.host}:${h.port}`;

export function createFailoverPool(url: string, fallbackHosts: string | undefined, options: mysql.PoolOptions) {
	const primary = new URL(url);
	const hosts = parseHosts(primary, fallbackHosts);
	const pools = new Map<number, mysql.Pool>();
	let current: number | null = null;
	let checkedAt = 0;
	let picking: Promise<number> | null = null;

	const poolFor = (i: number) => {
		let p = pools.get(i);
		if (!p) {
			const u = new URL(url);
			u.hostname = hosts[i].host;
			u.port = String(hosts[i].port);
			p = mysql.createPool({ uri: u.toString(), connectTimeout: 8000, ...options });
			pools.set(i, p);
		}
		return p;
	};

	let rechecking = false;

	/** 用備用主機期間，在背景看主要主機恢復了沒；恢復就讓之後的查詢切回主要（不擋住目前的查詢） */
	function recheckPrimary() {
		if (rechecking) return;
		rechecking = true;
		checkedAt = Date.now();
		probe(hosts[0])
			.then((ok) => {
				if (ok && current !== null && current !== 0) {
					console.warn(`[db] 主要資料庫 ${label(hosts[0])} 恢復了，改回主要（原本 ${label(hosts[current])}）`);
					current = 0;
				}
			})
			.finally(() => (rechecking = false));
	}

	async function active(): Promise<mysql.Pool> {
		if (current === null) {
			picking ??= pick(hosts).finally(() => (picking = null));
			const next = await picking;
			if (current === null && next !== 0) console.warn(`[db] 主要資料庫 ${label(hosts[0])} 連不上，改連 ${label(hosts[next])}`);
			current = next;
			checkedAt = Date.now();
		} else if (current !== 0 && Date.now() - checkedAt > RECHECK_MS) {
			recheckPrimary();
		}
		return poolFor(current);
	}

	/** 目前這台出問題：下次查詢重新選主機 */
	function markBroken() {
		current = null;
	}

	async function run<T>(fn: (pool: mysql.Pool) => Promise<T>): Promise<T> {
		const first = await active();
		try {
			return await fn(first);
		} catch (err) {
			const code = (err as { code?: string }).code ?? '';
			if (CONNECT_ERRORS.has(code) && hosts.length > 1) {
				markBroken();
				const second = await active();
				if (second !== first) return fn(second);
			} else if (LOST_ERRORS.has(code)) {
				markBroken();
			}
			throw err;
		}
	}

	// drizzle 只用到 query / execute / getConnection（有 getConnection 就會被當成連線池）
	return {
		query: (...args: Parameters<mysql.Pool['query']>) => run((p) => p.query(...args)),
		execute: (...args: Parameters<mysql.Pool['execute']>) => run((p) => p.execute(...args)),
		getConnection: () => run((p) => p.getConnection()),
		/** 給測試 / 除錯看目前連到哪 */
		currentHost: () => (current === null ? null : label(hosts[current])),
		hosts: hosts.map(label)
	};
}
