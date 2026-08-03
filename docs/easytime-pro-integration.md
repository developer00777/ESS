# EasyTime Pro → Champ HR ESS Portal — Integration Handover

How biometric attendance gets from EasyTime Pro into the ESS portal.

**Method:** EasyTime Pro's scheduled **Custom Export** writes a tab-separated file;
a small scheduled job on that machine POSTs the file to the portal, which matches
each punch to an employee and updates their attendance.

**The join key is `{emp_code}`.** It must equal the employee's code in the portal
(e.g. `CIPL2666`). Nothing else is used to identify the person — not the name, not
the card number, not the device PIN.

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

Two accepted body formats — use whichever is easier:

```powershell
# PowerShell — multipart upload of the newest export file
$Token = "<TOKEN>"
$Url   = "https://<portal-domain>/api/attendance/easytime-import"
$File  = Get-ChildItem "C:\EasyTimePro\Exports\*.txt" |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1

curl.exe -X POST $Url `
  -H "Authorization: Bearer $Token" `
  -F "file=@$($File.FullName)"
```

```bash
# Linux/macOS — raw body upload
curl -X POST "https://<portal-domain>/api/attendance/easytime-import?filename=$(basename "$FILE")" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @"$FILE"
```

Max upload size is 10 MB (roughly 100k punch rows).

### 1c. The token

The portal issues the token. Generate it once, on the portal side:

```
npm run import-token:generate -- "EasyTime Pro - <site name>"
```

It prints the token **once** — store it in a password manager and hand it to
whoever configures the upload job. Only its hash is kept in the database, so a
database leak does not expose it. To revoke, set `revoked_at` on the row in
`attendance_import_tokens`; requests with that token then fail with `401`.

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

### Error responses

| Status | Meaning |
|---|---|
| `401` | Missing, wrong, or revoked token |
| `400` | Empty file, file over 10 MB, or no valid rows (usually a template mismatch) |
| `200` | Accepted — check `unmatchedCount` in the body |

---

## 4. Handover checklist

**EasyTime Pro side**
- [ ] Custom Export created with the exact template above
- [ ] Date `yyyy-MM-DD`, time `HH:mm`, format Txt
- [ ] Export schedule set
- [ ] Upload job scheduled, pointing at the portal URL with the Bearer token
- [ ] One manual run done; response shows `matchedCount` > 0

**Champ HR side**
- [ ] Import token generated and handed over securely
- [ ] Every employee has an employee code matching their EasyTime `emp_code`
- [ ] `/team` shows no "Not set" codes for staff who use the biometric device
- [ ] After the first real run, `unmatchedEmpCodes` is empty

---

## 5. Notes for whoever maintains this

- Ingestion code: `src/lib/server/easytime-import.ts` (parser + token check),
  `src/routes/api/attendance/easytime-import/+server.ts` (endpoint).
- Tables: `attendance_import_tokens`, `attendance_imports` (one row per file),
  `device_punches` (one row per punch), `employee_profiles.employee_code`.
- The earlier live ADMS push endpoint (`/iclock/cdata`) has been removed — this
  file-export path replaced it, so there is exactly one way attendance enters.
- Timestamps are stored as sent by the device, interpreted in the server's
  timezone. If the device and server are in different zones, that offset needs
  handling before go-live.
