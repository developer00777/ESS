# LakeB2B Multi-Brand Design System

A unified design system spanning four B2B brands operated under the LakeB2B umbrella. Shared spatial/type foundations; brand-level color accents.

## Brands covered

| Brand | URL | Category | Primary Accent |
|---|---|---|---|
| **LakeB2B** | [lakeb2b.com](https://www.lakeb2b.com) | B2B data enrichment & demand generation | Orange `#ff6a1a` |
| **Span Global Services** | [spanglobalservices.com](https://www.spanglobalservices.com) | Marketing data intelligence / IT consulting | Crimson `#e31837` |
| **IP Momentum** | [ipmomentum.com](https://www.ipmomentum.com) | VoIP & cloud communications | Blue `#1f6feb` |
| **recruitChamp** | [recruitchamp.com](https://www.recruitchamp.com) | AI-powered ATS & HR platform on Salesforce | Violet `#6a3fe6` |

## Sources reviewed
- Public marketing sites for all four brands (live fetch via web_fetch) — hero sections, features, solutions, stat cards, footers, iconography patterns.
- No codebase, Figma, or design files were provided. All design decisions are reverse-engineered from the live sites and brand voice.

## Index

```
/
├── README.md                     ← you are here
├── SKILL.md                      ← packaging for Claude Code
├── colors_and_type.css           ← foundational tokens (colors, type, spacing, elevation)
├── components.css                ← shared component styles (btn, card, badge, input, nav)
├── assets/                       ← logos & imagery per brand (remote URLs referenced in kits)
├── preview/                      ← design-system preview cards (registered assets)
├── ui_kits/
│   ├── lakeb2b/                  ← marketing site recreation
│   ├── spanglobal/               ← marketing site recreation
│   ├── ipmomentum/               ← marketing site recreation
│   └── recruitchamp/             ← app + marketing recreation
```

---

## Content Fundamentals

Copy tone across the four brands is **professional, direct, value-driven**. No fluff. Clarity over cleverness. All four share these patterns:

- **Voice**: second-person ("you", "your growth", "your buyers"). First-person plural ("we", "our") when the brand is speaking about itself.
- **Casing**: Sentence case for most UI. Title Case for marketing H1/H2. **ALL-CAPS UPPERCASE** used sparingly for eyebrow labels ("FEATURES & PRODUCTS", "SUCCESS STORIES") and CTA buttons ("START A 14-DAY FREE TRIAL", "GET A QUOTE", "READ CASE STUDY").
- **Numbers as hooks**: Big stats are everywhere. "+200% Growth in MRR", "450M+ Verified Business Profiles", "100+ recruitment teams", "4.9 customer satisfaction score". Each brand leans heavily on quantified outcomes.
- **Structure**: Short marketing headers ("Run Hiring Like a Business. Not Like a Spreadsheet."), followed by a ~1 sentence clarifier, then a single primary CTA.
- **No emoji.** Unicode triangle/arrow glyphs appear occasionally (▶, ➜) as decorative bullet markers.
- **No casual humor.** No exclamation marks except in Indian-market-leaning recruitChamp ("Talk to our Expert!").
- **Jargon acceptable** — audience is B2B marketers, sales leaders, RevOps, IT buyers. Terms like "ABM", "CAC", "MQL-to-SQL", "CPL", "VoIP", "CTI" are used without definition.

### Examples (lifted verbatim from sites)

- LakeB2B: "World's Premier B2B Growth Stack for Predictable Revenue Outcomes"
- LakeB2B: "Over 8000 GTM Teams have thrived using LakeB2B's GROWTH Formula: Intelligence + Execution = Inevitable Success"
- recruitChamp: "Run Hiring Like a Business. Not Like a Spreadsheet."
- recruitChamp: "All-in-One ATS + CRM + Finance Platform, Built Natively on Salesforce."
- Span Global: "Marketing Data Intelligence to Fuel Growth"
- IP Momentum: "VoIP and cloud communication solutions focused on cost efficiency and reliability."

### Do / Don't

| Do | Don't |
|---|---|
| "Accelerate pipeline with verified buyer data" | "Supercharge your growth journey! 🚀" |
| "3x faster time to pipeline" | "Blazingly fast results" |
| "Trusted by 100+ recruitment teams across India, the Middle East, and the US" | "Loved by thousands of happy customers" |
| "14-day free trial, no credit card" | "Sign up today and unlock amazing savings!" |

---

## Visual Foundations

### Layout
- **Centered container** at ~1200–1360px max-width. Generous side padding (24–40px).
- **Section rhythm**: large (`96px` top/bottom) vertical padding between marketing sections; smaller (`48–64px`) for dashboard panels.
- **Grid density**: marketing pages are *spacious*, always pair a headline with an illustration/product screenshot/stat. Dashboards are *dense* — lots of tabular data, tight rows.
- **Fixed elements**: sticky top nav (always white or brand-dark). No hamburger menu on desktop — full horizontal nav. Phone number + "Get a Quote" / "Contact Sales" is always pinned top-right.

### Color usage
- **Neutral backgrounds dominate**. `#ffffff` page, `#f6f7f9` section breaks, `#0b1e2d`-ish "dark hero" bands. Accent color used sparingly: buttons, stat values, small decorations, highlighted headlines.
- **Dark hero bands** are common on LakeB2B and recruitChamp — a near-black section with brand accent overlays, white type, and a product-screenshot float.
- **Stat values**: always rendered in accent color at display size.
- **Do NOT use bluish-purple gradients** — none of these brands use them. Gradients, when present, are same-hue (e.g., dark navy → slightly-less-dark navy on LakeB2B hero).

### Typography
- **Inter** for UI + body text. **Montserrat** (brand-supplied variable font, `fonts/Montserrat-VariableFont_wght.ttf`) for display/marketing headers.
- **Scale**: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 44 / 56 / 72 px. Display-xl (72px) for the marquee H1 on homepage. 56px for most H1. 36px for section H2.
- **Letter-spacing**: slightly tight (-0.02em) on headlines, normal on body, widened (+0.08em) on uppercase eyebrow labels.
- **Font weight**: 400 body, 500 nav links, 600 buttons/labels, 700 section headers, 800 display/stat values.
- **Note**: Montserrat is brand-supplied (variable font in `fonts/`). Inter remains the Google Fonts substitute for UI/body; supply a brand body font if different.

## Index

- `colors_and_type.css` — tokens (colors + type + spacing + elevation)
- `components.css` — shared button / card / badge / input styles
- `fonts/` — Montserrat variable (display)
- `assets/` — per-brand logo/image notes
- `preview/` — foundation + component preview cards (Design System tab)
- `ui_kits/lakeb2b/` — marketing site recreation
- `ui_kits/spanglobal/` — services site recreation
- `ui_kits/ipmomentum/` — VoIP marketing site recreation
- `ui_kits/recruitchamp/` — ATS dashboard recreation
- `SKILL.md` — cross-compatible skill definition

### Imagery
- **LakeB2B**: isometric 3D illustrations of people + dashboards (warm palette, oranges/yellows against dark navy); WebP product screenshot floats.
- **Span Global**: corporate stock photography (business people, team settings), warm tone.
- **IP Momentum**: clean product shots of VoIP phones; blue-washed office photography.
- **recruitChamp**: UI product screenshots ("spreadsheet", "salesforce" dashboards), warm team photos, bright/airy.
- **Shared treatment**: images are never heavily filtered. Natural color. Rounded corners (`16px`) on all in-layout imagery. Occasional soft drop shadow (`elev-2`). Never full-bleed b&w, never grain, never tilted.

### Borders & shadows
- **Border**: 1px `#e2e5eb` (neutral-200). On dark sections, `rgba(255,255,255,.08)`.
- **Radii**: `4` (inputs), `6` (buttons), `10` (small cards), `16` (cards), `24` (hero imagery), `999` (pills/badges).
- **Elevation system**: 5 tiers (0–4). Used sparingly. Most cards use border-only. Hover lifts elevate one tier.
- **Inner shadows**: not used.
- **Protection gradients**: small dark-to-transparent gradient overlays on hero video backgrounds, to keep white text readable. No other decorative gradients.

### Interactions
- **Hover**: primary buttons darken one shade (~10% L); secondary/ghost get `bg-2` fill; cards lift by `-2px` and gain `elev-3`; links shift to `accent-hover`.
- **Press**: primary buttons darken further AND shift down by `1px`. Cards do not shift on press.
- **Focus**: 3px accent-tinted ring (`box-shadow: 0 0 0 3px var(--accent-ring)`). Always visible on keyboard focus.
- **Transitions**: `150ms` for hover (fast), `220ms` for default, `380ms` for slow reveals. Easing: `cubic-bezier(.4,0,.2,1)` (material standard).
- **Animations**: subtle fades + translate-up on scroll reveal. No bounces. No skew. No spring. Dashboards use no entrance animation.

### Transparency & blur
- **Transparency**: only on hero overlays (dark-to-transparent gradients on video backgrounds). Cards are opaque.
- **Backdrop blur**: not used on any source site. Do not introduce.

### Cards
- **Default**: `1px` border, `16px` radius, `24px` padding, white bg, no shadow.
- **Elevated**: no border, `elev-2` shadow, same radius/padding.
- **Dark**: `brand-dark` bg, white text, no border.
- **Stat card**: compact, accent-colored value at display size, uppercase label below.

---

## Iconography

Each brand's approach:

- **LakeB2B**: decorative unicode arrows (`▶`, `➜`) used as bullet markers. No system icon font detected. Small flat illustrations instead of icons for features.
- **Span Global**: sparse icon use; mostly relies on photography + numbered stats.
- **IP Momentum**: heaviest icon user — a library of flat colored SVG icons at `/wp-content/uploads/2024/09/icon_*.svg` (money bag, mobile network, wallet, chart, global search, color swatch, calling, SMS, messages). Single-color or two-color flat style.
- **recruitChamp**: minimal icon use; relies on product screenshots to convey features.

### Our system: **Lucide** (CDN)

Because no internal icon font exists and we need consistent iconography across brands, we use **[Lucide](https://lucide.dev)** via CDN — a free, MIT-licensed, minimal stroke-style icon set (768+ icons). Matches the "clean, modern, conversion-focused" aesthetic called out in the brief.

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<i data-lucide="check-circle" style="width:20px;height:20px;color:var(--accent);"></i>
<script>lucide.createIcons();</script>
```

**Standard sizes**: `16px` (inline w/ sm text), `20px` (inline w/ base/md text), `24px` (feature lists), `32px` (card icons), `48px` (hero illustrations).
**Stroke width**: `1.75` (default) — slightly lighter for a modern B2B feel.
**Color**: `currentColor` inheritance. Accent color reserved for interactive/emphasized icons.

**Substitution note**: IP Momentum uses custom colored flat-style icons that do NOT match Lucide's stroke aesthetic. For production IPM deliverables, flag that original flat SVGs should be sourced from the brand's assets library.

**Emoji**: do not use. None of the source sites use emoji.
**Unicode glyphs**: `▶` and `➜` acceptable as decorative bullet markers matching LakeB2B's pattern.

---

## UI Kits

Each kit is a high-fidelity recreation of the brand's actual marketing site (or app UI for recruitChamp). Kits share `colors_and_type.css` + `components.css` but scope themselves via `.brand-*` class on the root.

- **[ui_kits/lakeb2b/](./ui_kits/lakeb2b/)** — marketing site: dark hero w/ stats, multi-channel campaign tabs, industry grid, real-business-impact stat row.
- **[ui_kits/spanglobal/](./ui_kits/spanglobal/)** — marketing site: crimson accent, corporate feel, stats + case study cards.
- **[ui_kits/ipmomentum/](./ui_kits/ipmomentum/)** — marketing site: trust-blue VoIP product page with feature grid + pricing.
- **[ui_kits/recruitchamp/](./ui_kits/recruitchamp/)** — Salesforce-style ATS dashboard + marketing home; covers login, candidate pipeline, and application view.

---

## Preview Cards

See the **Design System** tab — cards are grouped by `Type`, `Colors`, `Spacing`, `Components`, `Brand`.

---

## Caveats & Known Gaps

1. **Fonts are substituted.** Inter + Manrope via Google Fonts are chosen as the harmonized family. Brand sites use Gilroy, Poppins, Open Sans. Flag to confirm substitution is acceptable OR supply TTF files.
2. **Logo assets are NOT copied locally** — the sandbox blocks outbound fetching of cross-origin images. UI kits reference logos via remote URLs (these load in a browser but are not redistributable without rights). For a production design system, logos should be exported from brand source files and placed in `assets/<brand>/`.
3. **No codebase / Figma** was shared, so component structures are inferred from rendered HTML, not from source components.
4. **Iconography for IP Momentum** substitutes Lucide for their custom flat-style icons.
