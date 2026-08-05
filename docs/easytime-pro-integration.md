# EasyTime Pro → Champ HR ESS Portal — Integration Handover

How biometric attendance gets from EasyTime Pro into the ESS portal.

**Method:** EasyTime Pro's scheduled **Custom Export** writes a tab-separated file;
a small scheduled job on that machine POSTs the file to the portal, which matches
each punch to an employee and updates their attendance.

**The join key is `{emp_code}` — and only `{emp_code}`.** It must equal the
employee's code in the portal (e.g. `CIPL2666`). Nothing else identifies the
person: not the name, not the card number, not the device PIN, not the email.

This is deliberate. Name matching is unreliable in this data — the HR tracker
spells the same person differently in different columns — and a wrong match would
credit one employee's attendance to another. So a punch either matches an
employee code exactly (case-insensitive, trimmed) or is stored unmatched for a
human to resolve. There is no fallback and no guessing.

The card number, device serial, terminal alias, temperature and mask flag are all
stored for audit, but never used to identify anyone.

---

## 0. Start here — what the IT team needs

Three things, and the portal side of all three is already done:

| # | What | Where it comes from |
|---|---|---|
| 1 | **Endpoint URL** — `https://<portal-domain>/api/attendance/easytime-import` | The portal owner; it's the live Railway domain |
| 2 | **Bearer token** | Already generated. In `docs/integration-credentials.md`, which is gitignored — ask the portal owner. Never in this file. |
| 3 | **Every employee's code set in the portal**, matching their EasyTime `emp_code` | §2 — this is Champ HR's job, not IT's |

Then, in order:

1. Create the Custom Export in EasyTime Pro with the exact template in §1a.
2. Run the **smoke test** in §1b — proves URL, token and network in one call.
3. Schedule the upload job (§1b).
4. Confirm the first real run reports `matchedCount > 0` and
   `unmatchedEmpCodes: []`.

Nothing needs installing on the portal side and no inbound firewall rule is
needed — the EasyTime Pro machine makes an ordinary outbound HTTPS POST.

---

## 1. What the EasyTime Pro team needs to configure

### 1a. The export template

In EasyTime Pro, create a Custom Export (the **Add** dialog) with **exactly** this
Data Template — field order matters, and fields are tab-separated:

```
{emp_code}	{first_name}	{last_name}	{dept_code}	{dept_name}	{date}	{time}	{verify_type}	{punch_state}	{work_code}	{card_number}	{area_name}	{terminal_alias}	{terminal_sn}	{temperature}	{mask_flag}
```

(In the dialog this appears as one line ending in `\r\n`.)

**Format Setting:**

| Setting | Value |
|---|---|
| Date Format | `yyyy-MM-DD` |
| Time Format | `HH:mm` |
| ID Digits | `0` |
| File Format | `Txt` (`.csv` also works) |

**Data Filter Setting:** export attendance transactions only.

**Export Time Setting:** whatever cadence suits — hourly, or once nightly after
the last shift ends. Every run should cover at least the period since the last
successful upload; overlapping ranges are safe (see *Re-sending is safe* below).

**Export Path Setting:** any local folder the upload job below can read.

### 1b. The upload job

A scheduled task (Windows Task Scheduler / cron) on the EasyTime Pro machine that
POSTs the newest exported file to the portal.

**Endpoint**

```
POST https://<portal-domain>/api/attendance/easytime-import
Authorization: Bearer <TOKEN>
```

Two accepted body formats — use whichever is easier.

**Recommended: PowerShell, uploading every file not yet sent.** Uploading only
the newest file loses punches whenever a run is missed or the machine reboots.
Re-uploading is harmless (see *Re-sending is safe*), so this sends anything
touched recently and moves each file aside once the portal accepts it.

