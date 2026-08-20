# DESIGN — Landing Surface (Feral Glass)

<!--
  DIRECTION CONTRACT — Pine Framework landing (brief-pinned world; concept-seed roll
  skipped per impeccable new-work.md: "a user- or brief-pinned direction beats the roll").

  THESIS: The landing is a night-trader's instrument: dark glass panels showing the
  product actually working (chart, backtest curve, bot status) over a faint amber wash,
  with one raw yellow action — Get Started — as the only brutalist artifact. It refuses
  the marketing-default hero (centered headline, stock mockup, icon-card grid).

  OWN-WORLD: Deep oklch ground with an amber radial wash; restrained liquid-glass
  (translucent fill, hairline white border, restrained blur, one inner highlight);
  Inter display type, high weight, tight tracking; brand yellow only where the product
  must be touched — the CTA, chip bullets, glow, scroll hairline.

  STORY: A first-time visitor sees Pine Framework doing its job in the first viewport,
  reads the mechanism in one headline, clicks the single yellow action, and enters the
  panel. The landing looks like the product, not an ad for it.

  FIRST VIEWPORT: Left: headline + lede + yellow Get Started with a hard offset shadow.
  Right: elevated glass demo panel — synthetic mini-chart + stat tiles, labeled
  SYNTHETIC DEMO. Thin amber scroll hairline at the top.

  FORM: "The night trader's instrument panel" — the product's own panel grammar, elevated
  and dramatized. Seed: n/a (brief-pinned FeralUI language + existing theme LAW).
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, and DESIGN.md.
-->

## 1. Mode, Scene, and Authority

- **Mode:** Persuade — the visitor's success is deciding to enter the app. The design is the product's front door.
- **Scene:** a trader at a terminal at night. Dark ground is not a default here — it is the incumbent app's scene (`color-scheme: dark`, background `oklch(0.145 0 0)`) and the physical scene of the user. Dark, then, is forced by evidence.
- **Authority:** the incumbent panel (`ControlPanel`, `TopBar`, panels) is the visual authority the landing *extends*. The landing is a new surface inside an established visual world: dark oklch palette, brand yellow `#ffd02f`, Inter, motion LAW — the landing must feel like the same instrument, not a different product.
- **FeralUI is honored as a design language, never a package:** raw/neobrutalist boldness (hard edges, bold type, high contrast, confident color) + restrained liquid-glass (translucent blurred surfaces, hairline borders, layered depth) + scroll motion. No `feral-*` dependencies except the two landing-scoped physics accents explicitly un-banned in §12 — `pullcord` (theme toggle) and `feral-blob` (JellyBlobMascot) — both fun accents, never the main character.

## 2. Layout & Hierarchy per Section

Page structure (top → bottom): **scroll hairline → glass header → hero → capability strip → backtest section → bot/Telegram section → footer CTA → minimal footer**.

Container: `mx-auto w-full max-w-6xl px-6 lg:px-8`. Section rhythm: `py-24 lg:py-32`, more space above a heading than below it.

### 2.0 Scroll hairline
Fixed at the very top: `fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-[#ffd02f]` — width driven by page scroll (scaleX). The single raw-yellow page marker. In reduced motion it stays at full width and fades out.

### 2.1 Glass header (sticky)
`sticky top-0 z-40 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl`. Height `h-14`.
- **Left:** logo mark (reuse the app's existing logo image, `size-6`, `aria-hidden`) + wordmark **"Pine Framework"** `text-sm font-semibold tracking-tight text-[#ffd02f]` (landing-owned wordmark uses the brand yellow; the TopBar's existing `text-[#eab308]` wordmark stays untouched).
- **Right:** PullCord theme toggle (landing-only light/dark switch, §13) then compact Get Started — `h-10 px-4` version of the CTA (see §7). Same `enterApp` handler as the hero CTA.

### 2.2 Hero — the thesis (first viewport, `min-h-[calc(100svh-3.5rem)]`)
Grid: `grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]`, `py-20 lg:py-28`.

