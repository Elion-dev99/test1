#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is required"
  echo "Create a token at: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
  echo "Required permissions: Account > Cloudflare Workers Scripts (Edit), Account > D1 (Edit)"
  exit 1
fi

echo "==> Installing dependencies..."
npm install

echo "==> Creating D1 database (skip if already exists)..."
npx wrangler d1 create boss-notifier-db --location apac --update-config --binding DB 2>/dev/null || true

echo "==> Applying D1 migrations..."
npx wrangler d1 migrations apply boss-notifier-db --remote

echo "==> Deploying Worker..."
npx wrangler deploy

echo ""
echo "Done! Open your Worker URL shown above."
echo "Configure Discord Webhook in the dashboard Settings tab."
