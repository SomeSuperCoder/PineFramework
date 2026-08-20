# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Algorithmic and semi-automated traders who write PineScript strategies and run them on a self-hosted bot. Primary user is at a desktop terminal — often overnight sessions — monitoring a live bot, reviewing backtests, and controlling the bot remotely from Telegram. Secondary user: a first-time visitor who has not entered the app yet and must understand what the product is and how to enter in seconds.

## Product Purpose

Pine Framework is a self-hosted trading bot control panel. A user writes a PineScript strategy, backtests it against historical data, deploys it to a live bot, and monitors performance on a dashboard — all inside one dark, dense, terminal-grade interface. Success for the product is a strategy authored, proven by backtest, and run live with confidence. Success for the landing surface is a first-time visitor understanding what the product does and clicking **Get Started** to enter the panel.

## Positioning

PineScript-native trading automation in one self-hosted panel: write the strategy, backtest it, run it live, and steer it from Telegram — without leaving the same terminal surface. The mechanism a neighboring dashboard could not copy is the single workflow — PineScript authoring → backtest → live bot → Telegram control — rendered as one coherent instrument panel.

## Operating Context

Desktop-first web application (React 18 + Vite + Tailwind v4 + shadcn/ui), no router — navigation is a view/panel state machine. The main panel is composed of TopBar, Sidebar, and a content area that switches between dashboard/chart, bot control (LiveDashboard), Telegram configuration, and backtest panels; overlays (code editor, strategy results, conflict dialogs) mount above. The landing page is a new additive view gated by a persisted flag (`pine-landing-entered` in localStorage): first open shows the landing, Get Started persists the flag and enters the panel, About / logo / name clicks clear the flag and return to the landing.

## Capabilities and Constraints

**Capabilities (real, verified in code):** live bot dashboard with status + error console; chart component; PineScript strategy editor with conflict detection; strategy backtesting panel; Telegram bot configuration; bot control (start/stop/pause).

**Constraints (verified):**
- Theme: dark oklch palette, brand yellow `#ffd02f` accent, Inter font family (tokens at `src/theme/tokens.ts`; shadcn theme in `src/main.css`).
- Motion LAW: exactly 3 durations (fast 150ms / base 200ms / slow 250ms) and 2 easings (enter / exit) from `src/theme/motion.ts`; mirrored CSS tokens `duration-fast/base/slow` + `ease-enter/exit`; no new motion tokens allowed.
- Tailwind v4 + shadcn primitives only; liquid-glass built from Tailwind primitives (backdrop-blur, translucent fills, hairline borders, gradient overlays, soft shadows, brand glows), restrained blur radii for performance and Safari correctness.
- framer-motion permitted for scroll reveal only (viewport-triggered, `once: true`); import only the `motion` primitives used.
- Global reduced-motion guard in `src/main.css`; scroll animations must respect `prefers-reduced-motion`.
- Landing surface count kept small for performance (few large glass surfaces, no animated blur).
- **FeralUI is an in-house design language name, not a dependency.** `feral-blob` / `feral-fur` / `feralui` packages are NOT installed and must not be referenced as a library.

## Brand Commitments

- Name: **Pine Framework** (wordmark in the TopBar; landing may use it).
- Voice: professional, confident, technical — premium trading instrument, not a toy. Copy names actions and states plainly.
- Design language commitment: **FeralUI** — raw/neobrutalist boldness (hard edges, bold type, high contrast, confident color) + restrained liquid-glass (translucent blurred surfaces, hairline borders, layered depth) + scroll motion.
- Identity assets: existing logo image in TopBar (`public/`), brand yellow `#ffd02f` (hover `#fcb900`, active `#d49c00`), Inter.

## Evidence on Hand

- Real feature set and UI structure verified in `frontend/src` (ControlPanel, TopBar, Sidebar, panels, overlays) and documented in openspec change `landing-page-and-nav-flow`.
- **No marketing copy, no testimonials, no customer logos, no pricing, no benchmark claims exist.** These must not be fabricated. Any demonstration data (sample chart series, backtest curves, bot metrics) is design material and must be labeled synthetic.
- The product's real capabilities (PineScript backtest, live bot, Telegram) are the only honest proof available to the landing.

## Product Principles

1. **Prove, don't claim.** The landing demonstrates the actual product (chart, backtest curve, bot status) through its glass surfaces rather than restating features in words.
2. **One visual language everywhere.** The landing is the same instrument as the panel — dark oklch, brand yellow, Inter, same tokens; only the surface expression differs.
3. **Performance is part of the design.** Few glass surfaces, restrained blur, no animated blur, no new motion tokens — the landing stays light.
4. **Motion is meaningful and law-abiding.** Scroll reveal and entrances map exactly onto the motion tokens; reduced motion is respected globally.
5. **Every claim is true.** Synthetic demonstrations are labeled; no invented customers, metrics, or capabilities.

## Accessibility & Inclusion

- Global reduced-motion guard exists in `src/main.css`; the landing adds framer-motion's reduced-motion handling so reveals degrade to static content.
- Focus-visible rings, keyboard-operable buttons (Get Started, About, logo/name target), adequate contrast (yellow `#ffd02f` on dark ground and dark ink on yellow both exceed WCAG AA).
- Touch targets at least 44px (h-11/h-12 controls).
