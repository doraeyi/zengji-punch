# VM 備援

NAS（資料庫）掛掉時，打卡系統改在 VM（部落格那台）上跑，用 VM 上每 5 分鐘同步一次的資料。

```
平常：  員工 → Vercel → NAS 的 MySQL
                 ↑ 每 5 分鐘 /api/backup
        VM：sync → VM 的 MySQL（db）

NAS 掛了：員工 → Cloudflare → VM 的 traefik → VM 的打卡系統（app）→ VM 的 MySQL
```

- VM 只往外連 `https://tsangkee.doraeyi.com/api/backup`，不用開任何入口。
- 最多少最後 5 分鐘的資料；每份備份也存在 `backups/`，留 7 天。

## 第一次安裝（在 VM 上）

```bash
mkdir -p ~/zengji-backup && cd ~/zengji-backup
for f in docker-compose.yml emergency.sh; do curl -fsSLO https://raw.githubusercontent.com/doraeyi/zengji-punch/main/deploy/backup/$f; done
chmod +x emergency.sh
[ -f .env ] || printf "DB_PASSWORD=%s\nBACKUP_SECRET=%s\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > .env
chmod 600 .env
grep BACKUP_SECRET .env
```

1. 把印出來的 `BACKUP_SECRET` 加到 Vercel 的環境變數，重新部署。
2. （建議）把 Vercel 上的 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` 也照抄進 `.env`，緊急時推播和上班鬧鐘網址才能照常用。
3. `docker compose up -d`，過一分鐘 `./emergency.sh status` 看到「同步完成」就好了。

## NAS 掛了

1. VM：`cd ~/zengji-backup && ./emergency.sh on`
2. Cloudflare → doraeyi.com → DNS：`tsangkee` 改成 **A 125.228.166.81**、**Proxied（橘色雲朵）**。
3. 幾分鐘後打開 https://tsangkee.doraeyi.com/api/ping，`using` 是 `primary` 就是 VM 在服務。員工的手機登入狀態會沿用（同步了 devices）。

## NAS 修好了

1. 把 VM 上這段時間的資料倒回 NAS（VM 的打卡系統也有 `/api/backup`）：
   `node deploy/backup/sync.mjs --once --from https://tsangkee.doraeyi.com/api/backup --to <NAS 的連線>`
   （NAS 走 Cloudflare 通道時，從有通道的電腦跑；會整份覆蓋 NAS 的資料表。）
2. Cloudflare DNS 的 `tsangkee` 改回 Vercel（CNAME `cname.vercel-dns.com`，DNS only）。
3. VM：`./emergency.sh off`，恢復平常的同步。