**Left column (reading order 1):**
- **Headline** (the mechanism in one line — copy direction, UX Designer owns final copy): *"Write it in PineScript. Trade it live."* `text-5xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl`. No eyebrow, no kicker — the headline carries the hero alone (craft floor).
- **Lede:** `mt-6 max-w-xl text-lg text-foreground/70` — one sentence: backtest PineScript strategies, run them on a live bot, steer from Telegram, all in one terminal. Body measure ≤ 70ch.
- **Action row:** `mt-10 flex flex-wrap items-center gap-4` — the primary **Get Started** CTA (large, §7) + optional ghost anchor *"See how it works"* `scroll-mt-24` linking to §2.4 (`text-sm font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline`). The ghost anchor is optional — Get Started alone is sufficient per spec.

**Right column (reading order 2) — the hero demo panel** (the proof, first viewport):
Elevated glass (§3, ELEVATED) + a mini-chart inside: a real SVG line/area series with a faint chart grid (`stroke-white/10` grid lines are legitimate — there is a chart under them), a single brand-blue series stroke (`#4262ff`), and a row of **three stat tiles**: `rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2` — e.g. Backtest P&L `+12.4%` (yellow numeral), Win rate `61%`, Max drawdown `−4.2%`. All demo data is **synthetic**: a `text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/40` tag **"SYNTHETIC DEMO"** sits in the panel corner (product principle: every claim is true; demonstrations are labeled).
- Panel entrance is the page's *authored motion moment* (§8 — hero stagger).

### 2.3 Capability strip (raw proof, one line)
Full-width row under the hero: `flex flex-wrap items-center gap-3`. Four raw chips — **PineScript · Backtest · Live Bot · Telegram** — each: `inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80` with a yellow square bullet `inline-block size-1.5 rounded-[2px] bg-[#ffd02f]` (the neobrutalist "raw" marker; no backdrop blur — cheap surface). This strip replaces the lazy icon-card grid.

### 2.4 Section A — Backtest (content + glass demo)
Two-column: `grid grid-cols-1 items-center gap-12 lg:grid-cols-2`, `py-24 lg:py-32`.
- **Left copy:** section heading *"Backtest before you deploy."* `text-3xl font-bold tracking-[-0.02em] sm:text-4xl`; lede `mt-4 max-w-lg text-base text-foreground/70`; inline capability chips (same chip recipe as §2.3, `mt-6`) — *Historical backtests · Parameter optimization · Strategy conflict detection* (all real capabilities).
- **Right panel:** glass panel (§3, STANDARD) containing a synthetic **equity curve** SVG (rising line over the faint grid) + a small stat row. Labeled `SYNTHETIC DEMO`. Reveals on scroll (§8).

### 2.5 Section B — Bot + Telegram (content + glass demo, reversed)
Two-column reversed: `grid grid-cols-1 items-center gap-12 lg:grid-cols-2`, `py-24 lg:py-32`.
- **Right copy:** *"Deploy it. Steer it from Telegram."* — same heading/lede scale as §2.4.
- **Left panel:** glass panel (STANDARD) that *echoes the real TopBar*: green StatusDot (`bg-[#22c55e]`) + `Bot: running` + a compact metric list (`trades`, `P&L`, `errors`) + a Telegram message-bubble mock (`rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2`). Product truth: this is what the app actually shows.

### 2.6 Footer CTA (the close)
`py-24 lg:py-32`. One centered elevated glass panel (§3, ELEVATED, `rounded-2xl`): heading *"Ready to put your strategy to work."* `text-3xl font-bold tracking-[-0.02em] sm:text-4xl`, lede `text-foreground/70`, and a large **Get Started** (`h-12 px-8`). The footer CTA is the second (and final) hard-shadow yellow artifact — the page ends anchored by the same single action it opened with.

