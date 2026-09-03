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
python3 -u - "$API_BASE" "$DATA" "$ROOT" <<'PY'
import json, sys, urllib.request, urllib.error
from pathlib import Path

api, path, root = sys.argv[1], sys.argv[2], Path(sys.argv[3])
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

baseline = doc['backfill']['baseline_version']
latest = doc['backfill']['latest_version']
orb_path = root / 'data' / doc['backfill']['latest_name_list']
latest_names = {row['name'] for row in json.load(open(orb_path, encoding='utf-8'))['items']}
# 精鋭の古びたオーブ is in the orb set; keep all viper orbs as latest catalog additions
print('latest name set', len(latest_names))

code, listing = call('GET', '/api/items?limit=500')
items = listing.get('data') or []
print('catalog', len(items))

baseline_items = [i['name'] for i in items if i['name'] not in latest_names]
latest_items = [i['name'] for i in items if i['name'] in latest_names]

def tag(names, version):
    chunk = [{'name': n, 'game_version': version} for n in names]
    BATCH = 40
    for i in range(0, len(chunk), BATCH):
        part = chunk[i:i + BATCH]
        c, b = call('POST', '/api/seed', {'items': part})
        d = b.get('data') or {}
        print(f'tag {version} batch {i // BATCH + 1} http={c} existing={d.get("items_existing")} err={d.get("errors")}')
        if c >= 400 or d.get('errors'):
            raise SystemExit(1)
    return len(names)

print('baseline tag', tag(baseline_items, baseline))
print('latest tag', tag(latest_items, latest))

code, ver = call('GET', '/api/versions')
print('current', (ver.get('data') or {}).get('current'))
code, stats = call('GET', '/api/stats')
print('stats', stats.get('data'))
code, latest_list = call('GET', '/api/items?version=latest&limit=10')
print('latest sample', [i['name'] for i in (latest_list.get('data') or [])])
PY
