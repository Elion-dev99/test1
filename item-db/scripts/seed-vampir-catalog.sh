#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
CATALOG="$ROOT/data/vampir-catalog.json"
python3 - "$API_BASE" "$CATALOG" <<'PY'
import json, sys, time, urllib.request, urllib.error

api, path = sys.argv[1], sys.argv[2]
catalog = json.load(open(path, encoding='utf-8'))
UA = 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)'

def call(payload):
  data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
  req = urllib.request.Request(
    api + '/api/seed', data=data, method='POST',
    headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA},
  )
  try:
    with urllib.request.urlopen(req, timeout=180) as res:
      return res.status, json.loads(res.read().decode())
  except urllib.error.HTTPError as e:
    return e.code, json.loads(e.read().decode() or '{}')

code, body = call({'bosses': catalog.get('bosses', []), 'items': []})
print('bosses', code, body.get('data') or body)
items = catalog.get('items', [])
BATCH = 25
total = {'items_created':0,'items_existing':0,'sources_added':0,'drops_added':0,'errors':[]}
for i in range(0, len(items), BATCH):
  chunk = items[i:i+BATCH]
  code, body = call({'items': chunk})
  d = body.get('data') or {}
  print(f'batch {i//BATCH+1} http={code} created={d.get("items_created")} existing={d.get("items_existing")} drops={d.get("drops_added")} err={len(d.get("errors",[]))}')
  for k in total:
    if k == 'errors':
      total[k].extend(d.get('errors', []))
    else:
      total[k] += d.get(k, 0)
  time.sleep(0.15)
print('TOTAL', {k: (len(v) if k=='errors' else v) for k,v in total.items()})
if total['errors']:
  print('errors sample:', total['errors'][:10])
stats = urllib.request.urlopen(urllib.request.Request(api+'/api/stats', headers={'User-Agent':UA}), timeout=30).read().decode()
print('STATS', stats)
if total['errors']:
  raise SystemExit(1)
PY