```powershell
# C:\Scripts\Upload-EasyTime.ps1  — run every 30 min via Task Scheduler
$ErrorActionPreference = "Stop"

$Token   = "<TOKEN>"                      # from docs/integration-credentials.md
$Url     = "https://<portal-domain>/api/attendance/easytime-import"
$Export  = "C:\EasyTimePro\Exports"
$Sent    = "C:\EasyTimePro\Exports\sent"
$LogFile = "C:\EasyTimePro\Exports\upload.log"

New-Item -ItemType Directory -Force -Path $Sent | Out-Null

foreach ($File in Get-ChildItem "$Export\*.txt" | Sort-Object LastWriteTime) {
  try {
    $Response = curl.exe -sS -X POST $Url `
      -H "Authorization: Bearer $Token" `
      -F "file=@$($File.FullName)" 2>&1

    if ($Response -match '"rowCount"') {
      Add-Content $LogFile "$(Get-Date -f s)  OK    $($File.Name)  $Response"
      Move-Item $File.FullName (Join-Path $Sent $File.Name) -Force
    } else {
      # Left in place so the next run retries it.
      Add-Content $LogFile "$(Get-Date -f s)  FAIL  $($File.Name)  $Response"
    }
  } catch {
    Add-Content $LogFile "$(Get-Date -f s)  ERROR $($File.Name)  $_"
  }
}
```

Register it:

```powershell
schtasks /Create /TN "ESS attendance upload" /SC MINUTE /MO 30 ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Scripts\Upload-EasyTime.ps1" ^
  /RU SYSTEM /F
```

```bash
# Linux/macOS — raw body upload
curl -X POST "https://<portal-domain>/api/attendance/easytime-import?filename=$(basename "$FILE")" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @"$FILE"
```

Max upload size is 10 MB (roughly 100k punch rows).

### Smoke test before scheduling anything

Confirms the URL, token and network path in one step, with no real data:

```powershell
# One fake punch. Replace <EMP_CODE> with a real code from the portal roster.
"<EMP_CODE>`tTest`tUser`t-`t-`t2026-08-05`t09:00`t1`t0`t-`t-`t-`t-`t-`t-`t0" |
  Set-Content -NoNewline "$env:TEMP\ess-test.txt"

curl.exe -X POST "https://<portal-domain>/api/attendance/easytime-import" `
  -H "Authorization: Bearer <TOKEN>" `
  -F "file=@$env:TEMP\ess-test.txt"
