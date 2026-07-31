# EasyTime Pro / ZKTeco push integration

How biometric device attendance reaches the `attendance` table via the push (ADMS) method.

## How it works

EasyTime Pro / ZKTeco devices in ADMS mode push punches over plain HTTP to a fixed URL path,
`/iclock/cdata`, using two request types:

- `GET  /iclock/cdata?SN=<device serial>&options=all` — handshake/config poll on startup.
- `POST /iclock/cdata?SN=<device serial>&table=ATTLOG` — the actual punch data, tab-separated,
  one punch per line: `PIN\tTIMESTAMP\tSTATUS\t...`.

Our endpoint implements exactly this at:

```
POST/GET  /api/attendance/device-push/iclock/cdata
```

Responses are `text/plain` (`OK`, or the handshake config block) because that's what device
firmware expects — a JSON response is treated as a failed push and the device will retry/back off.

### Auth

Stock ADMS has no token concept (it typically relies on network trust — VPN/IP allowlist).
We require a `token` query param on every request instead, since this endpoint is
internet-reachable. Requests without a valid, unrevoked token get a `401` before any parsing.

### Employee mapping

Devices only know a numeric enrollment PIN, not our user UUIDs. HR must map each employee once:

```
PUT /api/admin/users/<user-id>/biometric-device
Body: { "biometricDeviceId": "1001" }
```

(`1001` = the PIN assigned when the fingerprint/face was enrolled on the device.) Punches for
unmapped PINs are still logged to `device_punches` for audit, but don't create attendance rows.

### Punch handling semantics

- `STATUS` 0/1 from the device (check-in/check-out) is trusted when present.
- If the device doesn't send a status, we infer: first punch of the day = check-in, next = check-out.
- Retries/duplicates/out-of-order delivery are handled idempotently: check-in only moves
  *earlier*, check-out only moves *later* — a resent punch never regresses good data.
- Every raw punch (matched or not) is stored in `device_punches` for audit/replay.

## Setup

1. Generate a push token:

   ```
   npm run device-token:generate -- "EasyTime Pro - Main Office"
   ```

   This prints the plaintext token **once**. Store it in the team's password manager, not in
   the repo or Slack. The database only ever stores its SHA-256 hash.

2. In EasyTime Pro, configure the device/software to push (ADMS) to:

   ```
   https://<your-app-domain>/api/attendance/device-push/iclock/cdata?token=<the generated token>
   ```

   If EasyTime Pro's config UI splits URL and query params, put `token=<value>` in whatever field
   maps to the request's query string — it must arrive on every request, GET and POST alike.

3. Map each employee's device PIN via the admin API (or a future admin UI) so pushes resolve
   to a user.

4. Revoke a token by setting `revoked_at` on its `device_push_tokens` row (no revoke endpoint yet —
   direct DB update, or ask for one to be added if this becomes routine).

## What was deliberately not built

- No plaintext/reversible token storage — only the hash, so a DB leak doesn't leak the secret
  devices use.
- No trust in device-reported PIN → employee identity beyond the explicit mapping table; an
  unmapped PIN cannot write attendance for an arbitrary user.
- No admin UI for token management yet — it's a CLI script + raw table, matching how `db:seed`
  and other one-off setup tasks in this repo already work.
