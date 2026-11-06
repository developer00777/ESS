# Running the ESS portal on Cloudflare

Branch: `feat/cloudflare-migration`

Everything runs on Cloudflare: the app in a Cloudflare container, its tables
in **D1**, uploaded files in **R2**, and **Redis** inside the container.

---

## 1. System design

```
  champ-hr.com
       │
       ▼
  Worker (cloudflare/src/index.ts)  ── forwards every request
       │
       ▼
  Container: one instance, always on (cloudflare/Dockerfile)
   ├─ SvelteKit app on Node, port 3000, background jobs on timers
   └─ Redis on localhost: sign-in sessions, login rate limits, presence, caches
       │
       │  plain HTTP to 198.51.100.7, intercepted by the Worker, never leaves Cloudflare
       ▼
  Worker bridge (cloudflare/src/bridge.ts)
   ├─ /d1/…     → DB     D1 "champ-hr-ess": every table
   └─ /files/…  → FILES  R2 "champ-hr-ess-files": profile pictures, policy
                         documents, announcement and chat attachments
```

| On Railway | On Cloudflare |
| ---------- | ------------- |
| API container | Cloudflare Containers, one `standard-2` instance |
| Postgres | **D1** (SQLite). Schema: `src/lib/server/db/schema.ts`, migrations: `migrations/` |
| MongoDB (activity log, uploaded files) | Activity log rows in **D1**, file bytes in **R2** (`src/lib/server/db/store.ts`) |
| Redis | **Redis inside the container**, memory only |

**Why a bridge:** only a Worker can use D1 and R2 bindings. The app in the
container sends each query and file operation to the Worker, which runs it
with its bindings (`src/lib/server/cloudflare-bridge.ts` is the app's side).
No API keys exist anywhere.

**What a restart loses:** nothing from D1 or R2. Redis is reset, so everyone
signs in again after a deploy or restart.

**Backups:** D1 Time Travel restores the database to any minute of the last
30 days (`npx wrangler d1 time-travel restore champ-hr-ess --timestamp=…`).

**Why exactly one instance:** the background jobs (emails, reminders, Zoom,
ProHance, Clerk sync) run inside the app. A second copy would send every email
twice.

---

## 2. One-time setup

### 2.1 Cloudflare account

- **Workers Paid plan** ($5/month). Containers need it.
- For the final switch, the **`champ-hr.com` domain** added to the account.

### 2.2 The database and the file bucket

Nothing to do: the first deploy creates the D1 database `champ-hr-ess` and the
R2 bucket `champ-hr-ess-files` (wrangler provisions bindings that have no id),
and later deploys keep using them. For the import in section 4 you need
`npx wrangler login` once, from `cloudflare/`.

### 2.3 Secrets

Plain settings are in `cloudflare/wrangler.jsonc` → `vars`. Everything else is
a secret: `npx wrangler secret put NAME` from `cloudflare/`, or the dashboard
(*Workers & Pages → champ-hr-ess → Settings → Variables and Secrets*). Copy
the values from Railway → app service → *Variables*.

**Required**

```
JWT_SECRET       JWT_REFRESH_SECRET
SUPER_ADMIN_EMAIL   SUPER_ADMIN_PASSWORD   SUPER_ADMIN_FULL_NAME
```

**The ones you use today** (skip any that are empty on Railway)

```
RESEND_API_KEY  RESEND_WEBHOOK_SECRET  RESEND_FROM
AUTH_PROVIDER   PUBLIC_CLERK_PUBLISHABLE_KEY  CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET  CLERK_AUTHORIZED_PARTIES
ZOOM_ACCOUNT_ID  ZOOM_CLIENT_ID  ZOOM_CLIENT_SECRET  ZOOM_WEBHOOK_SECRET  ZOOM_DEFAULT_HOST
OPENROUTER_API_KEY  OPENROUTER_MODEL
EASYTIME_IMPORT_TOKEN
PROHANCE_BASE_URL  PROHANCE_WS_USER  PROHANCE_WS_PASSWORD  Prohance_API_KEY  PROHANCE_POLL_MINUTES
DEVELOPER_EMAIL  DEVELOPER_PASSWORD  DEVELOPER_FULL_NAME
VAPID_PUBLIC_KEY  VAPID_PRIVATE_KEY
```

`DATABASE_URL`, `MONGO_URL` and `REDIS_URL` are **not** used any more. Delete
them if they were set as secrets earlier. Keep `PROHANCE_POLL_MINUTES` at `0`
for now (section 6).

---

## 3. Deploy

Push the branch (Workers Builds deploys it), or from `cloudflare/` run
`npm run deploy`. On every start the container:

1. checks that D1 and R2 answer through the bridge (it refuses to start otherwise),
2. starts Redis,
3. applies any new migration in `migrations/` (`src/lib/server/db/migrate.ts`,
   all of it in one D1 batch, so a failure changes nothing),
4. creates the super admin if that account does not exist, then starts the app.

---

## 4. Copy the Railway data in (once)

Do this in a quiet hour, **right before** the switch in section 5, with the
Railway app service **stopped**, so nothing changes during the copy.

1. Deploy once (section 3) so the container creates the tables.
2. On Railway, turn on *Public Networking* for Postgres and MongoDB and copy
   their public URLs.
3. From the repo root:

   ```powershell
   $env:DATABASE_URL = "<Railway Postgres public URL>"
   $env:MONGO_URL    = "<Railway MongoDB public URL>"
   npx tsx scripts/cloudflare/import-to-d1.ts --remote --dry-run      # counts only
   npx tsx scripts/cloudflare/import-to-d1.ts --remote --replace
   ```

   `--replace` empties D1 first. The container's first start has already
   seeded the super admin, and that row would clash with the copied one.

The script (`scripts/cloudflare/import-to-d1.ts`):

- copies every Postgres table, converting each value (timestamps,
  booleans, JSON),
- copies the activity log into D1 and every uploaded file into R2,
- keeps every id, so links between rows, chat attachments and
  announcement files still resolve,
- ends by checking every foreign key.

Passwords are copied as their argon2 hashes and work unchanged.

4. Restart the container so nobody keeps a session from before the copy:
   change any variable or run `npm run deploy`.

Clear the two environment variables afterwards. They hold database passwords.

---

## 5. Switch `champ-hr.com` over

1. Set `ORIGIN` and `PORTAL_URL` in `cloudflare/wrangler.jsonc` to `https://champ-hr.com`.
2. Make sure the **Railway app service is stopped**, so two copies never run
   the background jobs at once.
3. Deploy.
4. Cloudflare Dashboard → *Workers & Pages* → `champ-hr-ess` →
   *Settings → Domains & Routes → Add → Custom domain* → `champ-hr.com`.

Webhooks (Clerk, Zoom, Resend) and the EasyTime bridge all call `champ-hr.com`,
so they need no change.

**Rollback:** remove the custom domain, point DNS back at Railway, and start the
Railway app service. Railway's databases are untouched by the import (it only
reads them), but anything entered on Cloudflare after the switch is not in them.

