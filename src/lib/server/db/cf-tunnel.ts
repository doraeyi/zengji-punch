import WebSocket, { createWebSocketStream } from 'ws';
import type { Duplex } from 'node:stream';

// 透過 Cloudflare Access 的 TCP 通道連 MySQL（等同 `cloudflared access tcp`，但不用另外跑 cloudflared）。
// NAS 的 MySQL 不再直接對外，只能經 db-liam.name404.com → Cloudflare Tunnel → NAS。
// 人要用 Email + MFA 登入；程式用 Service Token（CF-Access-Client-Id / Secret）通過門禁。
// 通道裡跑的就是原本的 MySQL 連線，WebSocket 的每個 binary 訊息就是一段 TCP 資料。

export type TunnelOptions = { hostname: string; clientId: string; clientSecret: string };

export function tunnelStream({ hostname, clientId, clientSecret }: TunnelOptions): Duplex {
	const ws = new WebSocket(`wss://${hostname}`, {
		headers: { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret },
		handshakeTimeout: 8000,
		perMessageDeflate: false
	});
	const stream = createWebSocketStream(ws);
	// 門禁沒過時 Cloudflare 會回 401 / 403，ws 只會報「WebSocket was closed before the connection was established」，
	// 這裡把錯誤訊息換成看得懂的（ws 的錯誤一定會先經過這個排在最前面的 listener）
	let rejected: string | null = null;
	ws.prependListener('error', (err) => {
		if (rejected) err.message = rejected;
	});
	ws.on('unexpected-response', (_req, res) => {
		const hint = [302, 401, 403].includes(res.statusCode ?? 0)
			? '（Service Token 錯了，或 Liam MySQL 沒有加 Service Auth 規則）'
			: '';
		rejected = `Cloudflare 通道被拒：HTTP ${res.statusCode}${hint}`;
		// 錯誤頁的標題和 Ray ID 可以分辨是 Access 規則擋的，還是 WAF / 機器人防護擋的
		let body = '';
		res.setEncoding('utf8');
		res.on('data', (chunk: string) => (body += chunk.slice(0, 4000)));
		res.on('end', () => {
			const title = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
			rejected += `［${[title, res.headers['cf-ray'] && `Ray ${res.headers['cf-ray']}`].filter(Boolean).join('，')}］`;
			ws.terminate();
		});
	});
	return stream;
}
