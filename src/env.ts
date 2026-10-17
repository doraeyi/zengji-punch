import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'MySQL 連線字串，例如 mysql://user:pass@liam.name404.com:13306/zengji_punch'
	},
	VAPID_PUBLIC_KEY: {
		description: 'Web Push 公鑰（npx web-push generate-vapid-keys 產生）。會給瀏覽器用來訂閱推播。',
		public: true,
		schema: optional
	},
	VAPID_PRIVATE_KEY: {
		description: 'Web Push 私鑰，只放伺服器。沒設定就不推播。',
		schema: optional
	},
	CRON_SECRET: {
		description: '排程網址 /api/cron/reminders 的密鑰。部署在 Vercel 這類沒有常駐伺服器的平台時，用外部排程每分鐘呼叫它來發提醒。',
		schema: optional
	},
	VAPID_SUBJECT: {
		description: '推播聯絡資訊，mailto: 開頭的 email 或網站網址',
		schema: (value) => value || 'mailto:admin@example.com'
	}
});
