# Design System — Guidon Brewing Wholesale

## Product Context

- **What this is:** Next.js 14 wholesale ordering + keg-deposit/return tracking system for a craft brewery. Embeddable into the brewery's WordPress site via an iframe widget.
- **Who it's for:** Mike (owner/operator of Guidon Brewing, Louisville KY) for the admin side. Wholesale customers, mostly bars and restaurants in Kentucky, for the customer portal and ordering widget.
- **Space/industry:** Craft beer wholesale / small-brewery operations. Peers include Ekos, Arryved, Fintech.net, Next Glass — but none of them ship an embeddable WordPress widget, which is Guidon's wedge.
- **Project type:** Hybrid — admin dashboard + customer self-serve portal + public-facing embeddable catalog. Design system has to hold all three.

## Memorable Thing

A brewery owner or bar manager sees this for 10 seconds and thinks **"this brewery has roots. They've been at this a while."** Even though Guidon is new. That's the posture every design decision serves.

## Aesthetic Direction

- **Direction:** **Letterpress Trade Portal**
- **Decoration level:** Intentional
- **Mood:** Vintage craft-trade order book. Cream newsprint, weathered brass, amber glass. Confident, unhurried, tactile, earned. Not SaaS. Not dark-mode-neon. Not cards-with-gradients.
- **Reference vibe:** Pre-Prohibition brewery ledgers, Anchor Brewing's early trade documents, craft butcher-paper menus, state fair premium lists, Notch Brewing's typographic discipline, Sierra Nevada's distributor materials.
- **Anti-aesthetic:** Neon gold on charcoal, glass morphism, stats-card grids, dark mode as default, gradient CTA buttons, centered-hero-blob layouts, Vercel-template polish.

## Typography

Three families, four roles. No Inter.

- **Display / Hero: Fraunces** (variable serif, `opsz` axis)
  Google Fonts: https://fonts.google.com/specimen/Fraunces
  Variable axes: `wght 100..900`, `opsz 9..144`, `SOFT 0..100`, `WONK 0..1`
  Used at high optical size for page headings. Has genuine letterpress character; can go heavy and condensed for mastheads.

- **Body: Source Serif 4** (Adobe / Google Fonts)
  https://fonts.google.com/specimen/Source+Serif+4
  Used for: long-form text (invoices, product descriptions, application forms, order notes), all reading contexts.

- **UI / Labels: Instrument Sans**
  https://fonts.google.com/specimen/Instrument+Sans
  Used for: buttons, form labels, nav items, section labels, small-caps overlines. Readable at small sizes, not on the overused list.

- **Data / Tables: Geist** with `font-variant-numeric: tabular-nums`
  https://vercel.com/font
  Used for: tabular data (keg counts, prices, order numbers, invoice line items). Modern, readable, precise tabular numerals without feeling like a terminal.

### Loading strategy

Google Fonts via `<link>` tag in `app/layout.tsx`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

Geist is already a Vercel font and can be self-hosted via `@vercel/font/geist` or loaded via CDN.

### Scale (rem-based, 16px root)

| Role | Size | Weight | Font |
|------|------|--------|------|
| Display XL (hero) | 4.5rem / 72px | 500-700 | Fraunces opsz 144 |
| Display L (page heading) | 3rem / 48px | 500 | Fraunces opsz 72 |
| Display M (section heading) | 2rem / 32px | 500 | Fraunces opsz 36 |
| Heading S (subsection) | 1.25rem / 20px | 600 | Instrument Sans |
| Body L (long form) | 1.125rem / 18px | 400 | Source Serif 4 |
| Body M (default) | 1rem / 16px | 400 | Source Serif 4 |
| UI (buttons, labels) | 0.875rem / 14px | 500 | Instrument Sans |
| UI small (caption, hint) | 0.8125rem / 13px | 400 | Instrument Sans |
| Overline (small caps) | 0.75rem / 12px | 600 | Instrument Sans, `letter-spacing: 0.12em`, `text-transform: uppercase` |
| Table cell | 0.9375rem / 15px | 400 | Geist, `tabular-nums` |
| Code / order IDs | 0.875rem / 14px | 400 | Geist Mono (accent) |

Line heights: display 1.05, body 1.55, UI 1.4, table 1.45.

## Color

**Approach:** Restrained. Cream is the hero. Every other color is rare and intentional.

### Light mode (default)

```css
--paper:    #F5EFDF;   /* Primary background — unbleached newsprint */
--surface:  #EEE5CE;   /* Elevated surface — cardstock, rarely used */
--divider:  #D8CDA8;   /* Hairline rule color */
--ink:      #2A2416;   /* Primary text — deep olive-brown, NOT pure black */
--muted:    #6B5F48;   /* Secondary text — aged pencil */
--faint:    #9B8D6F;   /* Tertiary text — light graphite */
--brass:    #9E7A3B;   /* Accent — weathered amber (replaces neon gold) */
--brass-dim:#7C5F2E;   /* Pressed/hover state for brass */
--olive:    #3D4F2F;   /* Secondary accent — from existing Guidon brand */
--olive-dim:#2C3921;   /* Pressed state for olive */
--ruby:     #8C3B2E;   /* Destructive — rust, not neon red */
--pine:     #2F5436;   /* Success — forest, not neon green */
--ember:    #B8793A;   /* Warning — glowing amber */
```

### Dark mode (opt-in via toggle, NOT default)

