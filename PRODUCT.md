# Champ HR — ESS Portal

## Register

product — internal app UI. Design serves the task; consistency and clarity over spectacle.

## Users & Purpose

- **Employees** (Champions/LakeB2B staff, ~250 people): check leave balance, apply for leave, mark/see attendance, view payslips and policies, keep their profile current. Often used briefly, between tasks, at all hours (day and night shifts).
- **Team leads / HR admins / Super admin**: approve leave, manage team rosters, create logins (single + bulk spreadsheet import), publish holiday calendars and leave policies, audit password activity.

Primary job on any screen: complete one HR task fast, with trustworthy numbers.

## Brand personality

Warm, editorial, focused — the "Timeline workspace" (the `ess-timeline-mockups` set): a warm off-white canvas, dark navy ink, an editorial serif (Newsreader) for the main headings, a clean sans (IBM Plex Sans) for body and controls, thin neutral dividers, restrained vivid violet for actions, pale lavender for the active navigation, 10px soft corners, small outline icons. Generous whitespace; metrics sit next to decisions; forms look like forms.

## Anti-references

- Generic SaaS admin templates (Bootstrap-admin gray).
- The earlier "Cosmic" glassmorphism skin (nebula glow, starfield, glass cards) and the light teal corporate look before it.
- Decorative motion that delays task flow; nested cards inside cards; giant promotional art.

## Design principles

1. **Token-first**: every color/space/radius flows through `--ess-*` tokens (`src/lib/styles/ess-tokens.css`); component vocabulary in `ess-components.css`. No hardcoded colors in `.svelte` files.
2. **Two palettes, one mechanism**: default = Light; `data-ess-theme="dark"` = Dark. The `essTheme` localStorage key and the pre-paint script in `app.html` are preserved.
3. **One shell**: a 210px sidebar (Today, Champ Hub, Leave, Attendance, Policies, Team, Admin Controls; Help & support and the person's avatar at the foot), a slim top bar (search, notifications, the person's menu), and `PageHeader` (crumb · serif title · one line · actions) on every page. Complex modules use local tabs (`.ess-tabs`); review and correction happen in contextual right panels or 500px drawers.
4. **Rows, not cards-in-cards**: work queues are hairline rows (`.ess-rows`); a page is at most a main column plus one 360px aside (`.ess-split`).
5. **Density where users work**: tables, rosters and forms stay dense and calm; serif is reserved for page and section headings.
6. **Reduced motion respected**: `prefers-reduced-motion` and the Appearance "Reduced" setting disable transitions.

## Accessibility

AA contrast for body text on white and off-white surfaces; visible focus rings (violet, 3px); `color-scheme` follows the palette on form controls; nav, tabs and menus fully keyboard-operable.
