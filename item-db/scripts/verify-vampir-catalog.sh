#!/usr/bin/env bash
# Verify seeded catalog against live API.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
python3 - "$API_BASE" "$ROOT/data/vampir-catalog.json" <<'PY'
import json, sys, urllib.request, urllib.parse

api, catalog_path = sys.argv[1], sys.argv[2]
catalog = json.load(open(catalog_path, encoding='utf-8'))
expected_names = [i['name'] for i in catalog['items']]
expected_bosses = [b['name'] for b in catalog['bosses']]

def get(path):
  with urllib.request.urlopen(api + path, timeout=60) as r:
    return json.loads(r.read().decode())

stats = get('/api/stats')
assert stats['success'], stats
print('stats', stats['data'])

# paginate items
live = []
# API limit max 500
page = get('/api/items?limit=500')
assert page['success'], page
live = page['data']
live_names = {i['name'] for i in live}
missing = [n for n in expected_names if n not in live_names]
extra_note = len(live_names) - len(expected_names)

print(f'catalog_items={len(expected_names)} live_items={len(live_names)} missing={len(missing)}')
if missing:
  print('MISSING sample:', missing[:20])
  raise SystemExit(1)

# sample lookups
samples = [
  '魔王のトンファー',
  '霜王のヘルム',
  '血濡れた王のリング',
  '夜の遺言',
  'トリニティ',
  '魔物の証',
  '灼熱地獄の忍耐',
  '経験の血清',
  'セフィラの欠片',
]
for name in samples:
  q = urllib.parse.urlencode({'name': name})
  detail = get('/api/items/lookup?' + q)
  assert detail['success'], (name, detail)
  item = detail['data']['item']
  assert item['name'] == name
  assert item['verified'] in (0, 1)
  print(f'OK lookup {name} id={item["id"]} rarity={item["rarity"]} cat={item["category"]} drops={len(detail["data"]["drops"])} sources={len(detail["data"]["sources"])}')

bosses = get('/api/bosses')
assert bosses['success'], bosses
boss_names = {b['name'] for b in bosses['data']}
miss_b = [n for n in expected_bosses if n not in boss_names]
print(f'bosses expected={len(expected_bosses)} live={len(boss_names)} missing={len(miss_b)}')
if miss_b:
  print('MISSING bosses', miss_b)
  raise SystemExit(1)

# WB drop check
drops = get('/api/drops?boss=' + urllib.parse.quote('ラルヴァ'))
assert drops['success'], drops
drop_names = {d['item_name'] for d in drops['data']}
for need in ['魔物の証', '暗黒オーラの闇取引ボックス', 'セフィラの欠片']:
  assert need in drop_names, (need, drop_names)
print('OK drops for ラルヴァ', len(drop_names))

# category counts
from collections import Counter
print('live categories', dict(Counter(i['category'] for i in live)))
print('live rarities', dict(Counter(i['rarity'] for i in live)))
print('VERIFY PASS')
PY
