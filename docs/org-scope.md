# Org scope: multiple hierarchies, one answer to "on whom?"

## The problem this fixes

Capabilities (`src/lib/capabilities.ts`) say *what* a login may do, org-wide.
Who it may do it *to* was decided three different ways:

| Where | Rule | Consequence |
|---|---|---|
| `approval-chain.ts` | `users.reportsTo`, one level; else any Team-Lead-role member of the team | correct for linked people; the fallback ignored the designated lead, picked arbitrarily between leads, and could pick an inactive one |
| `tasks/service.ts` | `users.reportsTo`, whole subtree | correct |
| Leave calendar, Dashboard queue and planner, Team page, `/api/leave?scope=team`, `rbac.canActOnUser` | same `users.teamId`, or the role | a manager could approve a report in another team but not see them; an Employee-role manager saw no queue at all; any Team Lead read every teammate's leave reason |

## The model

`src/lib/org-scope.ts` (pure, unit-tested) derives typed relations from data
already in the schema and maps each relation to scoped data permissions:

| Relation | Source | Grants |
|---|---|---|
| `line_manager` | `users.reportsTo` | view all, edit settings, reset password |
| `line_chain` | reportsTo, depth ≥ 2 | view all, no edits |
| `dotted_manager` | `employee_profiles.dotted_line_manager_id` | basic, attendance, leave **dates** only |
| `concerned_hr` | `employee_profiles.hr_user_id` | view all |
| `hr_fallback` | HR role, and a stage of the person's requests falls to "any HR" | basic, attendance, leave |
| `team_lead` | the team's **effective lead** (below) | today's Team Lead reach |
| `teammate` | same `teamId` | basic, leave dates |
| `delegate` | `delegations` | the people whose manager stage the delegator holds, inside the window |

**One definition each, shared with the approval chain:**

- *The team's lead* (`resolveTeamLead`): the lead named on the team while
  active; else the team's Team-Lead-role member, the earliest by id. Never an
  inactive account. `approval-chain.ts` routes the manager-stage fallback to
  the same person.
- *A person's manager* (`managerOf`): the active `reportsTo`; nobody when they
  report to Chief with no line set; else the team's lead (never themselves).
  A delegate covers exactly these people, and HR fallback covers exactly the
  ones the chain leaves to "any HR" — so whoever can decide a request can see it.

Capabilities still open org-wide reach (`people.directory`, `payroll.view`, …),
listed in `CAPABILITY_REACH`. Approval routing changes only in that a live
delegate may give the **manager-stage** sign-off; the HR stage never delegates,
and nobody signs off their own request.

## Where it is used

- **Leave calendar, `/api/leave?scope=team`, dashboard planner** — `leaveReach`:
  the `leave.view` scope plus, for a Team Lead, their whole team (as before).
  Type and reason are sent only where a relationship grants `leave.view`; a
  Team Lead who is not a teammate's lead sees the dates, not the reason.
- **Dashboard and Team approval queues** — exactly what the approval chain lets
  the viewer decide (`reviewableUserIds`), delegations included.
- **Team page** — `team-access.ts`: Team Leads and up, People privileges, and
  Employee-role managers, concerned HR or delegates; the roster is the team
  plus the `person.job` scope. The Team link in the navigation follows the
  same rule.
- **Settings and password reset** — `canActOnUser` also accepts a Team Lead's
  line reports in other teams. Employee-role users still cannot edit anyone.

New endpoints: `GET/POST /api/delegations` (`?all=1` for HR),
`DELETE /api/delegations/:id`, `GET /api/access/explain?actor=&target=`
(needs `access.view`).

```ts
import { scopeIds, userCanReach, explainReach, leaveReach } from '$lib/server/org-scope';

const visible = await scopeIds(locals.user, 'leave.view'); // null = org-wide
query.where(visible === null ? undefined : inArray(users.id, visible));
```

## Rollout

1. Migration 0029 runs on boot: `delegations` (with window and not-self
   checks) and indexes on `users.reports_to`,
   `employee_profiles.dotted_line_manager_id` and `hr_user_id`. Until applied,
   the loader treats delegations as empty.
2. This change: every screen above follows the scope; nobody loses access.
3. Next: fill every `reportsTo` (Admin › Org chart shows gaps), then drop the
   `teamId` half of the roster and of `canActOnUser`; a delegation UI on the
   profile menu; effective-dated reporting history so a mid-month transfer
   routes pending requests correctly.
