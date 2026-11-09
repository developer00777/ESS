#!/usr/bin/env bash
# ESS "box": the portal plus Redis in ONE Cloudflare container.
#
#   Redis 7 (127.0.0.1:6379)  sessions, login rate limits, presence, caches
#   └── the SvelteKit app (start.sh → migrate, seed, node build/index.js, :3000)
#
# The data is NOT in the container: every table is in D1 and every uploaded
# file is in R2. The app reaches both with plain HTTP to CF_BRIDGE_URL, which
# the Worker intercepts and serves from its bindings (cloudflare/src/index.ts).
# So nothing is lost when the container restarts or a deploy replaces it,
# except Redis: everyone signs in again after a restart.
set -uo pipefail

log() { echo "[ess-box] $(date -u +%H:%M:%S) $*"; }

BRIDGE=${CF_BRIDGE_URL:-http://198.51.100.7}
DATA=/var/lib/ess
mkdir -p "$DATA"

# --- 0. D1 and R2 must answer before anything starts -------------------------
# Give up after ~2 minutes: exiting lets the Worker start a fresh container
# (with the bridge attached again) instead of sitting here not listening.
ok=0
for i in $(seq 1 15); do
  if curl -fsS -m 6 "$BRIDGE/_ping" >/dev/null 2>&1; then ok=1; break; fi
  log "D1/R2 bridge not answering yet (try $i/15)"
  sleep 2
done
if [ "$ok" != 1 ]; then
  log "FATAL: D1/R2 bridge at $BRIDGE did not answer. Check the DB and FILES bindings in wrangler.jsonc."
  curl -sS -m 20 "$BRIDGE/_ping" 2>&1 | head -5
  exit 1
fi
log "D1 and R2 reachable"

# --- 1. Redis (memory only) --------------------------------------------------
log "starting redis"
redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no --daemonize yes \
  --logfile "$DATA/redis.log" || exit 1

export REDIS_URL="redis://127.0.0.1:6379"
export CF_BRIDGE_URL="$BRIDGE"

# --- 2. The app ---------------------------------------------------------------
cd /app || exit 1
./start.sh &
APP_PID=$!

shutdown() {
  log "received $1 — stopping app"
  kill -TERM "$APP_PID" 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
  redis-cli -h 127.0.0.1 shutdown nosave >/dev/null 2>&1 || true
  log "stopped"
  exit 0
}
trap 'shutdown SIGTERM' TERM
trap 'shutdown SIGINT' INT

wait "$APP_PID"
code=$?
log "app exited with code $code"
redis-cli -h 127.0.0.1 shutdown nosave >/dev/null 2>&1 || true
exit "$code"
