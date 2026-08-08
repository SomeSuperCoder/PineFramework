# PineFramework Design System — Miro-Dark (SSOT)

> **DESIGN LAW · v1.1 · dark-only** — consolidated from `frontend/src/DESIGN-MIRO-DARK.md` (v1.0) + its UX companion layer into ONE source of truth at the repo root.
> Directive: *"C — remove any trace of the old design system, use Miro's design standards but adapted for a dark theme."*
> The old design system is **DEAD**: no fallback, no legacy values, no light overrides. This document is the single source of truth for every pixel the frontend renders.

**What this is / how to use**

This file is the **single source of truth (SSOT)** for the PineFramework UI — **LAW for all frontend work**. If code disagrees with this file, the file wins. Values mirror `frontend/src/theme/tokens.ts` (typed camelCase tokens + flat `cssVars` map) and `frontend/src/index.css` (`:root` custom properties); the byte-equal mirror is enforced by `frontend/src/__tests__/token-mirror.test.ts`.

- **Part A (§0–§16)** — design tokens, component recipes, application chrome: the *values* per state.
- **Part B (UX 0–UX 10)** — interaction states, keyboard navigation, accessibility, motion rationale, responsive contract.
- **§17 — Legacy Mapping** — the codemod table: every old value → its new token. **No old value survives as-is.**
- Section anchors `§0` (dark-only), `§13` (motion), `§15.4` (modal), `§17` (legacy mapping) are referenced from code comments — keep them stable.

**Consumption contract**

| Audience | How to consume |
|---|---|
| Design System Engineer (W1 token layer) | Emit every `--pf-*` token below as CSS custom properties + a React token object. Kebab-case names are final. |
| Frontend Engineer | Implement components strictly per §15 recipes. Token names are the API. |
| Chart owner | Consume §14 palette verbatim. Chart canvas consumes the same tokens as the UI. |
| Codemod | Drive replacements from the §17 Legacy Mapping table. |

**Naming**: all tokens kebab-case, prefixed `--pf-` (e.g. `--pf-surface-1`, `--pf-radius-full`). Component classes use `pf-` prefix. Weights never exceed **600**. Radius `full` = 9999px pill.

---

# PART A · Design Tokens & Component Recipes (LAW)

## 0 · Dark-Only Policy

| Rule | Statement |
|---|---|
| Theme count | **One theme: dark.** There is no light theme and there will never be a light override. |
| Forbidden | `@media (prefers-color-scheme: light)`, light-mode class switches, `-light` variant props on components. |
| Native chrome | Root sets `color-scheme: dark` so native inputs, scrollbars, and date pickers render dark. |
| Form controls | All inputs render dark; autofill must never flash white. |
| Miro dark inversion | Miro's light system inverts at the canvas/ink layer (white canvas → dark canvas, black ink → light ink) **but the brand signature survives**: pill shapes, canary-yellow accent, pastel sticky-note cards, flat elevation with strategic depth, ≤600 weights, negative display letter-spacing. |

---

## 1 · Canvas

The page background — the deepest layer. Also the chart canvas background.

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--pf-canvas` | `#0d0d18` | `#0d0d18` (body bg) | App shell background, page backdrop, chart canvas bg, input fill |

Canvas is a deep blue-tinted near-black (hue ≈ 240°). It is the ONLY color allowed behind the app shell; surfaces sit *above* it.

---

## 2 · Surfaces (0/1/2/3)

Raised layers, ordered lightest-up. Dark adaptation of Miro's `surface / surface-soft` family — on dark, "raised" means **lighter**, not darker.

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--pf-surface-0` | `#0d0d18` | `#0a0a14`, `#0d0d18` | App background (alias of canvas; reserved for explicit layering) |
| `--pf-surface-1` | `#12121f` | `#0f1520` | Cards, panels, TopBar, Sidebar — the default raised surface |
| `--pf-surface-2` | `#171725` | — | Nested panels, dropdown menus, hover fills, segmented-control track |
| `--pf-surface-3` | `#1e1e2e` | `#1e1e2e` | Modals, popups, tooltips, elevated overlays |

**Rules**
- Cards default to `surface-1`; overlays that float above cards use `surface-2`/`surface-3`.
- Surfaces never carry shadows by default — flat first, depth only per §12.
- All surfaces share the canvas hue family (≈240°, saturation 20–30%) so the ramp reads as one material.

---

## 3 · Hairlines (border / divider / strong)

1px separators. Dark adaptation of Miro's hairline family — on dark, stronger = **lighter** to stay visible.

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--pf-hairline-soft` | `#1a1a27` | — | Quiet row/table dividers, card inner hairlines |
| `--pf-hairline` | `#262636` | `#111128` | Default 1px borders, card outlines, TopBar/Sidebar chrome edges |
| `--pf-hairline-strong` | `#35354a` | `#151530` | Input borders, secondary-button outlines, borders that must read clearly |

**Contrast note** — every hairline is ≥ 1.8:1 against its host surface (strongest ≈ 2.6:1), intentionally visible on dark. Never dim borders below `#1a1a27`.

---

## 4 · Ink (text primary / secondary / tertiary)

Dark inversion of Miro's ink ladder (`ink-deep #050038` → `muted #a5a8b5`): the darker Miro went, the lighter we go.

| Token | Value | Replaces | Contrast vs surface-1 | Use |
|---|---|---|---|---|
| `--pf-ink-1` | `#ededf5` | `#e0e0e0` | 15.9:1 ✅ AAA | Primary text, headings, active nav, values |
| `--pf-ink-2` | `#c2c2d0` | `#c8c8d0` | 10.5:1 ✅ AAA | Secondary text, labels, chart text, inactive tabs |
| `--pf-ink-3` | `#8f8fa3` | — | 5.9:1 ✅ AA | Tertiary text, captions, helper copy |

