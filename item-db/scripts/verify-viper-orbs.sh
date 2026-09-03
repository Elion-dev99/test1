#!/usr/bin/env bash
# Verify all Viper orbs have +0〜+15 and the user-specified enhance formula.
set -euo pipefail
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$API_BASE" "$ROOT/data/vampir-enhance/viper-orbs.json" <<'PY'
import json, sys, urllib.request, urllib.parse

api, path = sys.argv[1], sys.argv[2]
doc = json.load(open(path, encoding='utf-8'))
expected = {row['name']: row for row in doc['items']}
UA = {'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Verify/1.0)'}

def expected_bonus(lv):
    atk = hit = 0
    for i in range(1, lv + 1):
        if i <= 6:
            atk += 3
        elif i <= 9:
            atk += 5
            hit += 3
        else:
            atk += 10
            hit += 6
    return atk, hit

def get(p):
    req = urllib.request.Request(api + p, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

fail = 0
for name, row in expected.items():
    detail = get('/api/items/lookup?' + urllib.parse.urlencode({'name': name}))
    if not detail.get('success'):
        print('MISSING', name)
        fail += 1
        continue
    data = detail['data']
    item = data['item']
    extra = data.get('extra') or {}
    if not extra and data.get('stats') and data['stats'].get('extra_json'):
        extra = json.loads(data['stats']['extra_json'])
    table = extra.get('enhance_table') or []
    variants = {v['enhance_level']: v for v in (data.get('variants') or [])}

    if len(table) != 16:
        print('TABLE_LEN', name, len(table))
        fail += 1
    if len(variants) != 16:
        print('VARIANT_COUNT', name, len(variants), sorted(variants))
        fail += 1

    if item.get('rarity') != row['rarity']:
        print('RARITY', name, item.get('rarity'), 'want', row['rarity'])
        fail += 1

    base = row['stats']['extra_json']
    base_min = base['weapon_min_atk']
    base_max = base['weapon_max_atk']
    by_lv = {r['enhance_level']: r for r in table}
    for lv in (0, 6, 7, 9, 10, 15):
        atk, hit = expected_bonus(lv)
        rec = by_lv.get(lv)
        if not rec:
            print('NO_TABLE_ROW', name, lv)
            fail += 1
            continue
        if rec.get('weapon_min_atk') != base_min or rec.get('weapon_max_atk') != base_max:
            print('BASE_ATK', name, lv, rec.get('weapon_min_atk'), rec.get('weapon_max_atk'), 'want', base_min, base_max)
            fail += 1
        if rec.get('weapon_add_atk') != atk or rec.get('accuracy') != hit:
            print('BONUS', name, lv, rec.get('weapon_add_atk'), rec.get('accuracy'), 'want', atk, hit)
            fail += 1
        if lv not in variants:
            print('NO_VARIANT', name, lv)
            fail += 1

print('checked', len(expected), 'orbs')
if fail:
    print('FAIL', fail)
    sys.exit(1)
print('ok')
PY