### 2.7 Minimal footer
`border-t border-white/[0.06] py-8`: **Pine Framework** wordmark (brand yellow) + `text-xs text-foreground/50` tagline *"Self-hosted PineScript trading."* No fabricated links, prices, or claims. Nothing in the footer is interactive unless it becomes real.

## 3. Glass Surface Recipe (exact Tailwind classes)

Elevation is declared once per surface: **hairline border** for standard glass; **border + restrained ambient shadow** only for the two big showpieces (hero demo, footer CTA). Shadows carry an offset + blur — no zero-offset halos on their own.

**STANDARD glass** (backtest panel, bot panel, feature cards, stat tiles):
```
rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md
```
- Feature chips / stat tiles / bubbles (no blur — they sit on the flat wash): `border border-white/[0.06] bg-white/[0.02] rounded-lg`.

**ELEVATED glass** (hero demo panel, footer CTA):
```
rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl
shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7),0_0_80px_-24px_rgba(255,208,47,0.2)]
```
- The amber glow rides *with* the offset ambient shadow — it is the brand moment, never decoration on its own.

**Inner top highlight** (elevated panels only): an absolutely-positioned `pointer-events-none` overlay `bg-gradient-to-b from-white/[0.06] to-transparent` covering the top 40%. One highlight per panel.

**Ambient wash** (page ground, one fixed layer behind everything — not a surface):
```
fixed inset-0 -z-10 bg-background
bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,208,47,0.08),transparent_60%),radial-gradient(90%_60%_at_85%_110%,rgba(66,98,255,0.06),transparent_60%)]
```
No repeating stripes or page-wide grids — those are reserved for the actual chart surfaces inside the demo panels.

**Surface count (perf budget):** exactly **5** backdrop-blurred surfaces (header, hero demo, backtest panel, bot panel, footer CTA) + non-blur chips. No animated blur, restrained radii (`md` = 12px for content, `xl` = 24px only on the 3 hero/footer-grade surfaces), Safari-correct.

## 4. Typography Scale (Inter only — pinned)

| Role | Classes | Notes |
|---|---|---|
| Hero display | `text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-[-0.03em]` | Max 4.5rem — under the 6rem floor |
| Section heading | `text-3xl sm:text-4xl font-bold tracking-[-0.02em]` | |
| Lede | `mt-6 max-w-xl text-lg text-foreground/70` | ≤70ch measure |
| Body | `text-base text-foreground/70` | |
| Raw chip | `text-[11px] font-semibold uppercase tracking-[0.14em]` | The neobrutalist voice — labels are content, never eyebrows above headings |
| Meta / demo tag | `text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/40` | "SYNTHETIC DEMO" |
| Footer | `text-xs text-foreground/50` | |

No mono face — "technical" is carried by Inter's weight and tracking, not costume (craft floor).

## 5. Color Usage — Brand Yellow Roles

