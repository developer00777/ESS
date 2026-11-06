#!/bin/sh
set -e

# Runs inside the Cloudflare container (cloudflare/ess-box.sh starts it). The
# database is D1, reached through the Worker at CF_BRIDGE_URL.

# Tables: apply anything new in migrations/ (one D1 batch, all or nothing).
npx tsx src/lib/server/db/migrate.ts

# One-time cleanup: earlier deploys auto-seeded placeholder demo accounts. Remove
# exactly those known placeholder emails (and their dependent rows) so the real seed
# (the SUPER_ADMIN_EMAIL account below) can populate a clean users table. This never
# touches any other account. See clear-placeholder-accounts.ts.
npx tsx src/lib/server/db/clear-placeholder-accounts.ts

# SUPER_ADMIN_EMAIL/PASSWORD/FULL_NAME must be set as Worker secrets — no default
# ships here, so this always maps to whichever real person they were configured for.
if [ -z "$SUPER_ADMIN_EMAIL" ] || [ -z "$SUPER_ADMIN_PASSWORD" ]; then
  echo "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must both be set to seed/identify the super admin account." >&2
  exit 1
fi

# Creates the super admin only when that account does not exist yet.
npx tsx src/lib/server/db/seed.ts

# Optional: the developer's Super Admin login (DEVELOPER_EMAIL, see
# ensure-developer.ts). Created once when missing; never blocks the boot.
if [ -n "$DEVELOPER_EMAIL" ]; then
  npx tsx src/lib/server/db/ensure-developer.ts || true
fi

exec node build/index.js
