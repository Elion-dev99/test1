#!/usr/bin/env bash
# Idempotently add columns missing from the pre-redesign D1 schema.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="${D1_DATABASE_NAME:-item-db}"

has_column() {
  local table="$1" col="$2"
  npx wrangler d1 execute "$DB_NAME" --remote --json --command \
    "PRAGMA table_info($table);" \
    | python3 -c "
import json,sys
rows=json.load(sys.stdin)
# wrangler --json wraps results
flat=[]
for block in rows if isinstance(rows,list) else [rows]:
  res=block.get('results') or block.get('result') or []
  if isinstance(res,list) and res and isinstance(res[0],dict) and 'results' in res[0]:
    flat.extend(res[0]['results'])
  elif isinstance(res,list):
    flat.extend(res)
print('yes' if any(r.get('name')=='$col' for r in flat) else 'no')
"
}

add_column_if_missing() {
  local table="$1" col="$2" ddl="$3"
  local present
  present=$(has_column "$table" "$col")
  if [[ "$present" == "yes" ]]; then
    echo "OK column $table.$col"
    return 0
  fi
  echo "ADD column $table.$col"
  npx wrangler d1 execute "$DB_NAME" --remote --command "$ddl"
}

echo "==> patch remote schema on $DB_NAME"
add_column_if_missing items stackable \
  "ALTER TABLE items ADD COLUMN stackable INTEGER NOT NULL DEFAULT 1;"
add_column_if_missing market_snapshots captured_by \
  "ALTER TABLE market_snapshots ADD COLUMN captured_by TEXT DEFAULT 'manual';"
add_column_if_missing drops boss_id \
  "ALTER TABLE drops ADD COLUMN boss_id INTEGER REFERENCES bosses(id) ON DELETE SET NULL;"

npx wrangler d1 execute "$DB_NAME" --remote --command \
  "CREATE INDEX IF NOT EXISTS idx_drops_boss_id ON drops(boss_id);" || true

echo "==> patch done"