---

## 6. Day-to-day

| Task | How |
| ---- | --- |
| Deploy app changes | push the branch, or `npm run deploy` in `cloudflare/` |
| Live logs | `npm run tail` in `cloudflare/` |
| Change a secret | change it; the Worker restarts the container on the next request |
| Schema change | edit `schema.ts`, run `npm run db:generate`, commit the new file in `migrations/`; the container applies it on start |
| Look at the data | `npx wrangler d1 execute champ-hr-ess --remote --command "select count(*) from users"` |
| Restore the database | `npx wrangler d1 time-travel restore champ-hr-ess --timestamp=<ISO time>` |

Local runs: `wrangler dev` cannot run containers on Windows (it needs WSL).
`docker-compose.yml` and the root `Dockerfile` still describe the Railway
Postgres setup and do not work with this branch.

**Speed:** every query is a round trip from the container through the Worker to
D1. A page that runs many queries one after another is slower than it was on
localhost Postgres. Watch the slow pages after the switch.

**Cost (check Cloudflare's current price list):** Workers Paid $5/month,
Containers for one always-on `standard-2` instance, plus D1 and R2 usage
(small at this size).

---

## 7. ⚠ ProHance

ProHance only accepts calls from **whitelisted IP addresses**, and Cloudflare
containers have no fixed outgoing IP. Until a static IP is in place, keep
`PROHANCE_POLL_MINUTES=0`. Everything else works.

**Plan:** buy a dedicated egress (static) IP from Cloudflare.

1. Confirm with Cloudflare that it covers outgoing traffic from
   **Containers**.
2. Ask ProHance to whitelist that IP.
3. Set `PROHANCE_POLL_MINUTES` to `30`.

Nothing is lost while it is off. Each sync re-pulls from the 25th of the
previous month, so the first run fills the gap. Use Admin → manual sync for
anything older.

EasyTime is not affected: its bridge pushes **to** the portal.
