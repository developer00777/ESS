# github.md

repo: developer00777/ESS
branch: main
path: src/

## Last sync

date: 2026-07-30T11:18:07Z

### Updated in this project

- Created the **ESS design system** — teal identity from `src/app.css`, formalised as tokens with a full dark theme.
- Added `ess-tokens.css` and `ess-components.css` as drop-in replacements for the component layer of `src/app.css`.
- Built a spec document covering colour, type, surfaces, 14 components and migration steps.
- Rebuilt 8 portal screens on the system, fixing the two-slab dashboard, mixed card surfaces, hand-rolled table rows and flat type hierarchy.

## Screen map

| Project screen | Built from repo files |
|---|---|
| ESS Design System.dc.html | `src/app.css`, `src/lib/components/*.svelte` |
| ESS Portal Screens · Login | `src/routes/login/+page.svelte` |
| ESS Portal Screens · Dashboard | `src/routes/(app)/dashboard/+page.svelte`, `src/lib/components/StatCard.svelte`, `src/lib/components/QuickActionRow.svelte` |
| ESS Portal Screens · Leave | `src/routes/(app)/leave/+page.svelte`, `src/lib/components/StepTracker.svelte`, `src/lib/components/LeaveCalendar.svelte` |
| ESS Portal Screens · Attendance | `src/routes/(app)/attendance/+page.svelte` |
| ESS Portal Screens · Team | `src/routes/(app)/team/+page.svelte` |
| ESS Portal Screens · Profile | `src/routes/(app)/profile/+page.svelte`, `src/lib/components/ProfileCard.svelte` |
| ESS Portal Screens · Policies | `src/routes/(app)/policies/+page.svelte` |
| ESS Portal Screens · Publish policies | `src/routes/(app)/admin/policies/+page.svelte` |
| Nav rail (both files) | `src/lib/components/SidebarNav.svelte`, `src/routes/(app)/+layout.svelte` |
