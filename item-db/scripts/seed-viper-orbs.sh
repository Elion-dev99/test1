#!/usr/bin/env bash
# Seed all Viper orbs (+0〜+15) from data/vampir-enhance/viper-orbs.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${1:-${WORKER_URL:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "Usage: $0 https://mmorpg-item-db.xxx.workers.dev"
  exit 1
fi
API_BASE="${API_BASE%/}"
DATA="$ROOT/data/vampir-enhance/viper-orbs.json"
BATCH="${BATCH:-5}"
python3 - "$API_BASE" "$DATA" "$BATCH" <<'PY'
import json, sys, time, urllib.request, urllib.error

api, path, batch_s = sys.argv[1], sys.argv[2], sys.argv[3]
batch = int(batch_s)
doc = json.load(open(path, encoding='utf-8'))
items = doc['items']
UA = 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)'

def post(chunk, label):
    payload = json.dumps({'items': chunk}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        api + '/api/seed',
        data=payload,
        headers={
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': UA,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read().decode()
            print(label, r.status, body[:500])
            parsed = json.loads(body)
            errs = (parsed.get('data') or {}).get('errors') or []
            if errs:
                raise SystemExit(f'{label} errors: {errs}')
    except urllib.error.HTTPError as e:
        print(label, 'FAIL', e.code, e.read()[:800])
        raise

n = len(items)
for i in range(0, n, batch):
    chunk = items[i:i + batch]
    post(chunk, f'batch {i // batch + 1} ({i + 1}-{i + len(chunk)}/{n})')
    time.sleep(0.35)
print('ok', n, 'orbs')
PY