Dark ground: `bg-background` (`oklch(0.145 0 0)`). Foreground hierarchy: `text-foreground` → `text-foreground/70` → `text-foreground/40`. Hairlines: `border-white/[0.06–0.15]` (glass hairlines are white-alpha; the app's hex hairline tokens stay untouched in the panel).

**Yellow `#ffd02f` is the only accent and owns exactly five roles — never more than ~10% of the surface:**
1. **Primary CTA** (`#ffd02f` fill, dark ink text) — the action of the page.
2. **Hard shadow / press** — the CTA's `3px_3px_0 rgba(0,0,0,0.5)` offset (the one earned brutalist artifact; this world IS neobrutalist).
3. **Glow** — the amber ambient shadow on elevated panels + the wash's top radial.
4. **Chip bullets + scroll hairline** — the raw markers.
5. **Emphasis numerals** on demo panels (hero P&L stat).
- **Blue `#4262ff`** appears only *inside* demo panels (chart series, info accents) — a data color, not a UI accent.
- **Green `#22c55e`** only for the bot StatusDot (product truth, echoes TopBar).
- Contrast: `#ffd02f` on `#0d0d18`-class ground ≈ 13:1; `#1c1c1e` ink on `#ffd02f` ≈ 12:1; `text-foreground/70` on background passes AA for body. All specified pairs meet WCAG AA.

## 6. Component States

### Get Started (primary CTA — hero large `h-12 px-6`, header compact `h-10 px-4`, footer `h-12 px-8`)
Base: `inline-flex items-center justify-center gap-2 rounded-lg bg-[#ffd02f] text-sm font-semibold text-[#1c1c1e] transition-[transform,box-shadow,background-color] duration-fast ease-enter shadow-[3px_3px_0_rgba(0,0,0,0.5)]`
- **Hover:** `hover:-translate-y-0.5 hover:bg-[#fcb900] hover:shadow-[4px_4px_0_rgba(0,0,0,0.5)]` — lift + warm yellow (`#fcb900` = existing yellowHover token).
- **Active:** `active:translate-y-0 active:shadow-[1px_1px_0_rgba(0,0,0,0.5)]` — shadow collapses into the button = press. (`#d49c00` = yellowActive token if the fill must shift; press reads via shadow collapse, fill shift optional.)
- **Focus-visible:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
- **Disabled:** inherited shadcn `disabled:pointer-events-none disabled:opacity-50` (not used in practice).

### About (TopBar — owned by shell, state spec only)
shadcn `ghost` variant (existing class), `text-sm`, sits in the existing right spacer `min-w-[160px]`. Hover `hover:bg-white/5`, focus ring inherited (`ring-ring`). Click → `showLanding()` (clears the persisted flag first — D2). Do **not** restyle; the shell's language is untouched.

### Logo / name click target (TopBar)
Wrap the existing logo + wordmark in a `<button type="button" aria-label="Pine Framework — back to landing">` (not `<a>` — no router):
`flex h-full items-center gap-2 rounded-md px-2 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring`. Header is `h-12` → hit area ≥44px. The wordmark itself (`text-sm font-semibold text-[#eab308]`) is untouched.

### Glass cards / panels
Default per §3; **hover:** `hover:border-white/20 hover:bg-white/[0.05] transition-colors duration-base` (fill shift only — no lift, no toy physics). Panels are content, not buttons; no focus needed unless interactive (the demo panels are `aria-hidden` decoration — decorative synthetic data must not be focusable or read by AT; the *copy* communicates the capability).

### Ghost anchor (optional, §2.2)
`text-sm font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70 rounded`.

## 7. Motion Mapping (LAW — exactly 3 durations / 2 easings from `theme/motion.ts`)

framer-motion values are **derived from the tokens, never new tokens**:
`DUR_FAST = 0.15, DUR_BASE = 0.2, DUR_SLOW = 0.25` · `EASE_ENTER = [0.16, 1, 0.3, 1]` · `EASE_EXIT = [0.3, 0, 0.8, 0.15]`.

| Moment | Property | Duration | Easing | Token |
|---|---|---|---|---|
| Hero entrance — headline, lede, CTA, demo panel (the one authored moment; stagger `stepMs: 40`, cap `maxOffsetMs: 100`) | opacity 0→1, y 24→0 | 200ms | enter | `duration-base` + `ease-enter` |
| Scroll reveal — section A & B panels, headings | opacity 0→1, y 16→0 | 250ms | enter | `duration-slow` + `ease-enter` |
| Footer CTA entrance | opacity 0→1, scale 0.98→1 | 250ms | enter | `duration-slow` + `ease-enter` |
| CTA hover lift / shadow grow | transform + shadow | 150ms | enter | `duration-fast` + `ease-enter` |
| CTA active press | transform + shadow collapse | 150ms | exit | `duration-fast` + `ease-exit` |
| Glass card hover (border/fill) | color only | 200ms | enter | `duration-base` + `ease-enter` |
| Scroll hairline width | scaleX | 250ms | enter | `duration-slow` + `ease-enter` |
| Parallax — demo panels drift against scroll (hero ±24px, sections ±16px) | y translate, scroll-linked (`useScroll` → `useTransform`), spring settle | 250ms | enter | `duration-slow` + `ease-enter` |
| Scroll-scrub reveal — capability strip, §2.4/§2.5 panels + headings | opacity 0→1, y 16→0, scrubbed to scroll progress | 250ms | enter | `duration-slow` + `ease-enter` |
| Magnetic CTA — Get Started (hero, header, footer) | translate toward pointer, **clamp ±4px** | 150ms | enter | `duration-fast` + `ease-enter` |
| 3D tilt — demo panels (hero, backtest, bot, footer) | rotateX/rotateY, **clamp ≤6°**, `transform-style: preserve-3d` | 200ms | enter | `duration-base` + `ease-enter` |
| whileHover glass micro-upgrade — glass panels/cards | scale ~1.01 + border/fill shift (no lift, no toy physics) | 200ms | enter | `duration-base` + `ease-enter` |
| Hologram foil — pointer-following sheen on elevated panels | sheen position follows pointer, opacity 0→**≤0.15** | 150ms | enter | `duration-fast` + `ease-enter` |

**One authored moment, not scattered effects:** the hero stagger is the entrance; all scroll reveals share one quiet fade-rise grammar (`y: 16`, `once: true`, `viewport={{ once: true, amount: 0.2 }}`). No animated blur, no per-element novelty. The advanced rows above extend this grammar on the landing only — gated to `pointer: fine` + full-motion (§8), clamped by the hard caps in the table, and mapped to the three existing durations and two easings; no new motion tokens anywhere (§7 LAW). Content is visible by default; transforms never hide critical copy while waiting.

## 8. Reduced-Motion Fallback

- Wrap the landing in `MotionConfig reducedMotion="user"`; framer-motion then auto-collapses transform/opacity animation for `prefers-reduced-motion` users. Reveals render at their final state (no scroll-triggered movement, no stagger).
- The global CSS guard in `src/main.css` (`@media (prefers-reduced-motion: reduce)`) already zeroes every CSS transition/animation — the CTA's transform/shadow transitions and the scroll hairline's CSS motion collapse to instant.
- Scroll hairline: under reduced motion render full-width, static, and fade out after entry — no scroll-linked scaleX.
- Advanced effects (§7): parallax, scroll-scrub, magnetic, 3D tilt, hologram foil, and whileHover glass all collapse to static under `MotionConfig reducedMotion="user"` + the global CSS guard — parallax/tilt/foil render at rest (no transform, no sheen), scroll-scrub reveals render at their final state, the magnetic clamp zeroes.
- PullCord toggle: rope physics disabled under reduced motion — renders as an instant plain-button switch (the toggle still works; no animation).
- JellyBlobMascot: static under reduced motion (idle physics off).
- No new motion tokens are introduced anywhere (spec requirement).

## 9. Responsive

- **Mobile (< lg):** single column; hero stacks copy-then-panel; demo panel remains on first viewport (compressed — it is the proof); capability chips wrap; section grids stack with copy above panel; footer CTA full-width panel.
- **Desktop (≥ lg):** hero grid `[1.05fr_0.95fr]`; section grids `grid-cols-2`, section B reversed; `max-w-6xl` container.
- Headline scales `text-5xl → lg:text-7xl`; touch targets stay ≥44px (`h-10/h-12`); container padding `px-6 lg:px-8`.
- Reflow is stacking, never squeezing — no horizontal scroll at any breakpoint ≥ 320px.

## 10. Accessibility

- Contrast: all specified pairs ≥ AA (verified §5); yellow CTA + dark ink exceeds AAA for the large button label.
- Focus-visible rings on every interactive element (yellow ring on dark).
- Demo panels and synthetic data are `aria-hidden="true"` decoration (the copy carries the meaning); interactive elements carry `aria-label`s (logo target, icon-only controls).
- Keyboard-operable: Get Started, About, logo/name target, and the PullCord toggle (`role="switch"`, `aria-label="Toggle theme"`, `aria-checked` bound to landing theme) are real buttons; the optional ghost anchor is a real anchor.
- PullCord toggle focus-visible: `focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70 focus-visible:ring-offset-2` (ring offset maps to the active theme's background via the §13 light scope).
- Demo charts stay `aria-hidden="true"` — recharts hover reactivity (tooltips, active/highlight, crosshair) is pointer-only and never a keyboard/focus target; the copy carries the capability.
- pointer:fine gating: magnetic CTA, 3D tilt, and hologram foil activate only under `@media (pointer: fine)`; touch devices get static elements (tap = normal CTA press, panels flat).
- Reduced motion (§8) and 44px touch targets.
- Semantic landmarks: `header`, `main`, `section`, `footer`; heading order starts at `h1` (hero) and descends.

## 11. Browser Surfaces (theme the parts the layout didn't draw)

- **Text selection:** `selection:bg-[#ffd02f]/30 selection:text-foreground`.
- **Caret:** accent-color `#ffd02f` on any inputs the landing touches.
- **Scrollbar:** thin, dark — `scrollbar-width: thin` with a `white/10` thumb over the panel background (the app's existing scrollbar style carries over).
- **Focus rings:** the yellow ring (not the default ring-ring) on the landing's own interactive elements; the TopBar keeps the shell's existing ring.

## 12. Handoff Notes for the Frontend Engineer

- Implement with Tailwind v4 classes exactly as specced; no new CSS utilities, no glass library, no gamey/tool `feral-*` packages beyond the two un-banned below, no new motion tokens.
- **Un-banned on the landing (packages):** `pullcord` (PullCord Verlet-rope physics toggle — the landing-only light/dark switch, §13), `feral-blob` (JellyBlobMascot — playful accent beside the bot panel, §2.5), and `recharts`/shadcn interactive charts inside the demo panels (hover-reactive tooltips, active/highlight, crosshair).
- **Stays banned:** `playcaptcha`, `animaps`, `deskfolio`, `feral-fur` (gamey/tool-like — not this surface). No other `feral-*` or animation packages.
- **Hologram restraint clause:** the foil-card hologram is hand-rolled with framer-motion (the npm hologram demo is not installed and is not wanted) — a restrained pointer-following sheen, opacity ≤0.15, a material whisper never a disco.
- **Accent physics budget:** the FeralUI physics components are the fun accent, not the main character — exactly one physics toggle + one mascot, both landing-only, both reduced-motion-collapsible (§8), both `aria-hidden` where decorative.
- framer-motion: import only the `motion` primitives used; `MotionConfig reducedMotion="user"`; viewport `once: true`.
- The landing is presentational (`LandingPage` receives `onGetStarted`); the glass class recipes live with the Landing components (design-system extraction deferred).
- Copy in this document is direction; the UX Designer owns final copy. Synthetic demo data must remain labeled.
- The main panel's visual language is untouched — these rules govern the Landing surface only.

## 13. Day Session — Light Variant (Landing-Only)

The landing gains a day state of the same instrument: same composition, same hierarchy, same single yellow action — surface recipes re-mapped for daylight. Scene: the same trader at the same terminal, ambient daylight. Light is forced by the scene, never picked by category.

**Scope (law):** the light variant applies to the LANDING ONLY. The main panel stays dark (`color-scheme: dark`, `bg-background`) — §1–§12 and the dark Feral Glass contract govern the default and the panel untouched. Implement the light scope as one `.light` class (or `light:` variant) on the landing root that remaps `--background`/`--foreground`; all semantic classes (`text-foreground`, hairlines, chips) then re-map without class soup. The light mode must read as a premium fintech light mode, not a toy.

### 13.1 Light token table

| Token (light) | Value | Dark twin (§3/§5) | Role |
|---|---|---|---|
| Page ground | `bg-[#f6f4ee]` — warm paper-stone, **not white-wash** | `bg-background` `oklch(0.145 0 0)` | Landing background (`--background` remap) |
| Ink (foreground) | `text-[#1c1c1e]` (existing dark-ink token) | `text-foreground` | All text; hierarchy `text-[#1c1c1e]` → `/70` → `/50` (meta raised from `/40` — light ground needs the step for AA) |
| Standard glass fill | `bg-white/60` | `bg-white/[0.04]` | STANDARD glass (§3 remap) |
| Elevated glass fill | `bg-white/70` | `bg-white/[0.04]` | ELEVATED glass |
| Chip/stat/bubble fill | `bg-white/40` | `bg-white/[0.02]` | Non-blur surfaces |
| Hairlines | `border-black/[0.06]` standard, `border-black/[0.08]` elevated | `border-white/[0.06–0.15]` | Dark hairlines replace white on light |
| Accent text | `text-[#a16207]` (deepened brand amber) | `text-[#ffd02f]` | Wordmark, emphasis numerals — brand family, AA on light (yellow text fails on light) |
| Accent surfaces | `#ffd02f` fill + `#1c1c1e` ink (unchanged, 12:1 §5) | same | CTA fill, glow, chip bullets, scroll hairline |
| Data colors | `#4262ff` strokes, `#22c55e` status (unchanged) | same | Charts, StatusDot |

### 13.2 Light glass remap (exact classes)

**STANDARD glass:** `rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-sm`

**Chips / stat tiles / bubbles:** `rounded-lg border border-black/[0.06] bg-white/40`

**ELEVATED glass:** `rounded-2xl border border-black/[0.08] bg-white/70 backdrop-blur-md shadow-[0_24px_64px_-24px_rgba(28,29,30,0.18),0_0_80px_-24px_rgba(255,208,47,0.15)]`

- Blur is lighter than dark (sm/md vs md/xl) — daylight needs less frosted separation; surface count stays 5 (perf budget §3).
- Inner top highlight (elevated only): `bg-gradient-to-b from-white/70 to-transparent` top 40% (white sheen reads on light glass), `pointer-events-none`.
- Ambient wash (same structure, chroma raised so it survives daylight): `fixed inset-0 -z-10 bg-[#f6f4ee] bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,208,47,0.12),transparent_60%),radial-gradient(90%_60%_at_85%_110%,rgba(66,98,255,0.08),transparent_60%)]`
- CTA hard shadow softens for daylight: `shadow-[3px_3px_0_rgba(28,29,30,0.35)]` (same brutalist collapse on press; hover/active fills unchanged `#fcb900`/`#d49c00`).
- Browser surfaces: `selection:bg-[#ffd02f]/40 selection:text-[#1c1c1e]`, caret `accent-color:#a16207`, thin scrollbar with a `black/10` thumb.

### 13.3 PullCord integration point

- **Where:** the glass header (§2.1), between the logo/wordmark cluster and the compact Get Started — the second control from the right. Compact icon button (`size-9 rounded-md`), hover `hover:bg-white/5` in dark / `hover:bg-black/[0.04]` in light.
- **Component:** `pullcord` PullCord Verlet-rope physics toggle, landing-only; `aria-label="Toggle theme"`, `role="switch"`, `aria-checked` bound to landing theme state; a real button (keyboard-operable, §10).
- **Reduced motion:** rope physics disabled — renders as an instant plain-button switch (§8).
- **Persistence:** landing theme persisted in `localStorage` (`pine-landing-theme`) so refresh restores the choice; the main panel always opens dark regardless (scope §13.1).
- **Accent physics budget:** one physics toggle + one mascot (`feral-blob` JellyBlobMascot beside the bot panel, `size-14`, `aria-hidden`, static under reduced motion) — the fun accent, never the main character; the night-trader instrument stays the product's own voice (§1).
