# HR Portal — Product Requirements Document

**Status:** Draft v1.0
**Owner:** HR Systems / Engineering
**Date:** 2026-07-22
**Baseline reference:** [frappe/hrms](https://github.com/frappe/hrms) (open-source HRMS) — used as a functional baseline for scope, not as a code dependency. This is a ground-up build.

---

## 1. Summary

A dockerized, cloud-hosted internal HR portal ("ESS" — Employee Self Service) for a ~1,000-employee company. Every employee gets a login. The portal covers: employee self-service profile, leave tracking + grievances + leave policy, attendance (Prohance/biometric integration + manual + geolocation), payroll, and company policy documents.

Permissions are role-based with three tiers:

| Role | Who | Created by |
|---|---|---|
| **Super Admin** | HR/IT ops | Seeded at deployment |
| **Team Lead** (flexible privilege) | Managers/leads | Created by Super Admin |
| **Employee** (standard privilege) | Individual contributors | Created by their Team Lead |

Shift timings and time/attendance calculation rules are configured per-role and per-team, not globally fixed — a Team Lead can define working hours/shift windows for their team within bounds the Super Admin sets.

---

## 2. Goals & Non-Goals

### Goals
- Single login portal for all ~1,000 employees, accessible on web (desktop + mobile browser).
- Self-service profile: employee sees their own data; Team Lead/Super Admin see team/org views.
- Full leave lifecycle: request → approve → balance tracking, plus a grievance channel and a leave policy reference.
- Attendance via biometric/Prohance webhook ingestion, manual check-in/out fallback, geolocation capture, and shift-aware time calculation.
- Payroll: salary structure, monthly salary slips, payslip download, tax declaration capture — computation-and-display only in v1 (see Non-Goals).
- Company policy document library, versioned, acknowledgeable (read receipts for compliance-sensitive policies).
- Delegated user provisioning: Super Admin creates Team Lead accounts and defines their privilege scope; Team Leads create Employee accounts within their team.

### Non-Goals (v1)
- No direct bank disbursal / payment execution — payroll module computes and displays; actual bank file/disbursement integration is a future phase.
- No native mobile app — responsive web only (SvelteKit PWA-friendly, but no App Store build in v1).
- No building of biometric hardware/device drivers — the portal **integrates** with Prohance and biometric devices via API/webhook ingestion only (confirmed scope decision — see §6.3).
- No multi-tenant/white-label support — single company deployment.
- No performance-review / recruitment / onboarding-template modules (out of scope, may reuse Frappe HRMS's broader module set later).

---

## 3. Users & Roles

### 3.1 Role model

```
Super Admin
   │  creates & configures (any role, including other Super Admins)
   ▼
Admin      ── org-wide privilege (cannot create Admins or Super Admins)
   │  creates
   ▼
Team Lead  ── flexible privilege (scoped to their team)
   │  creates
   ▼
Employee   ── standard privilege (scoped to self)
```

- **Super Admin**: full org visibility. Defines departments/teams, assigns Team Leads, sets company-wide policy (leave policy defaults, payroll cycle, shift-window bounds, biometric integration config). Can impersonate/override any approval. Manages the privilege *template* that Team Leads inherit (i.e., Super Admin defines what "flexible" can flex — e.g., can a given Team Lead approve leave beyond X days, edit shift windows, view salary bands). Can create accounts of **any** role, including other Super Admins.
- **Admin**: org-wide operational tier below Super Admin. Can create and manage Team Lead and Employee accounts across any team, but **cannot** create Admin or Super Admin accounts — that ceiling is reserved for Super Admin so the top of the hierarchy stays self-controlled.
- **Team Lead**: flexible privilege, scoped to their own team roster only. Can: create Employee logins for their team (only, not other Team Leads), approve/reject leave & shift requests, configure team shift timings within Super-Admin-set bounds, view team attendance & leave calendar, raise/respond to grievances involving their reports, view (not necessarily edit) team payroll cost summaries if granted that permission by Super Admin.
- **Employee**: standard privilege, scoped to self. Can: view/edit own profile fields (non-sensitive), apply for leave, check in/out, view own attendance & shift schedule, view own payslips & tax declarations, raise a grievance, browse/acknowledge company policies. Cannot create any accounts.

### 3.2 Permission model detail

Role-creation hierarchy is enforced server-side (never trust client-side role checks — see §5): Super Admin → any role; Admin → Team Lead or Employee only; Team Lead → Employee only, and only within their own team.

- Permissions are **capability flags** on the Team Lead role, toggled per-team by Super Admin at team-creation time (not hardcoded), e.g.:
  - `can_approve_leave` (bool, default true)
  - `max_leave_days_auto_approve` (int, default 2 — beyond this escalates to Super Admin)
  - `can_edit_team_shift_window` (bool, default true, bounded by company min/max shift hours)
  - `can_view_team_payroll_cost` (bool, default false)
  - `can_create_employee_logins` (bool, default true)
  - `can_resolve_grievances` (bool, default true, excluding grievances raised against themselves — auto-escalates to Super Admin)
- Employee privilege is **fixed** (no per-employee flag customization in v1) — scoped strictly to self-service actions.
- All role/permission changes are audit-logged (who changed what, when — stored in Mongo activity log collection).
- **Credential provisioning**: every account created by a Super Admin, Admin, or Team Lead is issued a system-generated temporary password (shown once to the creator). The new account is flagged `must_change_password` and is redirected to a forced password-change screen on first login before it can access any other part of the portal.

### 3.3 Reporting hierarchy

Every Employee and Team Lead record has a `reports_to` reference, building an implicit org chart. Grievances, leave approvals, and shift requests route by default to `reports_to`; Super Admin can reassign.

---

## 4. Feature Scope

### 4.1 Widget: "My Profile"

**For Employee:**
- Personal info (name, contact, emergency contact, address) — self-editable fields vs. HR-locked fields (e.g., designation, salary band, date of joining are HR-locked).
- Snapshot cards: leave balance, this month's attendance %, today's shift, latest payslip, pending grievances, unread policy acknowledgements.
- Quick actions: Apply Leave, Check In/Out, Raise Grievance, View Payslip.

**For Team Lead / Super Admin:**
- Everything an Employee sees for themselves, **plus** a Team/Org view:
  - Team roster grid with live status (present/absent/on-leave/late) for the day.
  - Pending approvals queue (leave, shift change requests, grievances) with one-click approve/reject.
  - Team leave calendar (heatmap) to spot overlap conflicts.
  - Team Lead: scoped to own team. Super Admin: org-wide, with department/team filters and drill-down to any employee's profile.

### 4.2 Leave Tracking

- **Leave types**: configurable (Casual, Sick, Earned/Annual, Unpaid, Comp-off), each with accrual rule, carry-forward cap, and encashment eligibility — configured by Super Admin, applied org-wide or per-department.
- **Leave application workflow**: Employee applies → routes to `reports_to` (Team Lead) → auto-escalates to Super Admin if beyond the Team Lead's `max_leave_days_auto_approve` flag or if Team Lead is the requester.
- **Leave balance ledger**: real-time balance per leave type, accrual history, encashment requests.
- **Leave calendar**: team + org view, holiday list overlay.
- **Blackout / restricted periods**: Super Admin can block leave during critical business windows.

**Grievances** (separate from leave, but grouped under this pillar per company's mental model):
- Employee raises a grievance (category, description, optionally against a person/team, optionally anonymous-to-peers but never anonymous to HR).
- Routes to `reports_to` by default; auto-escalates to Super Admin if raised against the Team Lead, or if unresolved past SLA (configurable, default 5 business days).
- Status lifecycle: `Open → Under Review → Resolved → Closed` (or `Escalated`).
- Full audit trail retained; resolution notes visible to raiser and resolver only (Super Admin always has visibility).

**Leave Policy** (reference, not a workflow):
- Versioned policy documents (per leave type, eligibility, accrual %, carry-forward/encashment rules) rendered from structured data (so the leave engine and the human-readable policy page never drift) plus an attached PDF/rich-text explainer.
- Employees see a read-only, always-current policy page; change history visible to Super Admin.

### 4.3 Attendance

- **Sources** (all feed one unified Attendance Ledger):
  1. **Biometric / Prohance integration** — inbound webhook/API endpoint receives punch events from Prohance or biometric device middleware (vendor-side hardware/SDK, not built by us — confirmed scope). Portal normalizes vendor payloads into internal `CheckInEvent` records.
  2. **Manual web check-in/out** — for remote/field staff without device access; captures browser geolocation (with employee consent) and timestamp.
  3. **HR bulk correction tool** — Team Lead/Super Admin can adjust/backfill attendance with a mandatory reason (audit-logged).
- **Shift management**:
  - Shift Types defined by Super Admin (e.g., General 9–6, Early 7–4, Night 10pm–7am) with grace period, half-day threshold, and overtime threshold.
  - Shift Assignment: Team Lead assigns shifts to their team members within the bounds Super Admin allows (`can_edit_team_shift_window`); Super Admin can override any assignment.
  - Time calculation: hours worked, late-by, early-departure, overtime — computed per the employee's *assigned* shift, not a single global 9-to-5 rule. This is what makes shift timing "role/team separated" as requested.
- **Attendance dashboard**: daily/weekly/monthly views, exportable reports (CSV), anomalies flagged (missed punch, no shift assigned, excess overtime).

### 4.4 Payroll

- **Salary Structure**: components (Basic, HRA, allowances, deductions) defined by Super Admin/Finance, assigned per employee or employee grade.
- **Salary Slip generation**: monthly payroll run (batch job) computes slips from attendance (LOP — loss of pay days from unapproved absence), leave encashment, and salary structure.
- **Payslip access**: Employee views/downloads own payslips (PDF) historically; Team Lead sees team cost summary only if granted `can_view_team_payroll_cost`; full compensation detail restricted to Super Admin/Finance role.
- **Tax declaration**: Employee submits investment/tax-saving declarations each fiscal year; Super Admin/Finance reviews and approves for tax computation.
- **Payroll runs**: Super Admin triggers/approves the monthly payroll batch; slips lock after approval (immutable, versioned corrections only).
- v1 explicitly stops at slip generation + display — no bank disbursement automation (see Non-Goals).

### 4.5 Company Policies

- Central, versioned document library (HR policy, code of conduct, IT/security policy, leave policy — cross-linked from §4.2, expense policy, etc.).
- Categorized/searchable; role-gated visibility if some policies are department-specific.
- **Acknowledgement tracking** for compliance-critical policies: employee must click "I have read and understood," timestamped, reportable by Super Admin (who has/hasn't acknowledged).
- Version history retained; employees always land on the current version.

---

## 5. Non-Functional Requirements

- **Scale**: ~1,000 employees, expect low-hundreds concurrent sessions at peak (shift check-in windows, payroll day). Design for headroom to ~3,000 without architecture change.
- **Availability**: target 99.5% during business hours; scheduled maintenance windows outside business hours.
- **Security**:
  - All traffic over HTTPS/TLS.
  - Passwords hashed (Argon2id) or SSO (SAML/OIDC) — recommend supporting company SSO if available, with local-password fallback for admin break-glass.
  - JWT-based session auth (short-lived access token + refresh token), stored as httpOnly secure cookies.
  - Field-level access control enforced server-side (never trust client-side role checks alone).
  - Sensitive payroll data encrypted at rest (column-level encryption in Postgres for salary figures).
  - All privilege changes, payroll approvals, and grievance resolutions audit-logged, immutable.
- **Compliance**: statutory retention of payroll records (jurisdiction-dependent, typically 3–7 years); grievance records retained per HR policy.
- **Performance**: p95 API response < 300ms for read endpoints; payroll batch run for 1,000 employees completes in < 10 minutes.
- **Localization/timezone**: shift and attendance calculations must be timezone-aware per employee's assigned work location.

---

## 6. Technical Architecture

### 6.1 High-level

```
┌─────────────────────────┐
│   Vercel (Frontend)      │
│   SvelteKit SSR/SPA      │
└────────────┬─────────────┘
             │ HTTPS / REST + WebSocket (live status)
┌────────────▼─────────────────────────────────────────┐
│  Railway (Backend, Dockerized services)               │
│                                                        │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ API Service │  │ Payroll/   │  │ Attendance        │ │
│  │ (REST)      │  │ Batch      │  │ Ingestion Service  │ │
│  │             │  │ Worker     │  │ (webhook receiver) │ │
│  └─────┬──────┘  └─────┬──────┘  └─────────┬─────────┘ │
│        │               │                    │           │
│  ┌─────▼───────────────▼────────────────────▼────────┐ │
│  │              Redis (cache, session, queues)         │ │
│  └──────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
   ┌───────▼────────┐        ┌────────▼─────────┐
   │  PostgreSQL     │        │  MongoDB          │
   │  (system of      │        │  (documents,      │
   │  record: users,  │        │  policy library,  │
   │  roles, leave,   │        │  audit/activity   │
   │  attendance,     │        │  logs, raw        │
   │  payroll)        │        │  biometric event   │
   │                  │        │  payloads)         │
   └──────────────────┘        └────────────────────┘
                     │
            ┌────────▼─────────┐
            │ Prohance / Biometric│
            │ vendor API/webhook  │
            └─────────────────────┘
```

### 6.2 Data layer split (confirmed)

- **PostgreSQL — system of record** for anything requiring transactional integrity, relational joins, or numeric accuracy:
  - `users`, `roles`, `permissions`
  - `employees`, `teams`, `departments`, `reports_to` hierarchy
  - `leave_types`, `leave_allocations`, `leave_applications`, `leave_ledger`
  - `shift_types`, `shift_assignments`, `attendance` (normalized daily records)
  - `salary_structures`, `salary_components`, `salary_slips`, `payroll_runs`, `tax_declarations`
  - `grievances` (status/workflow needs transactional consistency)
- **MongoDB — documents & logs** for flexible/high-volume, less relational data:
  - `policy_documents` (versioned, rich content, attachments)
  - `activity_log` / audit trail (append-only, high write volume)
  - `raw_biometric_events` (vendor payloads as received, before normalization into Postgres `attendance`)
  - `notifications` (in-app notification feed)
- **Redis**:
  - Session/token cache, rate limiting.
  - Job queues for: payroll batch runs, attendance normalization (raw Mongo event → Postgres attendance record), notification dispatch.
  - Cache layer for frequently-read, slow-changing data (org chart, shift types, policy list).

### 6.3 Biometric / Prohance integration (confirmed scope: integration only)

- Portal exposes `POST /api/attendance/webhook/{vendor}` — an authenticated ingestion endpoint. Prohance (or biometric device middleware) pushes punch events; portal does not manage on-prem hardware, device drivers, or the Prohance backend itself.
- Fallback: if the vendor supports pull rather than push, a scheduled worker polls Prohance's export/reporting API on an interval (e.g., every 15 min) and ingests unprocessed punches.
- Raw payloads land in MongoDB `raw_biometric_events` for traceability, then get normalized into the Postgres `attendance` table matched to `employee_id` via a vendor-ID mapping table (maintained by Super Admin, since biometric device IDs rarely equal internal employee IDs).
- Manual web check-in is a separate, always-available code path (does not depend on vendor uptime).

### 6.4 Deployment

- **Frontend**: SvelteKit app deployed on Vercel. Uses SSR for the dashboard shell (auth-gated) and client-side hydration for interactive widgets (attendance heatmap, leave calendar, approval queues).
- **Backend**: Dockerized services on Railway:
  - `api` service (Node/Python — team's call, e.g., Fastify or FastAPI) — stateless, horizontally scalable.
  - `worker` service — payroll batch, attendance normalization, notification dispatch (BullMQ/Celery-style queue consumer against Redis).
  - `attendance-ingestion` service — thin, isolated webhook receiver so vendor traffic never touches the main API's blast radius; writes straight to Mongo, queues normalization job.
  - Managed Postgres, MongoDB, Redis — Railway-hosted plugins/add-ons (or MongoDB Atlas if Railway's Mongo offering is insufficient for the scale — evaluate at build time).
- **CI/CD**: GitHub Actions → build Docker images → push → Railway auto-deploy on merge to `main`; Vercel auto-deploys frontend on merge (preview deployments per PR).
- **Environments**: `dev`, `staging`, `production` — separate Railway projects/services and separate Vercel environments, isolated databases per environment.

### 6.5 Tech stack summary

| Layer | Choice |
|---|---|
| Frontend | SvelteKit, deployed on Vercel |
| Backend | Dockerized services on Railway (API + workers + ingestion service) |
| Primary DB | PostgreSQL (system of record) |
| Secondary DB | MongoDB (documents, logs, raw event capture) |
| Cache/Queue | Redis |
| Auth | JWT (access + refresh), optional SSO/OIDC |
| Attendance hardware | Prohance / biometric — integration via webhook + polling fallback, no hardware build |

---

## 7. User Provisioning Flow

1. **Super Admin** logs in (seeded account, or first-run setup wizard).
2. Super Admin creates **Departments/Teams** and defines each team's Team Lead privilege template (leave auto-approve threshold, shift-edit bound, payroll-cost visibility, etc.).
3. Super Admin creates the **Team Lead** account for that team (name, email → invite sent).
4. Team Lead logs in, sees an empty team roster, and creates **Employee** logins for their direct reports (name, email → invite sent; `reports_to` auto-set to that Team Lead).
5. Employee receives invite, sets password (or SSO-links), completes profile.
6. Ongoing: Team Leads manage their own roster (add/deactivate employees); Super Admin can create/reassign/deactivate any account at any level, and can promote an Employee to Team Lead (creating a new team or assigning to an existing one).

---

## 8. Rollout Plan (suggested phasing)

| Phase | Scope |
|---|---|
| **Phase 1 (MVP)** | Auth + roles + My Profile widget + Leave application/approval + Attendance (manual check-in only) |
| **Phase 2** | Biometric/Prohance webhook integration + Shift management + Team dashboards |
| **Phase 3** | Payroll (salary structure → slip generation) + Tax declarations |
| **Phase 4** | Grievances + Company Policy library + acknowledgement tracking |
| **Phase 5** | Reporting/analytics, exports, SSO hardening, load testing at 3,000-user headroom |

---

## 9. Open Questions

- SSO provider, if any (Google Workspace, Microsoft Entra, Okta)? Affects auth design in Phase 1.
- Statutory payroll/tax jurisdiction(s) — affects tax slab config and compliance retention rules.
- Exact Prohance API contract (push webhook vs. pull/export) — needs vendor documentation to finalize §6.3.
- Does "company policies" need per-department visibility scoping, or are all policies visible org-wide?
- Payroll disbursement — confirmed out of scope for v1, but should Phase 6 be scoped now or deferred entirely?

---

## Appendix: Baseline Feature Mapping (vs. Frappe HRMS)

| Area | Frappe HRMS baseline | This PRD's adaptation |
|---|---|---|
| Profile | Employee master + ESS dashboard | My Profile widget, role-differentiated (Employee vs. Team Lead/Super Admin view) |
| Leave | leave_type/allocation/application/policy doctypes | Same concepts, reimplemented; adds explicit auto-escalation thresholds tied to Team Lead flags |
| Grievance | `employee_grievance` doctype | Adopted directly as a concept, with SLA escalation added |
| Attendance | `employee_checkin`, shift doctypes | Same shift-assignment model; adds explicit Prohance/biometric webhook ingestion layer (not in Frappe core) |
| Payroll | salary_structure/slip/payroll_entry | Same core flow; disbursement explicitly deferred |
| Policy docs | No dedicated module in Frappe HRMS | New module for this PRD — templated letters existed in baseline but not a policy library; built fresh |
| Roles | System Manager / HR Manager / HR User / Employee / approver roles | Simplified to Super Admin / Team Lead (flexible) / Employee (standard), with per-team configurable flags replacing Frappe's global role permissions |
