#!/usr/bin/env bash
# Ensure remote D1 "item-db" exists and wrangler.jsonc has a real database_id
set -euo pipefail

cd "$(dirname "$0")/.."

PLACEHOLDER='00000000-0000-0000-0000-000000000000'
if ! grep -q "$PLACEHOLDER" wrangler.jsonc; then
  echo "database_id already set"
  exit 0
fi

echo "Creating or resolving D1 database item-db..."
npx wrangler d1 create item-db --location apac --update-config --binding DB || true

if ! grep -q "$PLACEHOLDER" wrangler.jsonc; then
  echo "database_id updated by wrangler create"
  exit 0
fi

npx wrangler d1 list --json > /tmp/d1.json
ID=$(python3 - <<'PY'
import json
dbs = json.load(open("/tmp/d1.json"))
match = next((x for x in dbs if x.get("name") == "item-db"), None)
if not match:
    raise SystemExit("item-db not found in wrangler d1 list")
print(match["uuid"])
PY
)

python3 - <<PY
import pathlib, re
p = pathlib.Path("wrangler.jsonc")
text = p.read_text()
text = re.sub(
    r'"database_id":\s*"[^"]+"',
    '"database_id": "$ID"',
    text,
    count=1,
)
p.write_text(text)
print("patched database_id", "$ID")
PY