**Dark text on bright fills** (Miro's `ink` ladder carried over verbatim — the text that sits ON pastel cards, yellow pills, and the white primary pill):

| Token | Value | Use |
|---|---|---|
| `--pf-ink` | `#1c1c1e` | Body text on pastel fills, white/yellow pill labels, badge text (AA ≥ 4.63:1 on all §8 tints) |
| `--pf-ink-deep` | `#050038` | Headings on pastel fills (AA ≥ 5.8:1 on all §8 tints) |

**Rules**
- Miro's `on-dark` collapses into the ink ladder: on a dark theme, text on dark = `ink-1`; no separate white token for body text.
- Headings use `ink-1` weight 500; display sizes use negative letter-spacing (see §6).
- Never use `ink-3` for critical information.

---

## 5 · Steel (muted / disabled / placeholder / icon)

Dark inversion of Miro's `steel / stone / muted` utility greys.

| Token | Value | Replaces | Contrast vs surface-1 | Use |
|---|---|---|---|---|
| `--pf-steel-icon` | `#9a9aad` | — | 6.7:1 ✅ | Icons, icon buttons, glyphs |
| `--pf-steel-placeholder` | `#7a7a90` | — | 4.4:1 ≈AA | Input placeholders |
| `--pf-steel-muted` | `#71718a` | `#888` | 3.9:1 ✅ AA-large | Muted labels, timestamps, non-essential meta |
| `--pf-steel-disabled` | `#5a5a70` | `#555` | 2.8:1 (exempt) | Disabled text/icons, empty-track fills |

**Rules**
- Disabled is AA-exempt: pair disabled text with `surface-2` fills, never with `surface-1` alone on critical controls.
- Icons are the only place `steel-icon` may exceed `ink-3` in prominence — glyphs need 3:1, not 4.5:1.

---

## 6 · Nested Text Scales — Type System

### Font family (official)

Roobert PRO is Miro's custom face and is **commercial / not self-hostable**. The official system stack, used everywhere:

```css
--pf-font-family: -apple-system, 'Segoe UI', Roboto, Inter, sans-serif;
```

This stack is the law. No other family may be used in UI or charts.

### Weight scale (cap at 600)

| Weight | Role |
|---|---|
| 400 | Body, captions, input values |
| 500 | Medium emphasis + ALL headings |
| 600 | Uppercase micro labels, badges, stat numbers |

**700+ is banned.** Bold comes from size/letter-spacing, not weight.

### The nested text scale (the app's complete type system)

| Token | Size / Line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `--pf-type-hero` | 80px / 1.05 | 500 | -2px | Full-screen empty states, launch moments |
| `--pf-type-display-lg` | 60px / 1.10 | 500 | -1.5px | Major stat displays (P&L hero) |
| `--pf-type-h1` | 48px / 1.15 | 500 | -1px | Page-level headlines |
| `--pf-type-h2` | 36px / 1.20 | 500 | -0.5px | Section headlines |
| `--pf-type-h3` | 28px / 1.25 | 500 | 0 | Card titles |
| `--pf-type-h4` | 22px / 1.30 | 500 | 0 | Panel titles, modal titles |
| `--pf-type-h5` | 18px / 1.40 | 500 | 0 | Small card titles, list headers |
| `--pf-type-subtitle` | 18px / 1.50 | 400 | 0 | Intro/lead copy |
| `--pf-type-body-md` | 16px / 1.50 | 400 | 0 | Default body, table cells |
| `--pf-type-body-md-medium` | 16px / 1.50 | 500 | 0 | Emphasized body, nav labels |
| `--pf-type-body-sm` | 14px / 1.50 | 400 | 0 | Secondary body, metadata, chart labels |
| `--pf-type-body-sm-medium` | 14px / 1.50 | 500 | 0 | Filter labels, list item titles |
| `--pf-type-caption` | 13px / 1.40 | 400 | 0 | Helper text, hints |
| `--pf-type-caption-bold` | 13px / 1.40 | 600 | 0 | Badge labels, tag chips |
| `--pf-type-micro` | 12px / 1.40 | 500 | 0 | Footer microcopy, table column heads |
| `--pf-type-micro-uppercase` | 11px / 1.40 | 600 | +0.5px | Section dividers, uppercase labels |
| `--pf-type-button-md` | 14px / 1.30 | 500 | 0 | All button labels |
| `--pf-type-stat` | 64px / 1.10 | 500 | -1.5px | Numeric callouts (bot balance, live P&L) |

**Rules**
- Negative letter-spacing is a **display-size progression**: -2px at 80px → -1.5px at 60/64px → -1px at 48px → -0.5px at 36px → 0 below 28px.
- Numeric data (prices, balances) uses `font-variant-numeric: tabular-nums`.
- Uppercase is reserved for `micro-uppercase` labels only — never uppercase body text.

---

## 7 · Accents

### Brand yellow — THE reserved accent

| Token | Value | Use |
|---|---|---|
| `--pf-brand-yellow` | `#ffd02f` | Wordmark, promo/tag chips, **one** accent pill CTA per viewport |
| `--pf-brand-yellow-hover` | `#fcb900` | Yellow pill hover (Miro `brand-yellow-deep`) |
| `--pf-brand-yellow-active` | `#d49c00` | Yellow pill pressed |

**Yellow law**
- Yellow is NEVER a theme background, NEVER a full panel fill, NEVER a default CTA.
- Max **one** yellow accent pill per viewport.
- Contrast on dark: `#ffd02f` on canvas ≈ **13.2:1** (≥3:1 requirement exceeded 4×) — a crisp accent, never a background.

### Brand blue — actions, links, focus

| Token | Value | Replaces (#2196f3) | Use |
|---|---|---|---|
| `--pf-brand-blue` | `#4262ff` | `#2196f3` (info) | Blue fills, focus rings, blue actions, chart series |
| `--pf-brand-blue-hover` | `#5b76fe` | — | Blue hover + **link text on dark** (5.0:1 ✅ AA) |
| `--pf-brand-blue-active` | `#2a41b6` | — | Blue pressed (Miro `blue-pressed`) |

### Pastel accents (dark-adapted)

| Token | Value | Contrast vs canvas | Use |
|---|---|---|---|
| `--pf-brand-coral` | `#ff9999` | 9.4:1 ✅ | Warm accent, coral tint base |
| `--pf-brand-rose` | `#ffd8f4` | 14.4:1 ✅ | Rose accent, tint base |
| `--pf-brand-teal` | `#0fbcb0` | 8.0:1 ✅ | Teal accent, tint base |

These bright pastels work as accent **text/icons on dark** at full opacity; as *fills* they must use the translucent tints in §8 — never full-opacity pastel backgrounds.

---

## 8 · Pastel Card Tints (dark-compatible)

Miro's sticky-note feature cards adapted to dark: **translucent pastel fills over the surface + dark ink text** — sticky notes glowing on a dark board. Alphas are **precomputed** so ink `#1c1c1e` clears AA (4.5:1) on surface-1.

| Token | Value (rgba) | Effective luminance | Contrast (ink text) | Use |
|---|---|---|---|---|
| `--pf-pastel-yellow` | `rgba(255, 208, 47, 0.35)` | 0.237 | **4.67:1** ✅ | Yellow sticky-note card, promo feature |
| `--pf-pastel-coral` | `rgba(255, 153, 153, 0.50)` | 0.235 | **4.63:1** ✅ | Coral sticky-note card |
| `--pf-pastel-rose` | `rgba(255, 216, 244, 0.32)` | 0.251 | **4.88:1** ✅ | Rose sticky-note card |
| `--pf-pastel-teal` | `rgba(195, 250, 245, 0.30)` | 0.264 | **5.10:1** ✅ | Teal sticky-note card |
| `--pf-pastel-violet` | `rgba(245, 243, 255, 0.26)` | 0.241 | **4.72:1** ✅ | "Featured" tier / premium card |

**Rules**
- Text on pastel cards = `#1c1c1e` (body) / `#050038` (headings) — both AA on the computed fills.
- **Light-theme chip text colors are superseded on dark**: Miro's `yellow-dark #746019` / `coral-dark #600000` FAIL contrast on translucent tints (≈1.7:1) — banned as text here. Ink/ink-deep replace them.
- Tints layer **over surface-1**; on lighter surfaces contrast only improves.
- Cards keep Miro geometry: `radius-xxxl` (28px), no border, generous padding.

---

## 9 · Semantic (success / error / warning)

| Token | Value | Replaces | Contrast vs canvas | Use |
|---|---|---|---|---|
| `--pf-semantic-success` | `#00b473` | `#4caf50` | 7.0:1 ✅ | Success, running/live states, chart up-candles (Miro `success-accent`) |
| `--pf-semantic-success-hover` | `#00cc84` | — | 8.2:1 ✅ | Success hover |
| `--pf-semantic-error` | `#ff5c5c` | `#e94560`, `#f44336` | 6.3:1 ✅ | Danger, errors, chart down-candles, destructive actions |
| `--pf-semantic-error-hover` | `#ff7373` | `#c73e54` | 7.6:1 ✅ | Error hover |
| `--pf-semantic-warning` | `#ffb020` | `#ff9800` | 10.3:1 ✅ | Warnings, pending states |
| `--pf-semantic-warning-hover` | `#ffc24d` | — | 11.8:1 ✅ | Warning hover |
| `--pf-semantic-info` | `#5b76fe` | `#2196f3` | 5.0:1 ✅ | Info / neutral-informational states |
| `--pf-semantic-success-bg` | `rgba(0, 180, 115, 0.12)` | — | — | Success surfaces (inline banners) |
| `--pf-semantic-error-bg` | `rgba(255, 92, 92, 0.12)` | — | — | Error surfaces (ErrorConsole, error banners) |
| `--pf-semantic-warning-bg` | `rgba(255, 176, 32, 0.12)` | — | — | Warning surfaces |
| `--pf-semantic-info-bg` | `rgba(91, 118, 254, 0.12)` | — | — | Info surfaces |

**Rules**
- Text on semantic **fills**: use ink `#1c1c1e` on success/error/warning pills (≥ 5.6:1 ✅); white text on these fills fails AA and is banned.
- Semantic colors as **text on dark surfaces** are safe at full opacity (all ≥ 5:1).
- The old accent `#e94560` had two roles — danger AND CTA. Danger maps to `semantic-error` here; the CTA role is replaced by the white primary pill (§15.1). No red accent remains.

---

## 10 · Radius

Miro scale, unchanged. **The pill is the brand signature.**

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--pf-radius-xs` | 4px | 4px | Small chips, kbd keys |
| `--pf-radius-sm` | 6px | — | Micro badges, discount pills |
| `--pf-radius-md` | 8px | 8px | Inputs, ghost buttons, selects, tables |
| `--pf-radius-lg` | 12px | 12px | Standard cards, dialogs |
| `--pf-radius-xl` | 16px | — | Feature cards, panels |
| `--pf-radius-xxl` | 20px | — | Larger feature cards |
| `--pf-radius-xxxl` | 28px | — | Pastel sticky-note cards |
| `--pf-radius-feature` | 32px | — | Hero banners, large callouts |
| `--pf-radius-full` | 9999px | — | **Every button, pill tab, badge, status dot, toggle** |

**Pill rule**: `full` on all buttons, pill tabs, badges, status dots, segmented controls. Cards use `lg`/`xl`/`xxxl` per recipe. Inputs use `md`. Never soften a button from `full`.

---

## 11 · Spacing

Miro base 4px, primary increment 8px.

| Token | Value | Token | Value |
|---|---|---|---|
| `--pf-space-xxs` | 4px | `--pf-space-xxxl` | 40px |
| `--pf-space-xs` | 8px | `--pf-space-section-sm` | 48px |
| `--pf-space-sm` | 12px | `--pf-space-section` | 64px |
| `--pf-space-md` | 16px | `--pf-space-section-lg` | 96px |
| `--pf-space-lg` | 20px | `--pf-space-hero` | 120px |
| `--pf-space-xl` | 24px | — | — |
| `--pf-space-xxl` | 32px | — | — |

**Dashboard rhythm**
- Dense chrome (TopBar 48px, tables, control panels): 4–16px steps.
- Card internal padding: `xl` (24px) compact · `xxl` (32px) feature panels.
- ContentArea vertical rhythm: `section-sm` (48px) default, `section` (64px) between major views.

---

## 12 · Elevation (shadow-0/1/2/3/4, dark-tinted)

Flat elevation with strategic depth. Shadows are **black-based** — Miro's ink-deep tint `rgba(5,0,56,…)` is invisible on dark; black at higher alpha reads correctly.

| Token | Value | Replaces | Use |
|---|---|---|---|
| `--pf-shadow-0` | `none` | shadow-0 | Default: cards separated by fill + hairline only |
| `--pf-shadow-1` | `0 1px 2px rgba(0, 0, 0, 0.24)` | shadow-1 | Hover lift on interactive cards |
| `--pf-shadow-2` | `0 4px 12px rgba(0, 0, 0, 0.32)` | shadow-2 | Dropdowns, popups, floating panels |
| `--pf-shadow-3` | `0 12px 32px rgba(0, 0, 0, 0.44)` | shadow-3 | Tooltips, small dialogs |
| `--pf-shadow-4` | `0 16px 48px rgba(0, 0, 0, 0.52)` | shadow-4 | Modals, top-level overlays |
| `--pf-scrim` | `rgba(0, 0, 0, 0.60)` | — | Modal/overlay backdrop |
| `--pf-focus-ring` | `0 0 0 2px var(--pf-canvas), 0 0 0 4px var(--pf-brand-blue)` | — | Keyboard focus visible on ANY surface |

**Rules**
- Surfaces differentiate by **fill lightness**, not shadow. Cards default `shadow-0` + hairline.
- Shadows are reserved for floating layers (popups, modals, tooltips, dropdowns) and interactive hover lift — never for resting cards.
- `--pf-focus-ring` is mandatory on every interactive element's `:focus-visible`; the canvas gap keeps the blue ring readable on any surface.

---

## 13 · Motion

Quiet, fast, functional — no bounce, no spring.

| Token | Value | Use |
|---|---|---|
| `--pf-motion-fast` | 150ms | Hover, pressed, color/state changes |
| `--pf-motion-base` | 200ms | Panels, modals, popups, tooltips, tab switching |
| `--pf-motion-ease` | cubic-bezier(0.25, 0.1, 0.25, 1) | Default easing (CSS `ease`) |

**Reduced motion — mandatory**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- Under reduced motion: no infinite pulse/spin; status dots render static color; fades over transforms.

---

## 14 · Chart App Palette

The chart canvas consumes **identical tokens** to the UI (chart bg = canvas, chart text = ink-2, etc.) so the chart always matches the app. Values are the exact chart configuration contract.

| Chart option | Value | UI token | Replaces |
|---|---|---|---|
| `backgroundColor` | `#0d0d18` | `--pf-canvas` | `#0d0d18` |
| `textColor` | `#c2c2d0` | `--pf-ink-2` | `#c8c8d0` |
| `gridColor` | `#232338` | chart-only `--pf-chart-grid` | `#181830` |
| `borderColor` | `#2e2e42` | chart-only `--pf-chart-border` | `#151530` |
| `fontFamily` | `-apple-system, 'Segoe UI', Roboto, Inter, sans-serif` | `--pf-font-family` | `'Arial, sans-serif'` |
| `upColor` | `#00b473` | `--pf-semantic-success` | — |
| `downColor` | `#ff5c5c` | `--pf-semantic-error` | — |
| `volumeColor` | `rgba(194, 194, 208, 0.18)` | chart-only `--pf-chart-volume` | — |
| `crosshairColor` | `#8f8fa3` | `--pf-ink-3` | — |
| tooltip bg | `#1e1e2e` | `--pf-surface-3` | — |
| tooltip border | `#35354a` | `--pf-hairline-strong` | — |
| tooltip shadow | `0 12px 32px rgba(0, 0, 0, 0.44)` | `--pf-shadow-3` | — |

**Series accents** (indicators, overlays — priority order): `--pf-brand-blue` `#4262ff`, `--pf-brand-yellow` `#ffd02f`, `--pf-brand-coral` `#ff9999`, `--pf-brand-teal` `#0fbcb0`. Never reuse success/error for non-directional series.

**Chart rules**
- Grid line `#232338` is subtle but visible on canvas — it always stays *behind* the data series.
- Candle direction is sacred: up = `#00b473`, down = `#ff5c5c`, on every chart, always.

---

## 15 · Component Recipes

All components: `border-radius` per recipe, `:focus-visible` → `--pf-focus-ring`, disabled → `cursor: not-allowed`, click target ≥ 40px height.

### 15.1 Button

| Variant | Default | Hover | Active / Pressed | Disabled |
|---|---|---|---|---|
| `Button` **primary** — dominant CTA | bg `--pf-ink-1` `#ededf5`, text ink `#1c1c1e` | bg `#ffffff` | bg `--pf-ink-2` `#c2c2d0` | bg `--pf-surface-3`, text `--pf-steel-disabled` |
| `Button` **secondary** (outline) | bg transparent, text `--pf-ink-1`, 1px `--pf-hairline-strong` | bg `--pf-surface-2`, border `#46465c` | bg `--pf-surface-3` | text `--pf-steel-disabled`, border `--pf-hairline` |
| `Button` **ghost** | bg transparent, text `--pf-ink-2` | bg `--pf-surface-2`, text `--pf-ink-1` | bg `--pf-surface-3` | text `--pf-steel-disabled` |
| `Button` **yellow** (accent, ≤1/viewport) | bg `--pf-brand-yellow`, text ink `#1c1c1e` | bg `--pf-brand-yellow-hover` | bg `--pf-brand-yellow-active` | bg `--pf-surface-3`, text `--pf-steel-disabled` |
| `Button` **blue** | bg `--pf-brand-blue`, text white (4.75:1 ✅) | bg `--pf-brand-blue-hover` | bg `--pf-brand-blue-active` | as primary |
| `Button` **danger** | bg `--pf-semantic-error`, text ink (5.6:1 ✅) | bg `--pf-semantic-error-hover` | bg `#d94b4b` | as primary |

**Base recipe (all variants)**: `--pf-radius-full`, padding `12px 24px`, height ≥ 44px (compact `10px 20px` ≥ 40px), type `--pf-type-button-md` (14 / 500 / 1.30). Ghost: `--pf-radius-md`, padding `8px 12px` (Miro's smallest). Icon-in-button gap `--pf-space-xs`. Disabled: no shadow, no ring.

### 15.2 Card

| Recipe | Tokens | Radius | Padding | Border / Shadow |
|---|---|---|---|---|
| `Card` (default) | bg `--pf-surface-1`, text `--pf-ink-1` | `--pf-radius-xl` (16px) | `--pf-space-xl` | `1px --pf-hairline-soft` |
| `Card` interactive | as default | `--pf-radius-xl` | `--pf-space-xl` | hover: `--pf-shadow-1` + `--pf-hairline-strong` |
| `Card` elevated (floating) | bg `--pf-surface-2`, text `--pf-ink-1` | `--pf-radius-lg` (12px) | `--pf-space-xl` | `--pf-shadow-2` |
| `Card` feature (pastel) | bg one of §8 tints, text ink `#1c1c1e` / headings `#050038` | `--pf-radius-xxxl` (28px) | `--pf-space-xxl` | NO border, NO shadow |
| `Card` stat | bg transparent, text `--pf-ink-1` | — | `--pf-space-lg` | number in `--pf-type-stat` |
| `Card` empty | bg `--pf-surface-1` | `--pf-radius-xl` | `--pf-space-xxl` | dashed border `--pf-hairline-strong`, icon `--pf-steel-muted` |

### 15.3 Input (`Input`, `NumberInput`, `Select`, `Textarea`)

| State | Tokens |
|---|---|
| Default | bg `--pf-canvas`, text `--pf-ink-1`, border `1px --pf-hairline-strong`, radius `--pf-radius-md`, padding `--pf-space-sm --pf-space-md`, height **44px fixed**, placeholder `--pf-steel-placeholder` |
| Hover | border `#46465c` |
| Focus-visible | border `--pf-brand-blue` + `--pf-focus-ring` |
| Disabled | bg `--pf-surface-1`, border `--pf-hairline`, text `--pf-steel-disabled` |
| Error | border `--pf-semantic-error`; helper text `--pf-type-caption` in `--pf-semantic-error` (6.3:1 ✅) |
| Success | border `--pf-semantic-success` |

### 15.4 Modal / Popup / Dialog

| Recipe | Tokens |
|---|---|
| `Modal` (large: BacktestResults, CodeEditor) | bg `--pf-surface-3`, radius `--pf-radius-lg` (12px), padding `--pf-space-xl`, border `1px --pf-hairline`, shadow `--pf-shadow-4` |
| `Dialog` (confirm: StrategyConflictDialog) | bg `--pf-surface-3`, radius `--pf-radius-lg`, padding `--pf-space-xl`, shadow `--pf-shadow-3`, max-width 420px |
| `Popup` (small menu: QuickAdderPopup, GoToDatePopup) | bg `--pf-surface-3`, radius `--pf-radius-lg`, padding `--pf-space-md`, shadow `--pf-shadow-3`, border `1px --pf-hairline` |
| Backdrop | `--pf-scrim` (rgba(0,0,0,0.60)) |
| Header | title `--pf-type-h5` `--pf-ink-1`; close = ghost icon button (36px, `--pf-radius-full`) |
| Body | `--pf-type-body-sm` `--pf-ink-2` |
| Footer | right-aligned Button row; primary + secondary |
| Motion | `--pf-motion-base` (200ms) fade + `translateY(4px)`; focus trapped in modal |

### 15.5 Tab (Tabs / SegmentedControl / ControlPanel keys)

| State | Token |
|---|---|
| Track | `--pf-surface-1`, radius `--pf-radius-full`, padding `4px`, gap `2px` |
| Inactive | transparent bg, text `--pf-ink-2`, padding `8px 16px`, radius `--pf-radius-full`, type `--pf-type-button-md` |
| Hover | bg `--pf-surface-2`, text `--pf-ink-1` |
| Active | bg `--pf-ink-1`, text ink `#1c1c1e` (white-on-dark pill, the inverted Miro black pill) |
| Disabled | text `--pf-steel-disabled` |
| Key badge (`Kbd`) | `--pf-surface-2` bg, `1px --pf-hairline` border, radius `--pf-radius-sm`, padding `2px 6px`, `--pf-type-micro-uppercase` |

### 15.6 NumberInput

Base = §15.3 input. Add:
- Step buttons: ghost icon buttons, 28×28px, `--pf-radius-full`; glyph `--pf-steel-icon` → `--pf-ink-1` on hover.
- Value text: `--pf-type-body-md`, `tabular-nums`.
- Focus passes through to the input's focus ring.
- Disabled = input disabled state.

### 15.7 ProgressBar

| Part | Token |
|---|---|
| Track | `--pf-surface-2`, radius `--pf-radius-full`, height `6px` (thin `4px`) |
| Fill default | `--pf-brand-blue` |
| Fill success | `--pf-semantic-success` |
| Fill warning | `--pf-semantic-warning` |
| Fill danger | `--pf-semantic-error` |
| Value label | `--pf-type-caption`, `--pf-ink-3`, tabular-nums |
| Indeterminate | animated stripes/slide — motion `--pf-motion-base`; disabled under reduced motion |

### 15.8 StatusDot / Badge

| Recipe | Token |
|---|---|
| `StatusDot` | 10px circle, radius `--pf-radius-full`; live = `--pf-semantic-success` with 200ms pulse (static under reduced motion) |
| Status colors | success `#00b473` · error `#ff5c5c` · warning `#ffb020` · info `#5b76fe` · offline `--pf-steel-muted` |
| `Badge` base | pill `--pf-radius-full`, text `--pf-type-caption-bold` (13/600), padding `4px 10px` |
| Badge yellow (promo) | bg `--pf-brand-yellow`, text ink `#1c1c1e` |
| Badge blue | bg `--pf-brand-blue`, text white (4.75:1 ✅) |
| Badge success | bg `--pf-semantic-success`, text ink (6.3:1 ✅) |
| Badge error | bg `--pf-semantic-error`, text ink (5.6:1 ✅) |
| Badge neutral | bg `--pf-surface-2`, text `--pf-ink-2`, border `1px --pf-hairline` |
| Tag chip (yellow) | bg `--pf-pastel-yellow`, text ink (4.67:1 ✅) |
| Tag chip (coral) | bg `--pf-pastel-coral`, text ink (4.63:1 ✅) |

---

## 16 · Application Chrome

| Region | Recipe |
|---|---|
| `TopBar` (48px) | bg `--pf-surface-1`, border-bottom `1px --pf-hairline`, padding `0 --pf-space-xl`; left = wordmark in `--pf-brand-yellow`; right = ghost icon buttons + bot `StatusDot` |
| `Sidebar` (collapsed 64px ↔ expanded 220px) | bg `--pf-surface-1`, border-right `1px --pf-hairline`; item = ghost-style, 36px tall, `--pf-radius-md`; active item = bg `--pf-surface-2` + text `--pf-ink-1`, icon `--pf-steel-icon`; label `--pf-type-body-sm-medium` |
| `ContentArea` breadcrumb bar | bg `--pf-canvas`, border-bottom `1px --pf-hairline-soft`, height ~40px; links `--pf-type-body-sm` `--pf-ink-2`, current `--pf-ink-1`, separators `--pf-steel-muted` |
| `ControlPanel` keyboard 1–5 | segmented control per §15.5; `Kbd` number keys inside each pill |
| `AppToolbar` (symbol/timeframe/interval) | pill `Select` (§15.3) + ghost refresh Button; `--pf-space-xs` gaps |

---

# PART B · UX Interaction Layer

> **Companion layer to Part A (§1–§16)** (UI tokens + component recipes — values owned by the Frontend UI Designer).
> This part owns **interaction states, motion, accessibility, responsive behavior** — the UX layer the token recipes are raised against.
> Status: **alpha, decision-ready**. Reviewed against Part A and current `index.css`.

## UX 0 · Reading This Doc

| Lane | Part | Owns |
|------|------|------|
| 🧑‍🎨 UI Designer | Part A (§1–§16) | Color/typography/radius/shadow **values** per state |
| 🧭 UX Designer (this part) | Part B (UX 0–UX 10) | **Which states exist, how they behave, motion, a11y, responsive** |

**Ground rules taken from Part A (unchallenged):**
- Miro's no-hover policy: default + pressed/active are the documented states → this part **adds** hover, focus-visible, disabled, and loading as the interaction layer the UI owner must value.
- Buttons are full pills (`{rounded.full}`) — never softened.
- Motion: 150–200ms ease **extracted as the system standard** (was a Known Gap in §13).
- Touch targets ≥ 44px effective (button-md 14px label).
- ✅ **ACCEPTED:** WCAG 2.1 AA contrast on the dark matrix is a hard requirement.

**Removal mandate:** every trace of the legacy system is out — including the old rose accent (`--accent-primary`) used today for focus rings and run buttons. Its replacement is the UI owner's value; the **behavior contract** below is this part's job.

---

## UX 1 · UX Operating Principles (Operate mode)

This is a **trading dashboard** — mode = *Operate*. Users scan, act, correct. Expression is subordinate to speed and trust.

1. **The run is sacred.** Running a backtest / starting the bot is the primary bullet on its surface. It is findable, focused, and never ambiguous about state.
2. **State is visible.** Every async operation (bot run, backtest, save, test-connection) exposes: idle → running → done/failed. No silent starts, no silent stops.
3. **Dark ≠ invisible.** On a dark matrix, contrast and focus are the *default* visual language, not a special case.
4. **Recognition over recall.** Panel shortcuts (1–5) are discoverable (badge in TopBar), never the only path.
5. **Errors are recoverable.** Every error carries a retry path or an explanation; no dead ends.
6. **Motion is signal, not décor.** Transitions explain *where things went*; they never delay or obscure.

---

## UX 2 · State Coverage — Per Component

### UX 2.1 Button (pill) — 7 states

| State | Behavior contract | Notes for UI owner |
|-------|-------------------|--------------------|
| **Default** | Full pill, resting surface | Brand primary CTA color family |
| **Hover** | Surface lightens / elevation +1 | Subtle only; never layout shift |
| **Active (pressed)** | Visual "press": surface darkens / 1px inward | `:active` + **`aria-pressed`** when the button is a toggle |
| **Focus-visible** | 2px outline, offset ≥2px, visible on dark, on **all** surfaces | Ring must clear any surface; never `outline: none` without a replacement |
| **Disabled** | Not just muted: **`aria-disabled="true"`, `pointer-events: none`**, label retains ≥3:1 vs surface | Keep label legible — disabled ≠ invisible; include `title`/helper why |
| **Loading** | Spinner + label persist (width-stable), **`aria-busy="true"`** on the control, clicks ignored | Don't swap label to "…" alone — keep action name |
| **Keyboard** | Enter **and** Space trigger; focus ring persists while pressed | See UX 4.3 |

Rules: icon buttons = same 7 states, but focus ring **must** wrap the full circle (not the glyph). Circular icon buttons render 44×44 min on this surface (up from Miro's 36 desktop — dark matrix legibility).

### UX 2.2 Input — 7 states

| State | Behavior contract |
|-------|-------------------|
| **Idle** | Resting border, clear affordance it's editable |
| **Placeholder** | Distinct from entered text; **placeholder ≠ label** — every field has a visible `<label>` or `aria-label`; placeholder is never the only hint |
| **Focus-visible** | 2px ring (same standard as buttons), replaces border, no layout shift (1px border → 2px ring must be offset, not expand) |
| **Hover-border** | Border lightens on hover — optional but consistent across ALL inputs |
| **Disabled** | `aria-disabled` / native disabled, 3:1 min against surface, no pointer |
| **Readonly** | Native `readonly` semantics; visually distinct from editable (subtle surface) but **not** muted to disabled levels |
| **Error** | Error message **linked** to the field via `aria-describedby`; field marked `aria-invalid="true"`; message survives validation, reachable by keyboard (focus moves to first error or message has focusable link) |

Numeric/strategy-param inputs: stepper buttons (spinners) must be 44px targets, keyboard-operable (↑/↓ adjust when focused).

### UX 2.3 Sidebar — 5 states + keyboard

| State | Behavior contract |
|-------|-------------------|
| **Collapsed (rail, 64px)** | Icon + label-badge only; labels hidden but present for SR (`aria-label` per item) |
| **Expanded (220px)** | Persistent width; item labels visible; active item highlighted |
| **Active nav** | `aria-current="page"` on the active item; visual indicator (bar/color) — **not** color alone |
| **Keyboard expand** | Focus on rail + **ArrowRight** expands; **ArrowLeft** collapses; Enter activates item |
| **Hover** | **Preview-only, never required**: hover may preview-expand for mouse users, but the *persistent* expand is a click/toggle (see UX 7.3) |
| **Escape** | **Escape collapses** an expanded sidebar and returns focus to the expanded-from item |

Transition between rail ↔ expanded is 150–200ms (motion-safe) — see UX 3.

### UX 2.4 Modal / popup / overlay (CodeEditor, QuickAdder, Confirm)

| Requirement | Contract |
|-------------|----------|
| **Focus trap** | Tab/Shift+Tab cycle inside the dialog; nothing behind is focusable |
| **Escape close** | Escape closes; restore focus to the trigger |
| **`aria-modal="true"`** | On the dialog container; background inert to AT |
| **Initial focus** | On the **first actionable** element (field, primary button), never the container |
| **Restore focus** | On close, focus returns to the element that opened it |
| **Label** | `aria-labelledby` → dialog title; `aria-describedby` → description when helpful |
| **Backdrop** | Click-outside closes *only* if the operation is cancellable; destructive confirmations require explicit confirm |

Editor overlay (CodeEditor): save shortcut `Ctrl/Cmd+S` works while trapped; dirty-state guard on Escape ("discard changes?") — never silent data loss.

### UX 2.5 Tabs & panel switcher

| Pattern | Contract |
|---------|----------|
| **Panel switcher (1–5)** | Global document-level shortcut; **not** ARIA tabs — it switches *routes/panels*, so treat as navigation: each panel is a `role="region"` with `aria-label` ("Backtest", "Settings", …). Shortcut hint visible in TopBar (discoverability). |
| **In-panel tabs** (Backtest settings, strategy editor) | **Roving `tabindex`**: only the active tab is in the tab order; **Arrow keys** (Left/Right, Home/End) move selection; `aria-selected` reflects state; panel = `role="tabpanel"` + `aria-labelledby` the tab |

Toggle pills (run-mode, currency pairs): `role="switch"` or `aria-pressed` button — one pattern per control type, never both.

### UX 2.6 Toast / Badge / StatusDot

| Element | Contract |
|---------|----------|
| **StatusDot** | Visual pulse/glow is **decoration only** — state must be conveyed by text (`aria-label`) + a live region. Never color/glow alone (2.5% of users have CVD). |
| **Async updates** | `aria-live="polite"` live region for **meaningful transitions** only: bot started/stopped, backtest completed, trade executed. |
| **Rate limit** | ❌ **Never announce every tick.** Queue + coalesce: max 1 announcement per ~2s; ticks collapse into the latest value. |
| **Error console** | New non-blocking error → polite. New **blocking** error (compile failed, connection lost) → `role="alert"` (assertive). |
| **Badges** | Counts (`ErrorConsole: 3`) are text, not color. Badge text ≥3:1 on its fill. |

---

## UX 3 · Motion System

### UX 3.1 Duration & easing tokens

| Token | Value | Use |
|-------|-------|-----|
| `motion-duration-micro` | 100–150ms | Leave, collapse, dismiss, press feedback |
| `motion-duration-base` | **150–200ms** | Standard state transitions: hover, focus, active, border color |
| `motion-duration-enter` | 150–250ms | Enter states: panels, modals, dropdowns, sidebar expand |
| `motion-duration-leave` | 100–150ms | Leave states: panel swap, modal close, sidebar collapse |
| `motion-easing` | **ease-out** (default); ease-in-out only for loops (spinner) | Never linear; never bounce/spring on this surface |

> Extracted from §13 Known Gap → **system standard**: 150–200ms ease-out base.

### UX 3.2 Motion inventory (per element)

| Element | Enter | Leave | Continuous |
|---------|-------|-------|------------|
| Panel switch (1–5) | 150–250ms fade/slide 8px | 100–150ms fade | — |
| Modal | 150–250ms fade + 8px rise | 100–150ms fade | — |
| Sidebar expand/collapse | 150–200ms width | 100–150ms width | — |
| Button hover/active | — | — | 150ms color/transform |
| StatusDot | — | — | Pulse — **killed under reduced motion** |
| Loading spinner | — | — | Loop — reduced-motion: slow or static |
| Hover-lift on cards | — | — | 150–200ms transform |

### UX 3.3 Reduced motion (`prefers-reduced-motion`)

| Directive | Behavior |
|-----------|----------|
| Duration | All transitions → **0ms** (instant) or ≤120ms crossfade (opacity only) |
| Transform motion | Parallax, slide, rise, hover-lift, width animation → **disabled**; crossfades only |
| Continuous | Pulse, glow, shimmer, indeterminate sweep → **off** (static state or slow, non-flashing) |
| Fallback | If an indeterminate progress bar is disabled, render **determinate** progress (real %) or a static "Running…" with `aria-busy` |

**Engineer hook (recommendation, not CSS):** expose two utility classes — `.uib-motion-safe` (default, applied at root) and `.uib-motion-reduce` (applied to root when the reduced-motion media query matches). Components gate their motion on the root class. Spinners/loops additionally honor the media query directly.

---

## UX 4 · Accessibility Contract (WCAG 2.1 AA on dark)

### UX 4.1 Contrast expectations — REQUIRED MINIMUMS (values owned by UI designer)

| Pair | Type | Required ratio |
|------|------|----------------|
| `ink` (body text) on `canvas` | Normal text | **≥ 4.5:1** |
| `muted` (secondary text) on `surface` | Normal text | **≥ 4.5:1** — if a "muted" value can't hold 4.5:1, it is *placeholder-only*, never body/metadata |
| Button label `on-primary` on `primary` | Normal text | **≥ 4.5:1** |
| `stat-display` (64px) on `canvas` | Large text (≥24px / 18.66px bold) | **≥ 3:1** |
| Input border / focus ring vs adjacent surface | UI component | **≥ 3:1** |
| Disabled label on disabled surface | Normal text | **≥ 3:1** (not zero-contrast) |
| Badge text on badge fill | Normal text | **≥ 4.5:1** (captions are small) |
| Placeholder on input surface | Normal text | **≥ 4.5:1** preferred; visible label must exist regardless |

⚠️ **Re-test required on dark:** every pair above that currently passes on white (Miro's marketing tokens) **must be re-measured** on the dark matrix — e.g. `muted` and `hairline` boundaries that rely on light-surface contrast will fail on dark. The UI owner re-derives values; this contract fixes the *floor*.

### UX 4.2 Focus-visible standard

- **Every** interactive element: `:focus-visible` → 2px outline, ≥2px offset, color with **≥3:1 vs the surface it sits on**.
- Same ring style on all surfaces (canvas, panel, elevated, overlay) — consistency is the standard.
- Never suppressed (`outline: none`) without a visible replacement.
- Current legacy gap: `index.css` only styles focus for `.backtest-panel button` + quick-adder search, and uses the legacy rose accent → replace with the system ring everywhere (see UX 8).

### UX 4.3 Critical keyboard flows

| Goal | Path | Contract |
|------|------|----------|
| Open/switch panel | **1–5** (or Tab → sidebar → Enter) | Focus lands on the panel's first interactive element or a named region; shortcut hint visible |
| Run backtest | Tab to primary Run button → **Enter/Space** | Button has focus ring; `aria-busy` during run; completion announced (UX 4.4) |
| Edit script | Open CodeEditor (panel action) → edit → **Ctrl/Cmd+S** | Focus trapped; save feedback visible + announced |
| Dismiss dialog | **Escape** | Closes; focus restored to trigger; dirty-guard for editor |
| Navigate sidebar | Tab to rail → **ArrowRight/Left** expand/collapse → **Enter** activate | Active item `aria-current="page"`; Escape collapses |
| Navigate in-panel tabs | **Arrow keys / Home / End** | Roving tabindex; `aria-selected` |
| Dismiss toast/error | **Escape** or close button focusable | Announcements never block input |

### UX 4.4 Screen reader announcements

| Event | Region / role | Copy guidance |
|-------|---------------|---------------|
| Backtest run completes | `role="status"` (polite) on results summary | "Backtest finished. 3,214 trades. Net profit +12.4%." |
| Bot state changed | `role="status"` (polite) | "Trading bot started" / "stopped" / "paused" |
| Trade executed | polite, **rate-limited** | "Buy 0.5 BTC at 62,400" — never every tick |
| New error (blocking) | `role="alert"` (assertive) | "Strategy failed to compile: line 42." |
| New error (non-blocking) | polite, rate-limited | "Connection re-established." |
| Loading | `aria-busy="true"` on container + one polite "Loading…" | Skeleton must not be announced repeatedly |

### UX 4.5 Per-component ARIA expectations (tabIndex/role — guidance, not code)

| Component | Expected |
|-----------|----------|
| Button | Native `<button>`; toggle → `aria-pressed`; loading → `aria-busy`; disabled → `aria-disabled` |
| Input | Native input + visible label or `aria-label`; error → `aria-invalid` + `aria-describedby` |
| Sidebar item | `role="navigation"` container; item `aria-current="page"`; expanded state on toggle `aria-expanded` |
| Modal | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; trap + restore |
| Panel | `role="region"` + `aria-label`; tab panel pairs with tab `aria-controls` |
| StatusDot | `aria-label="Bot running"` + live region; glow never the sole signal |
| Toast | `role="status"` (info) / `role="alert"` (blocking error) |

### UX 4.6 Checklist (design AND review)

- [ ] Semantic elements / landmarks: `<header>` TopBar, `<nav>` sidebar, `<main>` content
- [ ] Every interactive element keyboard-reachable + operable (Enter/Space)
- [ ] Focus visible everywhere, consistent, ≥3:1
- [ ] Labels associated (visible label or `aria-label`), placeholder ≠ label
- [ ] Error messages linked `aria-describedby`
- [ ] Modals trapped, Escape, initial + restore focus
- [ ] Tabs roving tabindex + arrows
- [ ] Contrast: all text ≥4.5:1, large/UI ≥3:1, disabled ≥3:1
- [ ] Alt text for images/icons (decorative icons `aria-hidden`)
- [ ] Touch targets ≥44×44 (rail items, icon buttons, steppers)
- [ ] Reduced motion honored
- [ ] Live regions rate-limited; no per-tick announcements

---

## UX 5 · Empty / Loading / Error / Partial States Workshop

The app today shows blank panels and raw text. Level all four states to this contract.

### UX 5.1 Empty (no data yet)

| Panel | Empty-state contract |
|-------|----------------------|
| **Dashboard/TradingBot** | "No trades yet" — icon + 1-line why + primary CTA (Run first backtest / Start bot) |
| **Statistics** | "Run a backtest to see statistics" + link to Backtest |
| **TradeHistory** | "No executed trades" + when the bot runs, trades appear here |
| **StrategyResults** | "No results yet" + CTA "Run backtest" (primary bullet) |
| **ErrorConsole** | "All clear" — never a blank dark box; state `aria-live` polite on *new* entries only |

Empty ≠ disabled: every empty state has a next action. No dead ends.

### UX 5.2 Loading (skeleton)

- Skeleton placeholders **match final layout** (stat blocks, rows, chart frame) — no raw "Loading…" text alone.
- Container `aria-busy="true"`; one polite "Loading…" announcement; no repeated announces.
- Under reduced motion: static skeleton (no shimmer).
- Deterministic where possible: backtest shows **progress %** (indeterminate sweep only when % is unknowable).

### UX 5.3 Error

- **Inline banner** (not only console): `role="alert"` for blocking, polite for advisory; dismissible (`aria-label="Dismiss"`), focusable.
- **Retry pattern**: every transient error carries Retry (primary on banner) + Cancel; retry re-runs the same params (no re-entry).
- Message = what failed + what the user can do. Never raw exception text as the user-facing copy.
- Form errors: inline per-field, `aria-describedby`, focus moves to first error.

### UX 5.4 Partial / stale

- Stale data (bot paused, results from old params): visible **"as of 14:32"** timestamp; never present stale as live.
- Partial results (backtest with warnings): show what succeeded + collapsible warning list; the run is not silently truncated.
- Offline/connection lost: banner + StatusDot state change; data remains readable, writes disabled with reason.

---

## UX 6 · Responsive Futures (UX contract — no code change today)

The app is desktop-first (overflow hidden, no media queries). This section **defines the future contract**; nothing here alters current code.

| Breakpoint | Behavior |
|------------|----------|
| **≥1280 (base, today)** | TopBar 48px; sidebar rail 64px (hover/click expand 220px); panels 1–5; full stat-display |
| **1024–1279** | **Sidebar auto-collapses to rail** (64px); breadcrumb bar truncates with `title`; panel grids go 2-up → 1-up; stat-display scales down one step |
| **768–1023** | **Single column panels**; TopBar condenses (hide secondary actions behind menu); sidebar becomes overlay drawer (click/hamburger, focus-trapped when open); touch targets bump to ≥44px |
| **480–767** | Single column, full-width inputs; CodeEditor overlay full-screen; tables horizontal-scroll with sticky first column; stat-display scales to ≤48px |
| **<480** | Touch-first; icon buttons ≥44px; drawer full-screen; all pills full-width |

Contract rules: no feature is unreachable at any breakpoint; keyboard flows (UX 4.3) unchanged across breakpoints; reduced-motion applies everywhere.

---

## UX 7 · Interaction Redesign Opportunities

### UX 7.1 Backtest → Results flow ⭐ primary

**User's job:** configure a strategy, run it, judge whether it's worth trading.

**Today:** run and results are separate panels; completion is easy to miss; iterating requires re-navigation.

**Target flow:**
1. Configure in Backtest (params persist across runs — SSOT).
2. **Run** (primary bullet) → `aria-busy`, progress visible.
3. On complete → results panel **auto-activates** (panel switch + 150–250ms enter), completion announced politely, summary card (trades, net profit, drawdown) at top.
4. "Re-run" replaces "Run" (same params) with last-run timestamp; results refresh in place — no re-navigation.
5. Chart on Results is interactive: hover crosshair + keyboard-accessible data points (arrow keys) for SR users.

**Friction removed:** completion visibility, iteration cost, param drift between runs.

### UX 7.2 Telegram config flow

**User's job:** connect the bot to Telegram and verify it works before trusting alerts.

**Target flow:** single page, not multi-step: fields (token, chat id) → inline validation on blur → **"Save & Test connection"** primary → explicit states: `Testing…` (aria-busy) → `Connected ✓` (green, polite announcement) / `Failed ✗` (inline error + Retry). Persist on save; connection state shown on the panel after reload.

**Friction removed:** blind saves, no way to verify, dead-end failures.

### UX 7.3 Sidebar hover-expand → click-expand (recommend: hybrid)

**Problem today:** hover-expand is mouse-only, motion-heavy, and traps pointer users into accidental expansion; no keyboard parity.

**Contract:** rail by default. **Click/toggle expands persistently** (220px, 150–200ms). Hover may *preview* expand for mouse users but is never required and never traps. **Keyboard:** ArrowRight expands, ArrowLeft collapses, Escape collapses + restores focus. State `aria-expanded` on the toggle.

### UX 7.4 Strategy run button prominence

**Contract:** the Run action is the **primary bullet** on its surface — highest contrast fill, full pill, first in action order, one place only. During run: disabled with `aria-busy`, label persists, progress shown. Never two competing run buttons in one viewport. Empty states route to it.

### UX 7.5 Error console priority

**Contract:** errors are surfaced in three tiers: (1) StatusDot + TopBar badge count — glanceable; (2) polite/alert announcement for blocking events; (3) full ErrorConsole panel with filter (errors/warnings/info). Severity never color-only. New blocking error can briefly auto-open the console or animate the badge — not both.

### UX 7.6 Empty states (leveled in UX 5)

Every panel gets a designed empty state with a next action — no raw blank, no raw text.

---

## UX 8 · Review Findings — Current Implementation

| # | Screen / element | Current behavior | Finding | Severity |
|---|------------------|------------------|---------|----------|
| F1 | Global | Legacy rose accent used for focus ring + run buttons | Violates removal mandate; replace with system ring/primary | 🔴 High |
| F2 | All interactive | Focus-visible only on `.backtest-panel button` + quick-adder | Inconsistent focus standard; keyboard users can't see focus elsewhere | 🔴 High |
| F3 | StatusDot | Glow-only status | Fails non-visual communication (CVD + SR) | 🟠 Med |
| F4 | Sidebar | Hover-expand only | No keyboard parity, no Escape, pointer-trappy | 🟠 Med |
| F5 | Global | No `prefers-reduced-motion` handling | Pulse/shimmer/expand can't be disabled | 🟠 Med |
| F6 | Overlays | Editor/QuickAdder have no focus trap contract | SR/keyboard can escape; restore not guaranteed | 🟠 Med |
| F7 | Placeholder text | `#666` placeholder on `#1e1e2e` | Contrast failure (see UX 4.1) | 🟠 Med |
| F8 | Panels | Blank/raw-text states | Empty/Loading/Error states not leveled | 🟡 Low–Med |
| F9 | Tabs | No roving tabindex/arrow contract | Keyboard tab nav unmanaged | 🟡 Low |

---

## UX 9 · UX Heuristics & Review Checklist (design AND review)

1. **Visibility of system status** — every async op exposes idle/running/done/failed; stale data stamped.
2. **Match real world** — trading vocabulary, no jargon-only labels; confirm destructive actions.
3. **User control & freedom** — Escape everywhere; re-run, retry, undo-style paths; no dead ends.
4. **Consistency & standards** — one focus ring, one press pattern, one toggle pattern per control type.
5. **Error prevention** — inline validation on blur; param persistence; dirty-guard on editor.
6. **Recognition over recall** — shortcuts visible (TopBar badge); empty states teach next action.
7. **Flexibility & efficiency** — 1–5 panel shortcuts + full mouse path; re-run shortcut.
8. **Aesthetic & minimalist** — flat cards, subtle hover-elevation only; motion = signal; no décor.

A11y checklist: UX 4.6.

---

## UX 10 · Definition of Done (for implementation waves)

- [ ] All components implement the state matrix of UX 2 (7-state buttons, 7-state inputs, sidebar/modal/tab contracts)
- [ ] Focus-visible standard shipped globally (2px, offset, ≥3:1, all surfaces)
- [ ] Motion tokens applied; reduced-motion honored (0ms/crossfade; pulse+shimmer+lift off)
- [ ] Contrast floors of UX 4.1 verified on dark (body ≥4.5:1, large/UI ≥3:1, disabled ≥3:1)
- [ ] Critical keyboard flows of UX 4.3 pass end-to-end (Playwright user-behavior flow)
- [ ] SR announcements rate-limited; no per-tick speech
- [ ] Empty/Loading/Error/Partial states leveled on all 9 panels
- [ ] Legacy rose accent removed; no trace of old system remains
- [ ] Review findings F1–F9 resolved or explicitly scheduled

---

*UX layer of the Miro-Dark system — values live in Part A (§1–§16). Questions on flows/behavior land in Part B; questions on tokens land in Part A.*

---

## 17 · Legacy Mapping (codemod table)

Every old value → its new token. This table drives the automated codemod (W1). **No old value survives as-is.**

| Old value | Old role | New token | Notes |
|---|---|---|---|
| `#0d0d18` | body bg | `--pf-canvas` | Also chart `backgroundColor` |
| `#0a0a14` | alt surface | `--pf-surface-0` | Merged into canvas stack |
| `#0f1520` | surface | `--pf-surface-1` | Standard card/panel fill |
| `#1e1e2e` | surface | `--pf-surface-3` | Elevated layer |
| `#111128` | border | `--pf-hairline` | Default 1px border |
| `#151530` | alt border / chart border | `--pf-chart-border` (chart) · `--pf-hairline-strong` (general UI borders) | Old value had both roles |
| `#e0e0e0` | text primary | `--pf-ink-1` | |
| `#c8c8d0` | chart text / secondary | `--pf-ink-2` | Chart `textColor` |
| `#888` | muted | `--pf-steel-muted` | Muted labels |
| `#555` | muted-dark | `--pf-steel-disabled` | Disabled text |
| `#e94560` | accent CTA | `--pf-semantic-error` (danger) or Button primary (CTA) | Two roles; CTA role → white primary pill |
| `#c73e54` | accent hover | `--pf-semantic-error-hover` | |
| `#2196f3` | info | `--pf-brand-blue` / `--pf-semantic-info` | Fills vs text |
| `#4caf50` | success | `--pf-semantic-success` | |
| `#ff9800` | warning | `--pf-semantic-warning` | |
| `#f44336` | danger | `--pf-semantic-error` | |
| `#181830` | chart grid | `--pf-chart-grid` | |
| `Arial, sans-serif` | chart font | `--pf-font-family` | System stack |
| radius 4 / 8 / 12 | legacy radii | `--pf-radius-xs / md / lg` | Old 4px buttons → `--pf-radius-full` |
| spacing 4–24 | legacy spacing | `--pf-space-xxs … xl` | 8px increment |
| shadow 1–3 | legacy shadows | `--pf-shadow-1 … 3` | Black-tinted |
| `-light` variants | theme switch | ❌ none | Dark-only policy: delete, do not map |

---

## Do / Don't

**Do**
- Pill (`--pf-radius-full`) on every button, tab, badge, status dot.
- White primary pill as the dominant CTA on dark; yellow reserved (≤1 accent CTA per viewport).
- Pastel sticky-note cards (translucent fills + dark ink text) beside dark cards in the same viewport.
- Flat elevation: surfaces separate by lightness; shadows only on floating layers.
- Weights 400/500/600 only; negative letter-spacing on display sizes only.
- `--pf-focus-ring` on every interactive element; AA-checked text everywhere (§4–§9 tables).

**Don't**
- Don't use `--pf-brand-yellow` as background, full panel fill, or default CTA.
- Don't introduce accents beyond yellow + blue + pastel ties; semantic colors are for state only.
- Don't soften button corners — the pill is the signature.
- Don't use Miro light-theme chip text (`yellow-dark`, `coral-dark`) on dark fills — they fail contrast.
- Don't add shadows to resting cards.
- Don't emit light-mode overrides or `-light` variants — dark only, forever.
- Don't use white text on semantic fills (fails AA) — use ink on green/red/orange.
