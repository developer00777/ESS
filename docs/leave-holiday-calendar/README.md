# Leave Policy & Holiday Calendar — Dynamic Propagation Design

## 1. Problem statement

Today, if leave policies and holiday calendars are hardcoded per module (attendance,
payroll, leave, shift roster), the Super Admin has to update the same information in
multiple places, and edge cases (night shifts, regional holidays, weekly-off collisions)
get resolved inconsistently.

**Goal:** Super Admin pushes ONE Leave Policy set and ONE Holiday Calendar set.
Every other screen (My Leaves, Team Calendar, Attendance, Payroll, Shift Roster)
*derives* what it shows from these two masters + the employee's own shift/site
assignment — nothing is duplicated.

## 2. Data model overview

```
SuperAdmin
   │
   ├── publishes ──▶ HolidayCalendar (versioned, per region/location)
   │                        │
   │                        ├── HolidayCalendarDay[]  (date, name, type)
   │
   ├── publishes ──▶ LeavePolicy (versioned, per employee-category)
   │                        │
   │                        ├── LeaveTypeRule[]  (accrual, carry-forward, encashment)
   │
CalendarAssignment  (join table — THIS is what makes it dynamic)
   │
   ├── links WorkLocation / Department / ShiftGroup ──▶ HolidayCalendar.id
   └── links EmployeeCategory / Grade / Department    ──▶ LeavePolicy.id

Employee
   │
   ├── has ShiftAssignment (manual, per employee) — start_time, end_time, week_offs[]
   │
   └── Resolver (runtime function, not stored data):
         resolve(employee_id, date) →
             1. find employee's WorkLocation + ShiftGroup
             2. look up CalendarAssignment → HolidayCalendar
             3. look up CalendarAssignment → LeavePolicy
             4. cross-check against employee's own ShiftAssignment
                (e.g. is this holiday date on their week-off? does a night
                 shift spanning midnight count the holiday as the shift's
                 start-date or end-date?)
             5. return a merged, employee-specific view
```

**Key principle:** `HolidayCalendar` and `LeavePolicy` rows are never copied onto the
employee record. Only a *reference* (`calendar_id`, `policy_id`) resolved through
`CalendarAssignment` is used. If Super Admin edits a holiday date, every employee
under that calendar sees the update immediately — no migration script needed.

---

## 3. Seed data — Holiday Calendar

File: `seed/holiday_calendars.json`

- One calendar per region because holidays differ (e.g., Maharashtra vs. Delhi vs. US-CA).
- Each day has a `type` so downstream modules (payroll, attendance) know how to treat it.
- `type` enum: `PUBLIC` (mandatory, paid), `RESTRICTED` (optional/floater, employee picks
  N per year), `OPTIONAL` (office open, employee may choose to avail).

See `seed/holiday_calendars.json`.

## 4. Seed data — Leave Policy

File: `seed/leave_policies.json`

- One policy document per employee category (`PROBATION`, `PERMANENT`, `CONTRACT`).
- Each leave type carries its own accrual, cap, carry-forward and encashment rules so the
  policy is self-contained and versionable.

See `seed/leave_policies.json`.

## 5. Seed data — Calendar Assignment (the dynamic link)

File: `seed/calendar_assignments.json`

- Maps `WorkLocation` / `Department` / `ShiftGroup` to a `HolidayCalendar`.
- Maps `EmployeeCategory` to a `LeavePolicy`.
- This is the ONLY table Super Admin (or delegated HR admin) edits when onboarding a
  new office location or shift group — nothing else changes.

See `seed/calendar_assignments.json`.

## 6. Seed data — Employee Shift Assignment

File: `seed/employee_shift_assignments.json`

- Manually set per employee (or per shift-group default, overridable).
- This is what makes the same holiday calendar *render differently*: a night-shift
  employee whose shift is 22:00–06:00 on a day flagged as a holiday effectively gets
  the holiday credit against the shift that *starts* that evening, not the calendar date.

See `seed/employee_shift_assignments.json`.

## 7. Resolver output example (what the UI actually renders)

File: `seed/resolved_view_example.json`

This is what `GET /api/v1/employees/{id}/calendar?month=2026-08` returns — the
merged, employee-specific view built at read time from the 4 files above.
Every consuming screen (dashboard widget, attendance grid, leave application modal,
payroll holiday-pay calculation) hits this same endpoint/shape.

---

## 8. Where this dynamic calendar shows up (dependent surfaces)

| Surface | What it reads | Dynamic behavior |
|---|---|---|
| Employee Dashboard "Upcoming Holidays" widget | resolved view, `type=PUBLIC/RESTRICTED` | Filtered to employee's location calendar |
| Leave Application form | `LeavePolicy` via resolver | Leave type dropdown only shows types valid for employee's category; balance shown live |
| Team/Manager Calendar | resolved view for each direct report | Overlays each report's own calendar (different locations render different holidays side-by-side) |
| Attendance grid | resolved view + `ShiftAssignment` | A holiday inside a night shift spanning midnight is attributed to the correct attendance day |
| Payroll holiday-pay run | resolved view, `type=PUBLIC` only | Restricted/optional holidays excluded from mandatory holiday pay |
| Shift Roster planner | `HolidayCalendar` (raw, not resolved) + `ShiftGroup` | Blocks auto-roster generation from scheduling full strength on `PUBLIC` holidays unless "holiday working" override is checked |

## 9. Versioning & audit rule

Both `HolidayCalendar` and `LeavePolicy` carry `version`, `effective_from`, and
`published_by`. Never edit a published version in place — publish a new version and
set `effective_from`. This lets payroll for a past month keep referencing the version
that was active then, even after Super Admin updates next year's calendar.

## 10. Next steps to reframe with real data

1. Replace region codes/holiday dates in `holiday_calendars.json` with your actual
   office locations and statutory holidays.
2. Replace leave type names/accrual numbers in `leave_policies.json` with your actual
   HR policy document.
3. Replace `work_location_id` / `department_id` / `shift_group_id` values in
   `calendar_assignments.json` with your real org structure IDs.
4. Keep the JSON *shape* (field names, nesting) identical — that's what the resolver
   and every dependent screen is coded against.
