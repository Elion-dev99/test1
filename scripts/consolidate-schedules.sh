#!/usr/bin/env bash
# 同一ボスの重複スケジュールを1件に統合（本番データ修正用）
set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"

put() {
  curl -sf -X PUT "$1" -H "Content-Type: application/json" -d "$2"
}

delete() {
  curl -sf -X DELETE "$1"
}

echo "==> 重複スケジュール統合開始"

# ゲヘナ ★1: schedule 7 に統合、8・9 削除
put "$API/schedules/7" '{"daily_time":"13:00,17:00,21:00","notes":"ゲヘナ★1 全区域"}'
delete "$API/schedules/8" 2>/dev/null || true
delete "$API/schedules/9" 2>/dev/null || true
echo "OK: ゲヘナボス ★1 -> 13:00,17:00,21:00"

# ゲヘナ ★2: schedule 10 に統合、11 削除
put "$API/schedules/10" '{"daily_time":"13:00,21:00","notes":"ゲヘナ★2 第1区域下層"}'
delete "$API/schedules/11" 2>/dev/null || true
echo "OK: ゲヘナボス ★2 -> 13:00,21:00"

# バルドゥン: schedule 13 に統合、14 削除
put "$API/schedules/13" '{"daily_time":"11:50,19:50","notes":"レッドムーンフェスタ・WB10分前"}'
delete "$API/schedules/14" 2>/dev/null || true
echo "OK: バルドゥン -> 11:50,19:50"

echo "==> 完了"
curl -sf "$API/schedules" | python3 -c "
import json, sys
for s in sorted(json.load(sys.stdin)['data'], key=lambda x: (x['boss_name'], x['id'])):
    print(f\"{s['id']:2} | {s['boss_name']} | {s.get('schedule_label','')} | {s['daily_time']}\")
"
