#!/bin/sh
set -e

npx drizzle-kit migrate

USER_COUNT=$(node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('select count(*)::int as n from users').then((r) => {
  console.log(r.rows[0].n);
  pool.end();
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
")

if [ "$USER_COUNT" = "0" ]; then
  echo "No users found, running seed..."
  npx tsx src/lib/server/db/seed.ts
else
  echo "Users already present ($USER_COUNT), skipping seed."
fi

exec node build/index.js
