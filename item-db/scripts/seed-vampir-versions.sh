#!/usr/bin/env bash
# Seed game versions and backfill items.game_version
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
DATA="$ROOT/data/vampir-versions.json"
python3 -u - "$API_BASE" "$DATA" <<'PY'
import json, sys, urllib.request, urllib.error, urllib.parse

api, path = sys.argv[1], sys.argv[2]
doc = json.load(open(path, encoding='utf-8'))
UA = 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)'

def call(method, p, payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        api + p, data=data, method=method,
        headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {'raw': body[:500]}
        return e.code, parsed

code, body = call('POST', '/api/seed', {'versions': doc['versions']})
print('versions', code, body.get('data') or body)
if code >= 400:
    raise SystemExit(1)

# Backfill via tagging items returned from catalog
baseline = doc['backfill']['baseline_version']
latest_from = doc['backfill']['latest_from_created_at']
current = next(v['version_key'] for v in doc['versions'] if v.get('is_current'))

code, listing = call('GET', '/api/items?limit=500')
items = listing.get('data') or []
print('catalog', len(items))

baseline_items = []
latest_items = []
for it in items:
    created = (it.get('created_at') or '')[:10]
    if created >= latest_from:
        latest_items.append(it['name'])
    else:
        baseline_items.append(it['name'])

def tag(names, version):
    chunk = [{'name': n, 'game_version': version} for n in names]
    # seed update requires category etc. if creating; for existing, updateItem only sets provided fields
    # Our seed update always passes category from raw — if missing may set undefined.
    # So fetch each item fields... Better: send minimal via a dedicated path.
    # Use seed with only name + game_version; updateItem ignores undefined category if we fix API.
    # Current updateItem: `if (value === undefined) continue` — but seed always passes category: raw.category which is undefined → skipped. Good.
    ok = 0
    BATCH = 40
    for i in range(0, len(chunk), BATCH):
        part = chunk[i:i+BATCH]
        c, b = call('POST', '/api/seed', {'items': part})
        d = b.get('data') or {}
        print(f'tag {version} batch {i//BATCH+1} http={c} existing={d.get("items_existing")} created={d.get("items_created")} err={d.get("errors")}')
        if c >= 400 or d.get('errors'):
            raise SystemExit(1)
        ok += len(part)
    return ok

print('baseline tag', tag(baseline_items, baseline))
print('latest tag', tag(latest_items, current))

code, ver = call('GET', '/api/versions')
print('current', (ver.get('data') or {}).get('current'))
code, stats = call('GET', '/api/stats')
print('stats', stats.get('data'))
PY
