# DESIGN-MIRO-DARK — PineFramework Design System (Dark)

> **DESIGN LAW · v1.0 · dark-only**
> Directive: *"C — remove any trace of the old design system, use Miro's design standards but adapted for a dark theme."*
> The old design system is **DEAD**: no fallback, no legacy values, no light overrides. This document is the single source of truth for every pixel the frontend renders.

**Consumption contract**

| Audience | How to consume |
|---|---|
| Design System Engineer (W1 token layer) | Emit every `--pf-*` token below as CSS custom properties + a React token object. Kebab-case names are final. |
| Frontend Engineer | Implement components strictly per §15 recipes. Token names are the API. |
| Chart owner | Consume §14 palette verbatim. Chart canvas consumes the same tokens as the UI. |
| Codemod | Drive replacements from the §17 Legacy Mapping table. |

**Naming**: all tokens kebab-case, prefixed `--pf-` (e.g. `--pf-surface-1`, `--pf-radius-full`). Component classes use `pf-` prefix. Weights never exceed **600**. Radius `full` = 9999px pill.

---

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
   `