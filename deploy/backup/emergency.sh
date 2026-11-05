#!/bin/sh
# 緊急切換：NAS 掛了就在 VM 上開打卡系統；NAS 修好、資料倒回去之後再關掉。
#   ./emergency.sh on      停止同步、開打卡系統（之後到 Cloudflare 把 tsangkee 指到這台）
#   ./emergency.sh off     關打卡系統、恢復同步（資料要先倒回 NAS！）
#   ./emergency.sh status  看現在的狀態和最近的同步紀錄
set -e
cd "$(dirname "$0")"
case "$1" in
  on)
    touch backups/EMERGENCY
    docker compose stop sync
    docker compose pull app
    docker compose --profile emergency up -d app
    echo "打卡系統已在 VM 開好。資料時間：$(docker compose exec -T db mysql -uroot -p"$(grep ^DB_PASSWORD= .env | cut -d= -f2)" -N -e 'select max(synced_at) from zengji_punch._backup_meta' 2>/dev/null)"
    echo "下一步：Cloudflare DNS 把 tsangkee 改成 A 125.228.166.81（橘色雲朵 Proxied）"
    ;;
  off)
    printf "資料已經倒回 NAS 了嗎？沒有的話這段時間的打卡會不見。輸入 yes 繼續："
    read ans
    [ "$ans" = "yes" ] || { echo "取消"; exit 1; }
    docker compose --profile emergency stop app
    rm -f backups/EMERGENCY
    docker compose up -d sync
    echo "已關閉 VM 上的打卡系統、恢復同步。記得把 Cloudflare DNS 的 tsangkee 改回 Vercel。"
    ;;
  status)
    [ -f backups/EMERGENCY ] && echo "模式：緊急（打卡系統在 VM 上跑）" || echo "模式：平常（同步中）"
    docker compose --profile emergency ps
    docker compose logs --tail 5 sync
    ;;
  *)
    echo "用法：./emergency.sh on | off | status"
    exit 1
    ;;
esac
