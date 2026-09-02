#!/usr/bin/env bash
# 全ボス・全通知種別のDiscord通知テスト（ボス単位・Kill通知なし）
set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"
DELAY="${NOTIFY_DELAY:-1.5}"

ok=0
fail=0

post_json() {
  local label=$1 url=$2 data=${3:-{}}
  local resp http_code body
  resp=$(curl -s -w "\n%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data")
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [[ "$http_code" =~ ^2 ]]; then
    ok=$((ok + 1))
    echo "OK  | $label"
  else
    fail=$((fail + 1))
    echo "FAIL| $label | HTTP $http_code | $body" >&2
  fi
  sleep "$DELAY"
}

echo "==> 全ボス通知テスト開始 (delay=${DELAY}s)"
echo "（接続テストはDiscord通知なし・スキップ）"
echo ""

while IFS='|' read -r id boss notify_min; do
  [[ -z "$id" ]] && continue
  post_json "出現 | $boss [schedule:$id]" \
    "$API/schedules/$id/notify" \
    '{"message":"【出現テスト】"}'

  IFS=',' read -ra mins <<< "$notify_min"
  for m in "${mins[@]}"; do
    m=$(echo "$m" | tr -d ' ')
    [[ -z "$m" ]] && continue
    post_json "予告${m}分 | $boss [schedule:$id]" \
      "$API/schedules/$id/notify" \
      "{\"message\":\"⏰ 【予告テスト】${m}分後に出現予定\"}"
  done
done < <(curl -sf "$API/schedules" | python3 -c "
import json, sys
seen = set()
for s in sorted(json.load(sys.stdin)['data'], key=lambda x: x['boss_id']):
    if s['boss_id'] in seen:
        continue
    seen.add(s['boss_id'])
    print(f\"{s['id']}|{s['boss_name']}|{s['notify_minutes'] or '5,30'}\")
")

echo ""
echo "==> 完了: 成功=$ok 失敗=$fail"
[[ "$fail" -eq 0 ]]
