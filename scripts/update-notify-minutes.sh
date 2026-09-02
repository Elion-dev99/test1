#!/usr/bin/env bash
# 全スケジュールの事前通知を 5分前・30分前 に統一
set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"
NOTIFY="${NOTIFY_MINUTES:-5,30}"

echo "==> 事前通知を ${NOTIFY} に更新"

curl -sf -X PUT "$API/settings" \
  -H "Content-Type: application/json" \
  -d "{\"default_notify_minutes\":\"$NOTIFY\"}" >/dev/null
echo "OK: default_notify_minutes -> $NOTIFY"

while IFS='|' read -r id boss; do
  [[ -z "$id" ]] && continue
  curl -sf -X PUT "$API/schedules/$id" \
    -H "Content-Type: application/json" \
    -d "{\"notify_minutes\":\"$NOTIFY\"}" >/dev/null
  echo "OK: $boss (schedule:$id) -> $NOTIFY"
done < <(curl -sf "$API/schedules" | python3 -c "
import json, sys
for s in sorted(json.load(sys.stdin)['data'], key=lambda x: x['id']):
    print(f\"{s['id']}|{s['boss_name']}\")
")

echo "==> 完了"
