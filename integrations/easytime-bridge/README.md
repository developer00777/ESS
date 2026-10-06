# EasyTime → ESS bridge (Chrome extension)

Copies biometric punches from **EasyTime Pro** (on the office network) into the **ESS portal**
(`https://champ-hr.com`). It runs inside Chrome on one office PC, reads EasyTime Pro's
transactions through the EasyTime login that is already open in that Chrome profile, and posts
them to ESS with an import token.

No EasyTime API license, no EasyTime password stored in the extension, and nothing installed on
the EasyTime server.

## Go-live checklist

1. **ESS is deployed with the bridge changes.** Opening
   `https://champ-hr.com/api/attendance/easytime-import` in a browser shows
   `invalid or missing token`. A `405` page means the changes are not live yet — stop here.
2. **An import token exists for this PC** (see *What you need*).
3. **On the VPN machine:** the VPN is connected, EasyTime Pro opens in Chrome, and
   `https://champ-hr.com` opens at the same time.
4. **Install** and **Configure** the extension (below). *Test EasyTime* and *Test ESS* both pass.
5. **First sync:** within a few minutes the popup says *Up to date*, and ESS → Admin Controls →
   Biometric → *Device feed* lists the batches with *Applied* counts.
6. **Unknown codes:** fix any codes listed in the popup on the employees' ESS profiles, then use
   *Re-send dates* for the days shown.
7. **Spot-check:** pick one employee and one day; their ESS attendance calendar matches the
   punches EasyTime Pro shows for that day.
8. **Recovery:** disconnect the VPN — the badge turns red; reconnect — the next sync clears it. Log
   out of EasyTime — the badge turns amber; log back in — it clears.
9. **Leave it running:** the PC stays on with Chrome allowed to run in the background, and the old
   handover token is revoked.

## What you need

- A Windows PC that stays on and can reach EasyTime Pro — on the office network or signed in to
  the VPN — with **Chrome 144 or newer** (`chrome://version`). While the VPN is connected the PC
  must still be able to open `https://champ-hr.com`; a full-tunnel VPN that blocks the internet
  stops the bridge from posting.
- Chrome allowed to use **Developer mode** (`chrome://extensions`).
- A **dedicated Chrome profile** for the bridge, logged in to EasyTime Pro — ideally with a
  read-only EasyTime user.
- An **ESS import token** for this PC. Either:
  - generate a random value and set it as the `EASYTIME_IMPORT_TOKEN` variable on the Railway
    *app* service (32+ characters; Railway redeploys the app):

    ```sh
    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
    ```

  - or create one in the database from the Railway *app* service:

    ```sh
    npm run import-token:generate -- "EasyTime Chrome bridge - <PC name>"
    ```

  Keep the token in a password manager; never send it over chat or email.
- Every employee's code in ESS matching their EasyTime `emp_code`.

## Install

1. Copy this `easytime-bridge` folder to the PC, e.g. `C:\ESS\easytime-bridge`.
2. In the bridge profile open `chrome://extensions`, switch on **Developer mode**, click
   **Load unpacked** and pick the folder.
3. Pin the extension (puzzle-piece icon → pin) so its badge is visible.
4. In Chrome settings → System, turn on **Continue running background apps when Google Chrome is
   closed**, so closing the window does not stop syncing.

## Configure

Open the extension's **Settings**:

| Field | Value |
|---|---|
| EasyTime Pro address | The address you open EasyTime Pro at, e.g. `http://192.168.1.20:8088` |
| ESS portal address | `https://champ-hr.com` |
| Import token | The token generated above |
| Sync every | 5 minutes (default) |
| First sync reads back | 7 days (default) |
| Punches per request | 500 (default) |

Click **Save** and allow Chrome access to both addresses. Then:

- **Test EasyTime** should say *EasyTime Pro answered with data* and *Date filter: works*.
- **Test ESS** should say *ESS accepted the token*.

The first sync starts within seconds and catches up on the look-back period one day at a time.
After that it only sends new punches.

## Day to day

| Badge | Meaning |
|---|---|
| none | Up to date |
| `…` grey | Syncing |
| `!` amber | Logged out of EasyTime Pro — log in again in this profile |
| `!` red | Something else is wrong — open the popup for the message |

The popup shows the last good sync, the last run's counts and any **employee codes ESS does not
know**. Fix those codes on the employees' ESS profiles, then use **Re-send dates** for the days
they punched. Re-sending is always safe: ESS skips punches it already has.

ESS shows the same feed under **Admin Controls → Biometric → Device feed**, including when this
bridge last checked in.

If the PC was off or the VPN dropped, nothing is lost: the next sync after it is back picks up
from where it stopped.

## How it works

- Reads `GET /iclock/api/transactions/` on EasyTime Pro with the browser's EasyTime session.
- Catch-up reads one day at a time (`start_time`/`end_time`). After that it reads newest-first by
  transaction id and stops at the last id it sent, so a terminal that uploads late is still
  picked up. If EasyTime ignores `ordering`, it re-reads a two-hour overlapping window instead.
- Posts JSON `{ "punches": [...], "agent": "..." }` to
  `POST /api/attendance/easytime-import` with `Authorization: Bearer <token>`, oldest punch
  first, at most 1000 per request.
- ESS keys every punch by employee code + minute, so re-sends are reported as *already in ESS*
  and never double-counted.
- Progress is saved after every successful batch (`chrome.storage.local`), so a Chrome restart
  resumes where it left off.

## Troubleshooting

| Message | Fix |
|---|---|
| Log in to EasyTime Pro in this Chrome profile | Open EasyTime from the popup and log in again |
| EasyTime Pro is not reachable | Connect the VPN (or the office network) and check the address |
| ESS is not reachable | The VPN may be routing all traffic; check `https://champ-hr.com` opens while it is connected |
| The EasyTime Pro user logged in here is not allowed to read transactions | Give that EasyTime user access to Attendance → Transactions |
| ESS rejected the import token | Paste the token again, or generate a new one if it was revoked |
| ESS answered HTTP 405 | The portal has not been deployed with the bridge changes yet |
| EasyTime Pro ignored the start_time/end_time filter | The EasyTime version does not support date filters; contact the developer |

## Development

`dev/mock-easytime.mjs` is a stand-in EasyTime Pro with a cookie login, paging and the
`/iclock/api/transactions/` filters:

```sh
node integrations/easytime-bridge/dev/mock-easytime.mjs
```

Open `http://localhost:8088/login/` in the bridge profile to log in, then point the extension at
`http://localhost:8088`. `http://localhost:8088/dev/punch?emp=TEST001` adds a punch now;
`&time=2026-10-01 09:00:00` adds a late upload for an earlier time. `EMP_CODES`, `DAYS` and
`PORT` environment variables change the seeded data.
