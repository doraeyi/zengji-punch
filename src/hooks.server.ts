import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { DEVICE_COOKIE, clearDeviceCookie, resolveDevice, setDeviceCookie, transferredFrom } from '#lib/server/auth.js';
import { startReminderLoop } from '#lib/server/reminders.js';

// 伺服器啟動時開始每分鐘檢查：忘記上班卡、半夜還沒下班卡
export const init: ServerInit = () => {
	// Vercel 是 serverless，沒有一直開著的伺服器可以跑計時器；
	// 那邊改由外部排程呼叫 /api/cron/reminders（見 README）
	if (!process.env.VERCEL) startReminderLoop();
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.deviceId = null;
	event.locals.transferredFrom = null;

	const token = event.cookies.get(DEVICE_COOKIE);
	if (token) {
		const found = await resolveDevice(token);
		if (found) {
			event.locals.user = found.user;
			event.locals.deviceId = found.deviceId;
			// 每次造訪就續期，裝置綁定才會「永久」有效
			setDeviceCookie(event.cookies, token);
		} else {
			const from = await transferredFrom(token);
			if (from) {
				// 帳號被轉移走的舊手機：cookie 先留著，登入時才認得出是舊手機
				event.locals.transferredFrom = from;
			} else {
				// 改過密碼、重設密碼、登出或帳號停用
				clearDeviceCookie(event.cookies);
			}
		}
	}

	return resolve(event);
};
