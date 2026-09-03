#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
python3 - "$API_BASE" "$ROOT/data/vampir-enhance/seiei-furubita-orb.json" <<'PY'
import json, sys, urllib.request, urllib.parse

api, path = sys.argv[1], sys.argv[2]
expected = json.load(open(path, encoding='utf-8'))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Verify/1.0)'}

def get(p):
  req = urllib.request.Request(api + p, headers=UA)
  with urllib.request.urlopen(req, timeout=30) as r:
    return json.loads(r.read().decode())

name = expected['item']['name']
detail = get('/api/items/lookup?' + urllib.parse.urlencode({'name': name}))
assert detail['success'], detail
data = detail['data']
item = data['item']
assert item['name'] == name
assert item['rarity'] == 'common'
assert item['slot'] == '武器'
assert item['verified'] == 1

extra = data.get('extra') or {}
if not extra and data.get('stats') and data['stats'].get('extra_json'):
  extra = json.loads(data['stats']['extra_json'])
table = extra.get('enhance_table') or []
assert len(table) == 16, f'enhance_table len {len(table)}'

want = {(r['enhance_level'], r['weapon_add_atk'], r['accuracy']) for r in expected['enhance_levels']}
got = {(r['enhance_level'], r['weapon_add_atk'], r['accuracy']) for r in table}
assert want == got, f'mismatch {want ^ got}'

variants = {v['enhance_level']: v for v in data['variants']}
for lv in range(16):
  assert lv in variants, f'missing variant +{lv}'

# spot checks from screenshots
checks = {
  0: (0, 0),
  1: (3, 0),
  6: (18, 0),
  7: (23, 3),
  8: (28, 6),
  9: (33, 9),
  10: (43, 15),
  15: (93, 45),
}
by_lv = {r['enhance_level']: r for r in table}
for lv, (add, acc) in checks.items():
  row = by_lv[lv]
  assert row['weapon_min_atk'] == 20 and row['weapon_max_atk'] == 84
  assert row['skill_damage'] == 3
  assert row['weapon_add_atk'] == add and row['accuracy'] == acc, (lv, row)

print('VERIFY PASS', name, 'levels=0..15')
print(' +0 add', by_lv[0]['weapon_add_atk'], ' +15 add', by_lv[15]['weapon_add_atk'], 'acc', by_lv[15]['accuracy'])
PY
