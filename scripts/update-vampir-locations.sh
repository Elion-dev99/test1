#!/usr/bin/env bash
# 既存ボスの出現場所を更新（VAMPIR ワールドボス・ゲヘナ・イベントボス）
# 出典: GameWith 攻略 / 韓国版フィールド名対応表（レベル帯・침공 경로）

set -euo pipefail

API="${WORKER_URL:-https://mmorpg-boss-notifier.enchanting-supernova.workers.dev}/api"

put_location() {
  local name=$1 location=$2
  local id
  id=$(curl -sf "$API/bosses" | python3 -c "
import json, sys
name = sys.argv[1]
for b in json.load(sys.stdin)['data']:
    if b['name'] == name:
        print(b['id'])
        break
" "$name")
  if [[ -z "${id:-}" ]]; then
    echo "WARN: boss not found: $name" >&2
    return 1
  fi
  curl -sf -X PUT "$API/bosses/$id" \
    -H "Content-Type: application/json" \
    -d "{\"location\":\"$location\"}" >/dev/null
  echo "OK: $name -> $location"
}

echo "==> ボス出現場所を更新中..."

put_location "ラルヴァ" "ポエナリ領・西光街道・神殿跡（Lv45付近・安全エリア）"
put_location "クラマムス" "ポエナリ領・黒色森林（Lv64付近）"
put_location "エクセサ" "キシェル領・涸れた浅瀬（Lv90付近）"
put_location "ブラーキウム" "ポエナリ領・貫通平原（Lv48〜63）"
put_location "デセルティ" "キシェル領・白砂平原（Lv83付近）"
put_location "ウスルパトル" "キシェル領・忘却遺跡（Lv107〜110）"
put_location "ゲヘナボス ★1" "ゲヘナ・全区域（第1区域上層/下層・第2区域）"
put_location "ゲヘナボス ★2" "ゲヘナ・第1区域下層"
put_location "ゲヘナボス ★3" "ゲヘナ・第2区域（土曜22:00限定）"
put_location "バルドゥン" "ポエナリ領（ボス画面「イベント」タブ→クイック移動）"

echo "==> 完了"
curl -sf "$API/bosses" | python3 -c "
import json, sys
for b in json.load(sys.stdin)['data']:
    print(f\"{b['id']:2} | {b['name']} | {b['location']}\")
"
