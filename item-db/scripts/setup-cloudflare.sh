#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is required"
  exit 1
fi

echo "==> Installing dependencies..."
npm ci

echo "==> Creating D1 database item-db (skip if exists)..."
npx wrangler d1 create item-db --location apac --update-config --binding DB 2>/dev/null || true

echo "==> Applying migrations..."
npx wrangler d1 migrations apply item-db --remote

echo "==> Deploying Worker mmorpg-item-db..."
npx wrangler deploy

echo ""
echo "Done. Open the Worker URL above."