```css
--paper:    #1E1712;   /* Deep walnut */
--surface:  #2A2017;   /* Elevated walnut */
--divider:  #3E3528;
--ink:      #EBE1C6;   /* Parchment */
--muted:    #BAA97E;
--faint:    #8A7B55;
--brass:    #C89849;   /* Warmer, more visible on dark walnut */
--brass-dim:#B08A3E;
--olive:    #7A9159;   /* Lighter olive for legibility */
--olive-dim:#607542;
--ruby:     #C86A56;
--pine:     #7AAF82;
--ember:    #DDA05E;
```

Dark mode desaturates accents ~15% so the brass/olive don't read as neon. Walnut/parchment instead of charcoal/cream reinforces "aged trade document," not "hacker terminal."

### Semantic uses

| Token | Use |
|-------|-----|
| `--ink` on `--paper` | Primary text on default background |
| `--muted` on `--paper` | Secondary text, metadata, timestamps |
| `--brass` | Primary CTA, active nav state, positive emphasis, accent icons |
| `--olive` | Secondary CTA, Guidon brand moments, print/export buttons |
| `--ruby` | Delete, revoke, overdue |
| `--pine` | Paid, delivered, confirmed |
| `--ember` | Pending, due-soon, warning |
| `--divider` | Horizontal hairline rules between sections |

## Spacing

- **Base unit:** 4px (CSS `--space-1: 0.25rem`)
- **Density:** Comfortable for prose, tight for tables
- **Scale:**
  - `--space-px: 1px`
  - `--space-0.5: 2px`
  - `--space-1: 4px`
  - `--space-2: 8px`
  - `--space-3: 12px`
  - `--space-4: 16px` (default gap)
  - `--space-6: 24px`
  - `--space-8: 32px`
  - `--space-12: 48px`
  - `--space-16: 64px`
  - `--space-24: 96px` (section separators)

Tables use `--space-2` row padding. Text blocks use `--space-6` paragraph spacing. Sections separate on `--space-16` minimum.

## Layout

- **Approach:** Editorial / document-first. Tables are typographic tables, not dashboard widgets. No card grids for data unless the content is genuinely card-shaped (e.g., a product in the catalog).
- **Grid:** 12-column max, but content mostly sits in a single or two-column text-width column. Max content width `--container-prose: 65ch` for reading, `--container-app: 1280px` for admin, `--container-full: 1440px` for marketing.
- **Sidebar admin nav:** Reads like a document table of contents, not a SaaS chip grid. Left-aligned text links with a brass hairline on the active state. No icon circles.
- **Border radius hierarchy:**
  - `--radius-none: 0` — tables, inputs, rule lines
  - `--radius-sm: 2px` — buttons, small badges (subtle, not pillowy)
  - `--radius-md: 4px` — panels, modals
  - No `rounded-2xl` anywhere. No `rounded-full` except on avatar images.
- **Shadows:** Minimal. `--shadow-sm: 0 1px 2px rgba(42, 36, 22, 0.08)` for lifted surfaces. No large soft drop shadows, no colored glows.

### Key layout moves (these are the RISKS from the consultation)

1. **No stats-card row on admin dashboard.** Replace with a **typographic ledger line** in Fraunces + Source Serif:
   > *Today, 47 kegs out. 2 orders pending delivery. 1 invoice overdue ($420).*
   Set in prose, not a card grid. The numbers use Geist tabular-nums inline.

2. **Masthead uses the Guidon flag at native aspect.** Never square, never rounded. Ratio 350:194. Paired with small-caps "WHOLESALE ORDERS" overline.

3. **Hairline rules replace most card borders.** `1px solid var(--divider)` above/below sections. Zero box-shadow on content blocks.

## Motion

- **Approach:** Minimal-functional only.
- **Easing:**
  - `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` — for hover states
  - No custom entrance or scroll-driven easing
- **Duration:**
  - `--dur-fast: 120ms` — hover color/opacity shifts
  - `--dur-base: 180ms` — focus ring transitions, button press
  - No long animations
- **Nothing animates on page load.** No fade-ins, no slide-ups, no staggered entrances. Old trade portals don't animate. Restraint is the taste signal.

## Ornamental elements

- **Paper grain:** SVG or CSS noise filter applied at ~3% opacity on `--paper` and `--surface`. Subtle enough that it reads only on close inspection.
- **Hop + barley vignettes:** Small hand-drawn SVG ornaments at section transitions in the marketing and invoice layouts. NOT on every page. NOT as background decoration. Use sparingly as editorial flourishes.
- **Guidon flag watermark:** At 5% opacity in the masthead background on /order and /portal landing. Subtle brand reinforcement without shouting.
- **Small caps + letter-spacing:** Used for section labels and nav (overline style), reinforcing the typographic/editorial identity.

## Anti-patterns (never do these)

- `rounded-xl` or `rounded-2xl` on any card/button
- Gradient backgrounds or gradient buttons
- Bright neon accents (the existing `#D4A843` gold is the color to replace, not reuse)
- Dark mode as default
- Stats card grids as the dashboard pattern
- Centered hero with a blob behind it
- Colored shadow glows (`shadow-gold-500/20` style)
- Emoji icons in buttons or nav
- `system-ui` / `-apple-system` as display or body font
- Geometric sans (Inter, Poppins, Montserrat) as the primary display face

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-19 | Initial design system created | Created by `/design-consultation`. User flagged existing UI as "looks too AI-like." Chose Letterpress Trade Portal aesthetic to maximize differentiation from SaaS template defaults. Skipped AI mockups due to API billing; DESIGN.md is the source of truth — validation will happen via `/design-html` implementation and `/design-review` QA. |
