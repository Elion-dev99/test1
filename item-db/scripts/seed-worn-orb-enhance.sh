#!/usr/bin/env bash
# Seed 精鋭の古びたオーブ +0〜+15 enhance stats
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
DATA="$ROOT/data/vampir-enhance/seiei-furubita-orb.json"
python3 - "$API_BASE" "$DATA" <<'PY'
import json, sys, urllib.request, urllib.error

api, path = sys.argv[1], sys.argv[2]
doc = json.load(open(path, encoding='utf-8'))
item = dict(doc['item'])
item['enhance_levels'] = doc['enhance_levels']
item['stats'] = {
  'attack': doc['base_stats']['weapon_max_atk'],
  'accuracy': 0,
  'extra_json': {
    **doc['base_stats'],
    'enhance_table': doc['enhance_levels'],
    'source_note': doc['meta'].get('source_note'),
    'scaling_notes': doc['meta'].get('notes'),
  },
}
payload = {'items': [item]}
data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request(
  api + '/api/seed', data=data, method='POST',
  headers={
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)',
  },
)
try:
  with urllib.request.urlopen(req, timeout=60) as res:
    print(res.read().decode())
except urllib.error.HTTPError as e:
  print(e.read().decode())
  raise SystemExit(e.code)
PY
