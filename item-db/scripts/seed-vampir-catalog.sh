#!/usr/bin/env bash
# Seed all curated VAMPIR catalog items into the Item DB API.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
CATALOG="$ROOT/data/vampir-catalog.json"
if [[ ! -f "$CATALOG" ]]; then
  echo "missing $CATALOG"
  exit 1
fi

python3 - "$API_BASE" "$CATALOG" <<'PY'
import json, sys, urllib.request, urllib.error

api, path = sys.argv[1], sys.argv[2]
catalog = json.load(open(path, encoding='utf-8'))
payload = {
  'bosses': catalog.get('bosses', []),
  'items': catalog.get('items', []),
}
data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request(
  api + '/api/seed',
  data=data,
  headers={'Content-Type': 'application/json; charset=utf-8'},
  method='POST',
)
try:
  with urllib.request.urlopen(req, timeout=120) as res:
    body = res.read().decode()
    print(body)
    parsed = json.loads(body)
except urllib.error.HTTPError as e:
  body = e.read().decode()
  print(body)
  raise SystemExit(f'HTTP {e.code}')

if not parsed.get('success') and parsed.get('data', {}).get('errors'):
  errs = parsed['data']['errors']
  print(f'WARN {len(errs)} errors (first 10):')
  for e in errs[:10]:
    print(' -', e)
stats = urllib.request.urlopen(api + '/api/stats', timeout=30).read().decode()
print('STATS', stats)
PY
