#!/usr/bin/env bash
# VAMPIR サンプルアイテム投入
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=_seed_auth.sh
source "$ROOT/scripts/_seed_auth.sh"
require_admin_password

BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$BASE" ]]; then
  echo "Usage: ADMIN_PASSWORD=... $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
BASE="${BASE%/}"
API="$BASE/api"
export ADMIN_PASSWORD

post() {
  curl -sf -X POST "$API$1" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Password: $ADMIN_PASSWORD" \
    -H "User-Agent: Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)" \
    -d "$2"
  echo
}

echo "==> Seed via $API"

post /items '{"name":"魔物の証 I","category":"collection","rarity":"uncommon","tradeable":1,"description":"ワールドボス貢献のコレクション素材","aliases":["魔物の証I"],"verified":1}'
post /items '{"name":"暗黒オーラの闇取引ボックス","category":"consumable","rarity":"rare","tradeable":1,"description":"WB参加報酬","verified":0}'
post /items '{"name":"討伐者の肖像画復元剤","category":"material","rarity":"rare","tradeable":1,"verified":0}'
post /items '{"name":"セフィラの欠片","category":"material","rarity":"uncommon","tradeable":1,"verified":0}'
post /items '{"name":"トリニティ","category":"material","rarity":"common","tradeable":0,"description":"強化・細工の基幹通貨","verified":1}'
post /items '{"name":"血濡れた王の無慈悲","category":"material","rarity":"heroic","tradeable":1,"verified":0}'
post /items '{"name":"灼熱地獄の忍耐","category":"material","rarity":"heroic","tradeable":1,"verified":0}'
post /items '{"name":"スキルブック（希少）","category":"skillbook","rarity":"rare","tradeable":1,"verified":0}'

curl -sf "$API/items?limit=200" -H "User-Agent: Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)" | python3 -c "
import json,sys,urllib.request,os
api=sys.argv[1]
admin=os.environ['ADMIN_PASSWORD']
items={i['name']:i['id'] for i in json.load(sys.stdin)['data']}
pairs=[
 ('魔物の証 I','ラルヴァ','貢献報酬'),
 ('魔物の証 I','ブラーキウム','貢献報酬'),
 ('暗黒オーラの闇取引ボックス','ラルヴァ','参加報酬'),
 ('討伐者の肖像画復元剤','クラマムス','参加報酬'),
 ('血濡れた王の無慈悲','ウスルパトル','貢献上位'),
 ('灼熱地獄の忍耐','ゲヘナボス ★2','報酬素材'),
]
for name,boss,note in pairs:
  iid=items.get(name)
  if not iid: continue
  data=json.dumps({'item_id':iid,'boss_name':boss,'drop_note':note,'verified':0}).encode()
  req=urllib.request.Request(api+'/drops', data=data, headers={
    'Content-Type':'application/json',
    'X-Admin-Password': admin,
    'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)',
  }, method='POST')
  urllib.request.urlopen(req).read()
  print(f'OK drop {boss} -> {name}')
" "$API"

echo "==> stats"
curl -sf "$API/stats" -H "User-Agent: Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)" | python3 -m json.tool
