#!/usr/bin/env bash
# 全ボス・全通知種別のDiscord通知テスト
set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"
DELAY="${NOTIFY_DELAY:-1.5}"

ok=0
fail=0
results=()

post_json() {
  local label=$1 url=$2 data=${3:-{}}
  local resp http_code
  resp=$(curl -s -w "\n%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data")
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [[ "$http_code" =~ ^2 ]]; then
    ok=$((ok + 1))
    results+=("OK  | $label")
    echo "OK  | $label"
  else
    fail=$((fail + 1))
    results+=("FAIL| $label | HTTP $http_code | $body")
    echo "FAIL| $label | HTTP $http_code | $body" >&2
  fi
  sleep "$DELAY"
}

echo "==> 全ボス・全通知テスト開始 (delay=${DELAY}s)"
echo ""

# 1. 接続テスト
post_json "接続テスト" "$API/settings/test"

# 2. 全スケジュールの出現・予告通知
while IFS='|' read -r id boss time notify_min; do
  [[ -z "$id" ]] && continue
  post_json "出現 | $boss ($time) [schedule:$id]" \
    "$API/schedules/$id/notify" \
    "{\"message\":\"【出現テスト】\"}"

  IFS=',' read -ra mins <<< "$notify_min"
  for m in "${mins[@]}"; do
    m=$(echo "$m" | tr -d ' ')
    [[ -z "$m" ]] && continue
    post_json "予告${m}分 | $boss ($time) [schedule:$id]" \
      "$API/schedules/$id/notify" \
      "{\"message\":\"⏰ 【予告テスト】${m}分後に出現予定\"}"
  done
done < <(curl -sf "$API/schedules" | python3 -c "
import json, sys
for s in sorted(json.load(sys.stdin)['data'], key=lambda x: x['id']):
    print(f\"{s['id']}|{s['boss_name']}|{s['schedule_label']}|{s['notify_minutes'] or '5,10'}\")
")

# 3. 全ボスの討伐通知（ボスごとに代表スケジュール1件）
while IFS='|' read -r id boss; do
  [[ -z "$id" ]] && continue
  post_json "討伐 | $boss [schedule:$id]" \
    "$API/schedules/$id/kill" \
    '{"notify":true}'
done < <(curl -sf "$API/schedules" | python3 -c "
import json, sys
seen = set()
for s in sorted(json.load(sys.stdin)['data'], key=lambda x: x['boss_id']):
    if s['boss_id'] in seen:
        continue
    seen.add(s['boss_id'])
    print(f\"{s['id']}|{s['boss_name']}\")
")

echo ""
echo "==> 完了: 成功=$ok 失敗=$fail"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
