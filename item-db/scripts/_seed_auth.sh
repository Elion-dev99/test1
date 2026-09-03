#!/usr/bin/env bash
# Shared auth headers for seed scripts. Source this file.
# Requires ADMIN_PASSWORD env (same value as Cloudflare Worker secret).
seed_auth_headers_python() {
  # Emits a Python snippet defining AUTH headers dict (requires os imported).
  cat <<'PY'
import os
_ADMIN_PW = os.environ.get('ADMIN_PASSWORD', '').strip()
if not _ADMIN_PW:
    raise SystemExit('ADMIN_PASSWORD env is required for mutating seed calls')
AUTH = {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)',
    'X-Admin-Password': _ADMIN_PW,
}
UA_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; VampirItemDB-Seed/1.0)',
}
PY
}

require_admin_password() {
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    echo "ERROR: set ADMIN_PASSWORD (Cloudflare Worker secret) before seeding." >&2
    echo "  export ADMIN_PASSWORD='...'" >&2
    exit 1
  fi
}
