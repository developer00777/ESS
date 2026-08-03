# Champ HR — ESS Portal

## Register

product — internal app UI. Design serves the task; consistency and clarity over spectacle.

## Users & Purpose

- **Employees** (Champions/LakeB2B staff, ~250 people): check leave balance, apply for leave, mark/see attendance, view payslips and policies, keep their profile current. Often used briefly, between tasks, at all hours (day and night shifts).
- **Team leads / HR admins / Super admin**: approve leave, manage team rosters, create logins (single + bulk spreadsheet import), publish holiday calendars and leave policies, audit password activity.

Primary job on any screen: complete one HR task fast, with trustworthy numbers.

## Brand personality

Cosmic, premium, focused — per the "Cosmic ESS" design system (`ESS portal design system (4)/`): dark glassmorphism, ambient nebula glow, starfield backdrop, violet/cyan (Nebula) accent with a quiet steel-blue (Onyx) alternate palette. Numbers are the heroes (Space Grotesk display, tabular figures); chrome recedes.

## Anti-references

- Generic SaaS admin templates (Bootstrap-admin gray).
- The previous light teal corporate look — replaced by Cosmic.
- Decorative motion that delays task flow; orchestration on load.

## Design principles

1. **Token-first**: every color/space/radius flows through `--ess-*` tokens (`src/lib/styles/ess-tokens.css`); component vocabulary in `ess-components.css`. No hardcoded colors in `.svelte` files.
2. **Two palettes, one mechanism**: default = Nebula; `data-ess-theme="dark"` = Onyx. The sidebar toggle and `essTheme` localStorage key are preserved from the pre-Cosmic app.
3. **Glass is the surface language**: cards are `.ess-card` (glass), tables sit in glass shells, primary actions glow. Legibility beats effect — body text ≥ 4.5:1 on glass.
4. **Density where users work**: tables, rosters, and forms stay dense and calm; the cosmic drama lives in backgrounds and stat displays, never in task chrome.
5. **Reduced motion respected**: starfield drift and card tilt disable under `prefers-reduced-motion`.

## Accessibility

AA contrast for body text on glass surfaces; visible focus rings (accent, 3px); dark `color-scheme` on form controls; toggle and nav fully keyboard-operable.
