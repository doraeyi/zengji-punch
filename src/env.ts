import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'MySQL 連線字串（主要），例如 mysql://user:pass@liam.name404.com:13306/zengji_punch'
	},
	DATABASE_FALLBACK_HOSTS: {
		description:
			'備用的資料庫主機（host:port，多個用逗號隔開），主要的連不上時自動改連，例如 kaikaizhen.myasustor.com:13306。帳號密碼與資料庫名稱沿用 DATABASE_URL。',
		schema: optional
	},
	CF_ACCESS_CLIENT_ID: {
		description: 'Cloudflare Access Service Token 的 Client ID。有設就改走 Cloudflare 通道（DATABASE_TUNNEL_HOST）連資料庫。',
		schema: optional
	},
	CF_ACCESS_CLIENT_SECRET: {
		description: 'Cloudflare Access Service Token 的 Client Secret',
		schema: optional
	},
	DATABASE_TUNNEL_HOST: {
		description: 'Cloudflare 通道的資料庫網址，預設 db-liam.name404.com',
		schema: (value) => value || 'db-liam.name404.com'
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
	BACKUP_SECRET: {
		description: '備份網址 /api/backup 的密鑰。VM 上的備援每 5 分鐘用它抓一份完整資料（見 deploy/backup/README.md）。沒設定就關閉。',
		schema: optional
	},
	VAPID_SUBJECT: {
		description: '推播聯絡資訊，mailto: 開頭的 email 或網站網址',
		schema: (value) => value || 'mailto:admin@example.com'
	}
});
