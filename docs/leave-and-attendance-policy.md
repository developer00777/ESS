# Leave, Attendance, Comp-Off & Attendance Deviation Policy

**Effective date:** 1 January 2025 (Leave Balance Policy) · SOP for Attendance, Comp-Off &
Attendance Deviations added 6 August 2026

This document consolidates the existing Leave Balance Policy with the new SOP covering
Attendance, Comp-Off and Attendance Deviations. It is the version to upload and publish
through **Admin → Publish Policies** once it has been reviewed and signed off.

---

## Part A — Leave Balance Policy

*(Unchanged from the policy effective 1 January 2025. Reproduced here so a single document
covers leave and attendance together.)*

This policy outlines the guidelines and procedures for managing employee leave balances —
Earned Leave (EL) and Sick Leave (SL) — applicable going forward. It is intended to ensure
fair and equitable management of leave entitlements, and to lay down the procedure for
applying for and availing leave.

### Opening balance and carry-forward

- Employees carry forward unused leave up to a maximum of **5 days** each year.
- 5 days of the previous year's unused leave is carried forward. Any leave above this limit
  is forfeited at the end of the year.

### Leave accrual

- **Post-probation employees:** 1.5 days of Earned Leave (EL) per month, and 0.5 days of
  Sick Leave (SL) per month.
- **Pre-probation employees:** 0.5 days of Sick Leave (SL) per month.
- Leave accrued but not availed in a month is carried to the next month within the current
  fiscal year.

### Utilisation of Sick Leave

- Sick Leave may be utilised only in the case of illness.
- To avail Sick Leave, hospital documentation or a medical certificate pertaining to the
  illness must be provided.

### Process for applying for leave

1. Log in to the HRone application and select **Apply Leave** along with the leave dates.
2. Select the leave type (EL / SL).
3. Fill in the details pertaining to the leave — dates and reason.
4. Submit the necessary documents (for SL, medical certificates or hospital documents).
5. The request is reviewed by the Manager / Supervisor for approval or rejection.

### Management of leave records

- Leave balances are updated monthly, and the carry-forward limit of 5 days is forfeited at
  the end of the year if unused.
- This policy references only Earned Leave (EL) and Sick Leave (SL).
- **Note:** if an employee does not clock the minimum required hours, the shortfall is
  deducted from their Earned Leave.

### Maternity Leave

A worker takes maternity leave from her 8th month of pregnancy, for a total of 182 days
(26 weeks), granted in accordance with the law and company policy. Employees are asked to
plan their leave in sync with the payroll cycle to make processing easier. Once an employee
returns from maternity leave, on-the-spot relieving is not provided — the regular notice
period of 6 months applies in order to be relieved from work.

### Paternity Leave

Paternity leave of 3 days is provided following the birth of a child. Employees must provide
formal email notification at the time of the birth and apply for the leave through the HRone
application in accordance with company policy.

### Bereavement Leave

In the event of the death of an immediate family member, employees are provided with 3 days
of bereavement leave. Employees must provide formal email notification of the incident and
apply for the leave through the HRone application in accordance with company policy.

---

## Part B — SOP: Attendance, Comp-Off & Attendance Deviations

### 1. Comp-Off Policy

#### Eligibility

- Employees must complete **7 or more working hours** on an eligible holiday or weekend to
  earn a Comp-Off.
- The employee must have full attendance on the eligible working day.

#### Validity

- Comp-Off must be utilised within **3 months** from the date it is earned.
- Comp-Off **cannot be encashed** and will automatically lapse if it is not utilised within
  the validity period.

#### HR process

1. Verify attendance records.
2. Confirm the employee has completed 7+ working hours.
3. Obtain manager approval (if applicable).
4. Credit the Comp-Off in the leave portal.
5. Maintain a monthly Comp-Off tracker (e.g. September, October).

### 2. Attendance Deviation Policy

#### Definition

An attendance deviation occurs when an employee's attendance is not captured correctly due
to:

- Missing biometric punch.
- Missing login/logout records.
- Attendance mismatch between systems.
- System or technical issues.

#### Monthly limit

- Employees can submit a maximum of **3 attendance deviation requests per month** for
  missing biometric records.
- Any additional requests require approval from **both HR and the Reporting Manager**.

### 3. Half-Day / Wrong Attendance Capture

If the attendance portal incorrectly marks:

- Half Day
- Absent
- Incorrect working hours

Employees should:

1. Raise an attendance correction request.
2. Submit supporting documents (e.g. login screenshot, manager confirmation).

HR will verify the request, and attendance will be corrected upon approval.

### 4. Common attendance deviation reasons

Attendance correction requests can be raised for the following reasons:

- Login not captured.
- Logout not captured.
- Missing biometric punch.
- Biometric and system login mismatch.
- ProHance activity mismatch.
- System / server issues.
- Machine malfunction.
- Technical errors affecting attendance.

---

## Part C — How this is applied in the ESS Portal

This section describes how the SOP above is enforced by the portal. It is included for HR
reference; it can be dropped before circulating the policy to employees.

### Comp-Off

- Employees claim a Comp-Off from **Attendance → Claim a comp-off**. The portal checks the
  date against the SOP before the claim can be submitted: the day must be a holiday (from
  the published holiday calendar for the employee's shift group) or a weekend, and the
  worked time must be 7+ hours, taken from portal attendance and falling back to ProHance
  logged time.
- Claims are always created as **pending**. Nothing is auto-granted — SOP §1 makes HR the
  one who verifies and credits.
- On approval, eligibility is **re-verified** against the current record rather than the
  snapshot taken at claim time, so a ProHance re-sync between claim and decision cannot
  result in crediting a comp-off the record no longer supports.
- Expiry is set to 3 months from the worked date, and approved credits past their expiry
  lapse automatically when the balance is read.

### Attendance deviations

- Employees raise a correction from **Attendance → Raise attendance deviation**, choosing
  one of the reasons listed in §4 and describing what happened.
- The four biometric-related reasons (login not captured, logout not captured, missing
  biometric punch, biometric/system mismatch) count toward the 3-per-month limit. The 4th
  such request in a month is still accepted, but is routed as
  **"needs HR + Reporting Manager"** rather than being blocked — matching §2.
- Only one open request per date is allowed, to prevent duplicate submissions.
- **On approval, the attendance record is actually corrected** using the times the employee
  supplied, per §3.

### Automated first pass (LLM)

Each request is read once at submission by a language model, which classifies it against the
fixed reason list in §4 and reports whether the corroborating data — portal punches,
ProHance activity, the shift window, holiday status — supports the employee's account.

Three things are deliberately true of this:

- **It is advisory only.** It never approves or rejects. HR decides, and the model is
  explicitly instructed never to recommend a decision.
- **It is never a hard dependency.** If the provider is unreachable or returns something
  malformed, the request is still saved and HR reviews it unaided. Filing a request never
  depends on the model being available.
- **Its output is stored, not recomputed.** The summary, suggested reason, confidence,
  evidence note and model name are written to the request, so a decision made weeks later
  can be audited against exactly what the model saw and said.

HR sees this alongside each request in **Attendance → Pending your review**, together with a
"Show system record" expander containing the raw evidence, so the model's reading can always
be checked against the underlying data.
