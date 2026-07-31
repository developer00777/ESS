#!/bin/sh
set -e

npx drizzle-kit migrate

# One-time cleanup: earlier deploys auto-seeded placeholder demo accounts. Remove
# exactly those known placeholder emails (and their dependent rows) so the real seed
# (the SUPER_ADMIN_EMAIL account below) can populate a clean users table. This never
# touches any other account. See clear-placeholder-accounts.ts.
npx tsx src/lib/server/db/clear-placeholder-accounts.ts

# SUPER_ADMIN_EMAIL/PASSWORD/FULL_NAME must be set in Railway — no default ships here,
# so this always maps to whichever real person Railway's variables were configured for.
if [ -z "$SUPER_ADMIN_EMAIL" ] || [ -z "$SUPER_ADMIN_PASSWORD" ]; then
  echo "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must both be set to seed/identify the super admin account." >&2
  exit 1
fi

# Seed exactly when the designated super admin account doesn't exist yet — checking
# total user count would wrongly skip seeding once any other real employee is added.
SUPER_ADMIN_EXISTS=$(node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('select count(*)::int as n from users where email = \$1', [process.env.SUPER_ADMIN_EMAIL.toLowerCase()]).then((r) => {
  console.log(r.rows[0].n);
  pool.end();
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
")

if [ "$SUPER_ADMIN_EXISTS" = "0" ]; then
  echo "Super admin ($SUPER_ADMIN_EMAIL) not found, running seed..."
  npx tsx src/lib/server/db/seed.ts
else
  echo "Super admin ($SUPER_ADMIN_EMAIL) already present, skipping seed."
fi

exec node build/index.js
