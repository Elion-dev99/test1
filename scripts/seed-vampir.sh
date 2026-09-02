#!/usr/bin/env bash
# VAMPIR（ヴァンピール）ボスデータ投入スクリプト
# 出典: GameWith 攻略 (2026年8月更新)
# https://gamewith.jp/vampir/570617 (ワールドボス)
# https://gamewith.jp/vampir/569771 (ゲヘナ)

set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"

post() {
  curl -sf -X POST "$1" -H "Content-Type: application/json" -d "$2"
}

put() {
  curl -sf -X PUT "$1" -H "Content-Type: application/json" -d "$2"
}

echo "==> VAMPIR ボスデータ投入開始"

# --- ワールドボス 12:00 ---
# 出現場所: 韓国版 침공 경로・GameWith PK/安全エリア情報より推定
WB12=(
  'ラルヴァ|Lv.47|ワールドボス（12:00）|ポエナリ領・西光街道・神殿跡（Lv45付近・安全エリア）|#3498DB'
  'クラマムス|Lv.70|ワールドボス（12:00）|ポエナリ領・黒色森林（Lv64付近）|#2980B9'
  'エクセサ|Lv.95|ワールドボス（12:00）|キシェル領・涸れた浅瀬（Lv90付近）|#1ABC9C'
)

for entry in "${WB12[@]}"; do
  IFS='|' read -r name level category location color <<< "$entry"
  post "$API/bosses" "{\"name\":\"$name\",\"location\":\"$location\",\"description\":\"$category $level。毎日12:00に復活。参加報酬+貢献度報酬（上位70%）。\",\"respawn_minutes\":0,\"color\":\"$color\",\"enabled\":1}"
done

# --- ワールドボス 20:00 ---
WB20=(
  'ブラーキウム|Lv.63|ワールドボス（20:00）|ポエナリ領・貫通平原（Lv48〜63）|#9B59B6'
  'デセルティ|Lv.83|ワールドボス（20:00）|キシェル領・白砂平原（Lv83付近）|#8E44AD'
  'ウスルパトル|Lv.107|ワールドボス（20:00）|キシェル領・忘却遺跡（Lv107〜110）|#E74C3C'
)

for entry in "${WB20[@]}"; do
  IFS='|' read -r name level category location color <<< "$entry"
  post "$API/bosses" "{\"name\":\"$name\",\"location\":\"$location\",\"description\":\"$category $level。毎日20:00に復活。参加報酬+貢献度報酬（上位70%）。\",\"respawn_minutes\":0,\"color\":\"$color\",\"enabled\":1}"
done

# --- ゲヘナボス ---
post "$API/bosses" '{"name":"ゲヘナボス ★1","location":"ゲヘナ・全区域（第1区域上層/下層・第2区域）","description":"比較的弱め。13:00/17:00/21:00に全区域で出現。Lv52+","respawn_minutes":0,"color":"#E67E22","enabled":1}'
post "$API/bosses" '{"name":"ゲヘナボス ★2","location":"ゲヘナ・第1区域下層","description":"中程度の強さ。13:00/21:00に第1区域下層から出現。報酬豪華。","respawn_minutes":0,"color":"#D35400","enabled":1}'
post "$API/bosses" '{"name":"ゲヘナボス ★3","location":"ゲヘナ・第2区域（土曜22:00限定）","description":"非常に強力。土曜22:00限定。英雄スキル等の希少報酬。Lv64+","respawn_minutes":0,"color":"#C0392B","enabled":1}'

# --- イベントボス バルドゥン（レッドムーンフェスタ） ---
post "$API/bosses" '{"name":"バルドゥン","location":"ポエナリ領（ボス画面「イベント」タブ→クイック移動）","description":"毎日11:50/19:50出現（WB10分前）。5分間ダメージ競争。イベント期間: ~2026/9/16","respawn_minutes":0,"color":"#922B21","enabled":1}'

echo "==> ボス作成完了。スケジュール追加中..."

# ボスIDを名前で取得
get_id() {
  curl -sf "$API/bosses" | python3 -c "
import json,sys
name=sys.argv[1]
data=json.load(sys.stdin)['data']
for b in data:
    if b['name']==name:
        print(b['id'])
        break
" "$1"
}

add_schedule() {
  local boss_id=$1 body=$2
  post "$API/schedules" "{\"boss_id\":$boss_id,$body}"
}

# ワールドボス 12:00
for name in ラルヴァ クラマムス エクセサ; do
  id=$(get_id "$name")
  add_schedule "$id" '"schedule_type":"daily","daily_time":"12:00","notify_minutes":"5,10","enabled":1,"notes":"ワールドボス定時復活"'
done

# ワールドボス 20:00
for name in ブラーキウム デセルティ ウスルパトル; do
  id=$(get_id "$name")
  add_schedule "$id" '"schedule_type":"daily","daily_time":"20:00","notify_minutes":"5,10","enabled":1,"notes":"ワールドボス定時復活"'
done

# ゲヘナ ★1: 13:00, 17:00, 21:00
id=$(get_id "ゲヘナボス ★1")
for time in 13:00 17:00 21:00; do
  add_schedule "$id" "\"schedule_type\":\"daily\",\"daily_time\":\"$time\",\"notify_minutes\":\"5,10\",\"enabled\":1,\"notes\":\"ゲヘナ★1 全区域\""
done

# ゲヘナ ★2: 13:00, 21:00
id=$(get_id "ゲヘナボス ★2")
for time in 13:00 21:00; do
  add_schedule "$id" "\"schedule_type\":\"daily\",\"daily_time\":\"$time\",\"notify_minutes\":\"5,10\",\"enabled\":1,\"notes\":\"ゲヘナ★2 第1区域下層\""
done

# ゲヘナ ★3: 土曜 22:00
id=$(get_id "ゲヘナボス ★3")
add_schedule "$id" '"schedule_type":"weekly","daily_time":"22:00","weekly_days":"6","notify_minutes":"5,15","enabled":1,"notes":"ゲヘナ★3 第2区域・土曜限定"'

# バルドゥン: 11:50, 19:50
id=$(get_id "バルドゥン")
for time in 11:50 19:50; do
  add_schedule "$id" "\"schedule_type\":\"daily\",\"daily_time\":\"$time\",\"notify_minutes\":\"5\",\"enabled\":1,\"notes\":\"レッドムーンフェスタ・WB10分前\""
done

echo "==> 完了!"
curl -sf "$API/stats" | python3 -m json.tool
