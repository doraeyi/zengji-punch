// 瀏覽器端的推播工具：註冊 Service Worker、訂閱 / 取消訂閱、送測試通知。
import { VAPID_PUBLIC_KEY } from '$app/env/public';

export type PushState =
	| 'loading'
	/** iPhone / iPad 還沒加入主畫面：Safari 一般分頁不能收推播 */
	| 'ios-needs-install'
	| 'unsupported'
	| 'not-configured'
	| 'denied'
	| 'off'
	| 'on';

export function isIOS() {
	return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
	return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/** 註冊（或取得已註冊的）Service Worker；失敗回傳 null，不會卡住 */
export function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) return Promise.resolve(null);
	registering ??= navigator.serviceWorker.register('/sw.js').catch((err) => {
		console.warn('[push] service worker 註冊失敗', err);
		registering = null;
		return null;
	});
	return registering;
}

export async function pushState(): Promise<PushState> {
	if (!VAPID_PUBLIC_KEY) return 'not-configured';
	const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	if (!supported) return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const reg = await registerServiceWorker();
	if (!reg) return 'unsupported';
	const sub = await reg.pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyToBytes(base64url: string) {
	const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
	const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function call(action: string, subscription?: PushSubscription | null) {
	const res = await fetch('/api/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ action, subscription: subscription?.toJSON() })
	});
	if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
	return (await res.json()) as { ok: boolean; delivered?: number };
}

/** 跳出「允許通知」並訂閱；回傳新的狀態 */
export async function enablePush(): Promise<PushState> {
	const reg = await registerServiceWorker();
	if (!reg) return 'unsupported';
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
	const sub =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY!) }));
	await call('subscribe', sub);
	return 'on';
}

export async function disablePush(): Promise<PushState> {
	const reg = await registerServiceWorker();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		await call('unsubscribe', sub);
		await sub.unsubscribe();
	}
	return 'off';
}

export async function testPush() {
	return call('test');
}
