# Cosmic ESS — Design System Export

A glassmorphism / "cosmic" themed Employee Self-Service (ESS) portal UI, built as a single self-contained HTML file (Tailwind CDN + inline styles). This export bundles the live design file plus documentation so you can lift tokens, components, and screen markup into your own application.

## Files in this archive
- `ESS Portal Cosmic.dc.html` — the full design source (open directly in a browser). Contains every screen (Login, Dashboard, Leave, Attendance, Team, Profile, Policies, Publish Policies) and every tweak variant in one file.
- `ESS_Cosmic_Design_Tokens.md` — this document.

## How the file is organized
- All styling is inline Tailwind utility classes plus a small custom stylesheet in `<head>` (search for `<style type="text/tailwindcss">`). Copy that block wholesale into your app's CSS to get every custom class below.
- Screens are toggled by a top-of-page dev toolbar (layout/palette switcher) — that toolbar is a design-exploration aid, not part of the shipped product chrome. Remove it in your integration and drive `screen`/`pal`/`lay` state from your own app instead.
- Fonts: **Space Grotesk** (display/headings), **Inter** (UI/body), **JetBrains Mono** (numeric/tabular data) — loaded via Google Fonts.

## Tweakable dimensions (props)
These are the toggles exposed in this project's Tweaks panel. Each corresponds to a `data-*` attribute on the root element that a CSS selector keys off — replicate the same attribute/selector pattern in your app if you want the variants to remain switchable.

| Prop | Type | Options | Default | Notes |
|---|---|---|---|---|
| `shell` | enum | classic / rail / topnav | classic | Overall nav chrome: full sidebar, collapsed icon rail, or horizontal top nav |
| `palette` | enum | nebula / aurora / onyx / ember | nebula | Accent + background color theme (see Palettes below) |
| `dashboardLayout` | enum | grid / bento / split / rail / list | grid | KPI card arrangement, applies to every KPI row across all screens |
| `cardStyle` | enum | glass / outline / solid / elevated | glass | Surface treatment for `.glass` cards |
| `density` | enum | comfortable / compact | comfortable | Padding + font-size scale for KPI cards and table rows |
| `corner` | enum | sharp / soft / round | soft | Global border-radius scale (6px / 18px / 28px) via `--r` custom property |
| `sparklines` | boolean | — | true | Show/hide the mini bar-chart sparkline in KPI cards |
| `glow` | enum | subtle / medium / intense | medium | Intensity of the ambient background glow + text shadow |
| `starfield` | boolean | — | true | Toggle the animated starfield background layer |
| `depth` | boolean | — | true | Toggle the 3D hover-tilt effect on cards |

## Dashboard layout variants (\`dashboardLayout\`)
Controls how every KPI row (\`.kpis\`) on every screen arranges its \`.kpi\` cards, selected via \`[data-lay="..."]\`:

- **grid** (default) — even 4-column grid, all cards equal size.
- **bento** — asymmetric grid: the first card spans 2×2 (larger number + taller sparkline), the 4th card spans 2 columns wide.
- **split** — 1.5fr/1fr two-column split: first card is a tall hero-style figure (spans all rows), remaining cards collapse into compact horizontal rows (icon/label left, number right, sparkline/meta hidden).
- **rail** — horizontal scrolling row (\`overflow-x:auto\`, scroll-snap), each card fixed at 252px min-width (420px for hero cards).
- **list** — the whole KPI row becomes one bordered container; each card becomes a slim horizontal row (label left, number + sparkline right, divider lines between rows) instead of a standalone card.

## Shell variants (\`shell\`)
Controls the nav chrome, selected via \`[data-shell="..."]\` on the shell wrapper:

- **classic** (default) — full-width sidebar (262px) with labeled nav items, section eyebrows ("Me" / "Manage"), avatar + name in the footer, and a logout icon.
- **rail** — sidebar collapses to a 74px icon-only column: labels hidden, nav items centered, badge chips float top-right of each icon, footer shrinks to just the avatar.
- **topnav** — sidebar becomes a horizontal bar: brand block on the left (with a right border divider), nav items become pill buttons in a row, icons hidden, user footer pushed to the far right; main content re-centers with a 1300px max-width.

## Corner scale (\`corner\`)
Sets the global \`--r\` custom property that every \`.glass\`/\`.kpi\`/list-container border-radius reads from, via \`[data-corner="..."]\`:

- **sharp** — \`--r: 6px\` (tight, almost square corners)
- **soft** (default) — \`--r: 18px\` (standard rounded card)
- **round** — \`--r: 28px\` (very rounded, pill-adjacent)

## Palettes (CSS custom properties)
Each palette sets `--acc`, `--acc2`, `--glow`, `--ring` plus background gradients, selected via `[data-pal="..."]` attribute selectors:

- **Nebula** (default) — violet/cyan: `--acc:#a78bfa` `--acc2:#22d3ee`
- **Aurora** — green/blue: `--acc:#34d399` `--acc2:#38bdf8`
- **Onyx** — steel blue, near-monochrome: `--acc:#5b8fd6` `--acc2:#a8c8f0`
- **Ember** — rose/red: `--acc:#b4425c` `--acc2:#e08a9c`

## Core custom classes
| Class | Purpose |
|---|---|
| `.glass` | Frosted-glass card surface (border, gradient fill, inset highlight, shadow) |
| `.pane` | Slightly denser glass variant used for hero banners / sticky bars |
| `.tilt` | Adds the 3D hover-lift/tilt interaction (disabled when `depth=off`) |
| `.eyebrow` | Small uppercase label (11px, letter-spaced) |
| `.num` / `.num-acc` | Tabular-numeric display figure, optionally accent-colored |
| `.chip` | Status pill — variants `.c-ok` `.c-warn` `.c-bad` `.c-neu` |
| `.btn` | Button base — variants `.btn-p` (primary), `.btn-g` (ghost/secondary), size `.btn-s` |
| `.fld` | Text input / select field |
| `.seg` | Segmented control (pill tab group) |
| `.navbtn` | Sidebar nav item, active state via `data-on="true"` |
| `.kpis` / `.kpi` | KPI grid container + card — layout variants via `data-lay` (grid/bento/split/rail/list) |
| `.thead` / `.row` | Table header row / data row |
| `.cell` | Calendar day cell (Leave screen) |
| `.qa` | Quick-action button grid |
| `.cosmos` / `.stars` | Fixed-position ambient background layers |

## Screens included
Login, Dashboard (Home), Leave, Attendance, Team, My Profile, Policies, Publish Policies (admin).

## Integrating into your app
1. Copy the `<style type="text/tailwindcss">...</style>` block into your global stylesheet (strip the `text/tailwindcss` wrapper if you're not using the Tailwind CDN runtime — the CSS inside is plain CSS + a few Tailwind `@apply`-free custom rules, so it works as-is in a normal `<style>` tag).
2. Copy the Google Fonts `<link>` tags.
3. Lift each screen's markup section (search for `sc-if` comments/screen names in the source) into your routes/components, replacing the templating placeholders (`{{ ... }}`) with your framework's real bindings.
4. Re-implement the tweak props above as real app state/theme settings if you want them switchable; otherwise just hardcode your preferred values as the permanent `data-*` attributes on your root element.