```

Expected:

```json
{"importId":"...","rowCount":1,"matchedCount":1,"unmatchedCount":0,"unmatchedEmpCodes":[]}
```

- `matchedCount: 1` → everything works end to end.
- `unmatchedCount: 1` → reached the portal fine, but that employee code isn't in
  it. Fix the code (§2), then re-send.
- `401` → token or header problem.
- Connection error / timeout → the office network can't reach the portal; the
  Railway domain needs allowing outbound.

Remove the test row afterwards if you used a real employee code, or just use a
deliberately fake code like `TESTCODE` and expect `unmatchedCount: 1` — unmatched
punches are stored for audit but never touch anyone's attendance.

### 1c. The token

**A token has already been generated for production.** It is recorded in
`docs/integration-credentials.md`, which is gitignored — ask the portal owner for
it rather than looking for it in this file. Tokens are secrets and are
deliberately kept out of the repository.

To generate another (one per site or device is fine), run this on the Railway
**app** service shell — `DATABASE_URL` is already injected there:

```
npm run import-token:generate -- "EasyTime Pro - <site name>"
```

Notes:

- Run it on the **app** service, not the Postgres service. The script falls back
  to a localhost connection string when `DATABASE_URL` is unset, which would
  write the token to a throwaway database and silently fail at upload time.
- The label is read from the first argument only, so a multi-word label needs to
  survive shell quoting; it is a human hint and has no effect on authentication.
- The token prints **once**. Only its SHA-256 hash is stored, so a lost token
  cannot be recovered — generate a replacement instead.
- To revoke, set `revoked_at` on that row in `attendance_import_tokens`; requests
  with it then fail `401`. Several tokens may be active at once, so a rotation
  can be done with no downtime: add the new one, switch the job, revoke the old.

---

## 2. What Champ HR needs to do

**Every employee needs their employee code set in the portal**, matching their
`emp_code` in EasyTime Pro. Without it their punches arrive but match nobody.

Where the code lives and appears:

- **Team roster** (`/team`) — an "Emp code" column; employees without one show a
  **Not set** warning. The search box matches on code as well as name and email.
- **My Profile** (`/profile`) — first field under Job Information.
- **Bulk import** — the `CIPL Emp Code` column of the HR spreadsheet is saved to
  the employee record automatically on import.
- **Manually**, for one person:
  ```
  PUT /api/admin/users/<userId>/employee-code
  Body: { "employeeCode": "CIPL2666" }
  ```
  Admin/Super Admin only. Stored uppercase. A code already held by someone else
  is rejected with `409` — duplicates would misattribute attendance.

---

## 3. What the portal does with a file

1. **Authenticates** the token; anything else is `401`.
2. **Parses** each line into a punch. Blank lines and a header row are skipped;
   rows missing `emp_code`, `date` or `time` are ignored.
3. **Matches** `emp_code` (case-insensitive) against employee codes.
4. **Applies** matched punches to that employee's attendance row for the date:
   `punch_state` 0/4 (or text containing "in") is a check-in, 1/5 (or "out") a
   check-out. If the device sends no state, the first punch of the day is the
   check-in and later ones the check-out.
5. **Stores every raw punch** — matched or not — in `device_punches`, with all 16
   template fields kept for audit.
6. **Responds** with a summary:

```json
{
  "importId": "13383ea1-...",
  "rowCount": 3,
  "matchedCount": 2,
  "unmatchedCount": 1,
  "unmatchedEmpCodes": ["CIPL9999"]
}
```

**Watch `unmatchedEmpCodes`.** A non-empty list means those codes exist on the
device but not in the portal — set the employee's code, then re-send the same
file and the punches will attach.

**Re-sending is safe.** Applying a punch only ever moves check-in earlier and
check-out later, so re-posting the same file (or overlapping date ranges) never
double-counts or corrupts a day. Overlap deliberately rather than risk gaps.

### Night shifts are paired into one shift

Each punch is stored under the date the device reported it, so a shift running
18:00 → 03:30 lands in two rows. The portal pairs them back together: a day with
a check-in but no check-out borrows the next day's check-out, and the shift is
credited to its **start** date with the full span.

```
3 Aug   6:00p → 3:30a⁺¹   9h 30m   P
4 Aug   6:05p → 2:00a⁺¹   7h 55m!  P     ← under 9h, flagged amber
5 Aug   ↳ shift  ends 2:00a               ← tail of the 4th, not its own day
```

`⁺¹` marks a check-out that happened the following morning. Present-day counts
and average hours are computed from paired shifts, so an overnight shift counts
as one day rather than two.

**How far a check-out may sit from its check-in** comes from the employee's own
`officeTimings` (shift length + 3h slack), capped at 14 hours. Staff with blank
or "Flexible" timings use the 14-hour default. An 18:00 check-in with a 09:00
check-out the next morning is 15 hours — too long to be one shift, so it is
flagged rather than paired.

**Under 9 hours is flagged, never rewritten.** A short day shows its real worked
time in amber with a `!`; the portal does not credit a minimum. Actual attendance
stays truthful and the shortfall is visible.

**Anomalies are surfaced, not absorbed.** A cell reads "needs review" when a
check-in has no plausible check-out, a check-out has no check-in, the gap is too
long to pair, or the device clock recorded an out before its in. Hovering gives
the specific reason.

One caveat worth knowing: several `officeTimings` values in the HR tracker read
`06:00 PM to 03:30 PM`, which is 21.5 hours and plainly a typo for AM. The parser
re-reads an implausibly long window as the following morning, so these resolve to
9h 30m — but correcting the sheet is better than relying on that.

### Error responses

| Status | Meaning |
|---|---|
| `401` | Missing, wrong, or revoked token |
| `400` | Empty file, file over 10 MB, or no valid rows (usually a template mismatch) |
| `200` | Accepted — check `unmatchedCount` in the body |

---

## 4. Railway configuration

### Environment variables

Nothing is **required** for this integration — the token lives in the database and
the device offset defaults to IST. Only one optional variable exists:

| Variable | Needed? | Value | Why |
|---|---|---|---|
| `DEVICE_UTC_OFFSET` | Optional | `+05:30` | Only if biometric terminals are outside India. Defaults to IST, so leave it unset for Bangalore. |

The variables the integration *depends on* are already set for the portal itself:
`DATABASE_URL` (punches and tokens), and nothing else.

### What actually needs doing on Railway

1. ~~**Deploy** so the endpoint exists.~~ **Done.** `start.sh` runs
   `drizzle-kit migrate` on boot, which created `attendance_import_tokens`,
   `attendance_imports` and `device_punches`.
2. ~~**Generate the import token against production.**~~ **Done** —
   `068ad33e-689f-4c29-b76f-98df2ae4b2ac`, generated on the Railway app service
   on 2026-08-05. The value is in `docs/integration-credentials.md` (gitignored).
   To create more:
   ```
   npm run import-token:generate -- "EasyTime Pro - <site>"
   ```
   Run it on the **app** service shell, where `DATABASE_URL` is already injected.
   On the wrong service the script falls back to a localhost connection string
   and writes the token somewhere useless.
3. **Give the EasyTime Pro team** the endpoint URL and that token. *(outstanding)*
4. **Confirm the portal is reachable** from the EasyTime Pro machine — the smoke
   test in §1b does this. Traffic is outbound from the office, so no inbound
   firewall rule is needed on the portal; if office egress is restricted, allow
   the Railway domain. *(outstanding)*
5. **Rotate the handover token** once the integration is confirmed working. This
   one was transmitted through a chat session, so treat it as exposed — see
   `docs/integration-credentials.md` for the zero-downtime rotation steps.
   *(outstanding)*

### No cron, worker or volume needed

The portal is a passive receiver: the EasyTime Pro machine initiates every
upload on its own schedule. There is no poller to run, no background worker, and
no disk to mount — the uploaded file is parsed in memory and only its parsed rows
are persisted. This is the opposite of the ProHance integration, which polls
outbound and therefore does need a long-running process.

---

## 5. Handover checklist

**Portal side — already done**
- [x] Endpoint deployed and live on Railway
- [x] Tables created by the boot migration
- [x] Import token generated against production (`068ad33e-…`)
- [x] Timestamps pinned to IST regardless of server timezone
- [x] Night shifts paired into a single shift with correct hours

**EasyTime Pro / IT side — to do**
- [ ] Custom Export created with the exact template in §1a
- [ ] Date `yyyy-MM-DD`, time `HH:mm`, file format Txt
- [ ] Export schedule set (hourly, or nightly after the last shift ends)
- [ ] Smoke test run (§1b) returns `rowCount: 1`
- [ ] Upload job scheduled and confirmed running unattended
- [ ] First real run shows `matchedCount > 0`

**Champ HR side — to do**
- [ ] Token handed to IT through a password manager, not chat or email
- [ ] Every employee has an employee code matching their EasyTime `emp_code`
- [ ] `/team` shows no "Not set" codes for staff who use the biometric device
- [ ] After the first real run, `unmatchedEmpCodes` is empty
- [ ] Handover token rotated and the original revoked
- [ ] Office timings corrected in the HR tracker — several read
      `06:00 PM to 03:30 PM` (a typo for AM) and three employees have none,
      which makes night-shift pairing fall back to a 14-hour default

---

## 6. Notes for whoever maintains this

- Ingestion code: `src/lib/server/easytime-import.ts` (parser + token check),
  `src/routes/api/attendance/easytime-import/+server.ts` (endpoint).
- Tables: `attendance_import_tokens`, `attendance_imports` (one row per file),
  `device_punches` (one row per punch), `employee_profiles.employee_code`.
- The earlier live ADMS push endpoint (`/iclock/cdata`) has been removed — this
  file-export path replaced it, so there is exactly one way attendance enters.
- **Timezone.** Devices report local wall-clock time with no zone, so the parser
  pins it to IST (`+05:30`) explicitly rather than trusting the server's zone —
  Railway runs UTC, so without this the same file would import differently in
  production than in local testing. Override with `DEVICE_UTC_OFFSET` only if
  terminals are installed outside India.
- **The attendance day is the device's own `{date}` field**, never re-derived
  from the timestamp. Deriving it would put a 03:30 night-shift punch on the
  previous day on an IST server, and the portal displays office hours in IST for
  every viewer regardless of where they open it.
