# Migration Report: Legacy Spec System → OpenSpec

**Date**: 2026-07-21
**Source Files**: requirements.md, design.md, tasks.md
**Target**: openspec/ (config.yaml + specs/ + docs/ + changes/)

## Summary

- **48** capability specs created from **49** legacy requirements
- **1** architecture document created
- **1** migration change proposal created
- **0** requirements lost
- **0** legacy files deleted (preserved for review)

## Migrated Requirements

| # | Requirement | Target Spec | Status |
|---|------------|-------------|--------|
| R1 | Dynamic Version Detection + Pine Script Parsing + Compiler Validation | `specs/language-parser/spec.md` | ✓ |
| R2 | Primitive Type System + Series/Collections + NA Semantics + Type Qualifier + UDTs + Method Dispatch | `specs/type-system/spec.md` | ✓ |
| R3 | Bar-by-bar Execution + Execution Results + Named Args + Var/Varip + Realtime + Builtins + Comparisons + Compound Assignment + Const + Switch | `specs/execution-engine/spec.md` | ✓ |
| R4 | TA Functions (all moving averages, oscillators, volatility, volume, statistics, cross detection, pivots, math) | `specs/ta-functions/spec.md` | ✓ |
| R5 | Multi-Symbol Data Access (request.security, request.security_lower_tf, financial) | `specs/multi-symbol-data/spec.md` | ✓ |
| R6 | Plot Functions (plot, plotshape, plotchar, plotarrow, fill, barcolor, bgcolor, hline, overlay, dynamic titles, per-bar colors) | `specs/plotting-visualization/spec.md` | ✓ |
| R7 | Drawing Objects (line, label, box, table, polyline with all create/set/delete methods) | `specs/drawing-objects/spec.md` | ✓ |
| R8 | Strategy Mode (entry/exit/close/cancel, risk, pyramiding, backtest metrics, partial exit, ID auto-generation, size defaults) | `specs/strategy-execution/spec.md` | ✓ |
| R9 | Extensibility (library import, custom library development, export) | `specs/extensibility/spec.md` | ✓ |
| R10 | Performance (benchmarks for parse/compile/execution, memory efficiency, batch compilation, concurrent instruments) | `specs/performance-scalability/spec.md` | ✓ |
| R11 | Testing (regression test suite, TradingView compatibility, fixture framework) | `specs/testing-compatibility/spec.md` | ✓ |
| R12 | Input Configuration (input() with all parameters: int, float, bool, string, color, source, symbol, session, timeframe, time) | `specs/input-configuration/spec.md` | ✓ |
| R13 | String + Time Functions (str.*, char.*, timestamp, time component extraction) | `specs/string-time-functions/spec.md` | ✓ |
| R14 | Alert System (alert, alertcondition, frequency management, message templates) | `specs/alert-system/spec.md` | ✓ |
| R15 | Color System (constants, manipulation, accessors, mixing) | `specs/color-system/spec.md` | ✓ |
| R16 | Script Declaration (indicator() parameters, explicit_plot_zorder) | `specs/script-declaration/spec.md` | ✓ |
| R17 | React Frontend Application (SPA, routing, tab management, backend integration) | `specs/frontend-application/spec.md` | ✓ |
| R18 | Monorepo Package Structure (pnpm workspaces, shared types, dependency management) | `specs/monorepo-structure/spec.md` | ✓ |
| R19 | Backend API Server (Express REST + WebSocket, script execution) | `specs/backend-api-server/spec.md` | ✓ |
| R20 | Bybit Data Integration (WebSocket market data, REST historical, account operations) | `specs/bybit-integration/spec.md` | ✓ |
| R21 | Canvas Charting Library (HTML5 Canvas, chart types, optimizations, WebGL) | `specs/canvas-charting-library/spec.md` | ✓ |
| R22 | Strategy Backtest Engine (historical backtest, metrics, trade logging) | `specs/strategy-backtest-engine/spec.md` | ✓ |
| R23 | Telegram Notification Integration (bot signals, error notifications, customization) | `specs/telegram-notification/spec.md` | ✓ |
| R24 | Script Bank Management (storage, categories, search) | `specs/script-bank-management/spec.md` | ✓ |
| R25 | Unified Script Editor (syntax highlighting, autocomplete, error highlighting, multi-tab, rename) | `specs/unified-script-editor/spec.md` | ✓ |
| R26 | AI Agent Integration (code generation, modification, conversation history, versioning) | `specs/ai-agent-integration/spec.md` | ✓ |
| R27 | File-Based Storage (scripts, settings, chart layouts as readable files) | `specs/file-based-storage/spec.md` | ✓ |
| R29 | Separate Indicator Panes (non-overlay panes, synchronized crosshair/X-axis, resizing) | `specs/separate-indicator-panes/spec.md` | ✓ |
| R30 | Dynamic Indicator Management UI (add/remove/reorder/configure indicators) | `specs/dynamic-indicator-management-ui/spec.md` | ✓ |
| R31 | Multi-Version Script Support (v5 and v6 simultaneously) | `specs/multi-version-support/spec.md` | ✓ |
| R32 | Progressive Indicator Computation (visible range first, background computation) | `specs/progressive-computation/spec.md` | ✓ |
| R33 | Time-Based Bar Rendering (timestamp positioning, gap handling, session breaks) | `specs/time-based-rendering/spec.md` | ✓ |
| R34 | Dark Theme UI (dark theme for chart, editor, panels) | `specs/dark-theme/spec.md` | ✓ |
| R35 | Auto-Scale Toggle (per-pane auto-scale, manual override) | `specs/auto-scale-toggle/spec.md` | ✓ |
| R36 | Scroll Re-Execution (re-execute on scroll, cached regions) | `specs/scroll-re-execution/spec.md` | ✓ |
| R37 | Lowercase Type Keywords (int, float, bool, string, color, line, label, box, etc.) | `specs/parser-lowercase-types/spec.md` | ✓ |
| R38 | Built-in Test Indicators (test indicator library with categories) | `specs/builtin-test-indicators/spec.md` | ✓ |
| R39 | Forming Candle Lifecycle (live candle re-evaluation, bar confirmation) | `specs/forming-candle-lifecycle/spec.md` | ✓ |
| R40 | Index-Based Bar Rendering (bar_index positioning) | `specs/index-based-rendering/spec.md` | ✓ |
| R41 | Forming Candle Colors (distinct color for live candle, transition on confirmation) | `specs/forming-candle-colors/spec.md` | ✓ |
| R42 | Quick Indicator Adder (Ctrl+K fuzzy-search, one-click add) | `specs/quick-indicator-adder/spec.md` | ✓ |
| R43 | CLI Backtest Tool (command-line strategy backtest with options) | `specs/cli-backtest-tool/spec.md` | ✓ |
| R44 | Chart Viewport Autofit (reset zoom/pan to fit all data) | `specs/chart-viewport-autofit/spec.md` | ✓ |
| R45 | Time Module (display modes, session visibility, custom ranges) | `specs/time-module/spec.md` | ✓ |
| R46 | Go To Date (date picker, navigate to specific timestamp) | `specs/go-to-date/spec.md` | ✓ |
| R47 | Error Console (dedicated panel with compilation/runtime errors, script output) | `specs/error-console/spec.md` | ✓ |
| R48 | Single Strategy Enforcement (one strategy per script, strategy+indicator conflict) | `specs/single-strategy-enforcement/spec.md` | ✓ |
| R49 | Footer Bar (symbol, timeframe, bar index, cursor OHLC display) | `specs/footer-bar/spec.md` | ✓ |

## Architecture Documentation

| Document | Source | Target |
|----------|--------|--------|
| System Architecture | `design.md` (sections 1-86) | `openspec/docs/architecture/system-architecture.md` |

## Design Details Not Represented in Requirements

The following design details from `design.md` exist as implementation/architecture notes but were NOT in the numbered requirements. They are captured in `openspec/docs/architecture/system-architecture.md` and/or the relevant spec files:

- `FormingCandleManager` lifecycle delegation (design.md §1713-1777) → captured in `execution-engine/spec.md` forming-candle scenarios + `docs/architecture/`
- Three-layer alert dedup (design.md §483-508) → captured in `alert-system/spec.md`
- Canvas rendering layers (design.md §866-944) → captured in `canvas-charting-library/spec.md` + `docs/architecture/`
- Plot precedence/z-order (design.md §146-148) → captured in `plotting-visualization/spec.md`
- Index-based vs time-based rendering rationale (design.md §1696-1712) → `index-based-rendering/spec.md`
- Progressive computation batch queue (design.md §1608-1695) → `progressive-computation/spec.md`
- Race condition fix for chart viewport (design.md §1778-1838) → `chart-viewport-autofit/spec.md`
- Indicator pane labels + overlay labels UI (design.md §1559-1606) → `separate-indicator-panes/spec.md` + `dynamic-indicator-management-ui/spec.md`
- Auto-scale toggle architecture (design.md §1861-1891) → `auto-scale-toggle/spec.md`
- Scroll boundary recomputation (design.md §1893-1926) → `scroll-re-execution/spec.md`
- SOCKS5 proxy for Telegram (design.md §497-508) → `telegram-notification/spec.md`
- `FormingCandleManager` diff order fix (design.md §1760-1776) → `forming-candle-lifecycle/spec.md`
- Strategy backtest metrics computation (design.md §612-619) → `strategy-backtest-engine/spec.md`
- Commission calculation interface (design.md §439-445) → `strategy-execution/spec.md`
- Database layer (design.md §709-723) — not separately required, stored in architecture docs
- Plugin system design (design.md §945-1000) — not separately required, stored in architecture docs
- Security considerations (design.md §1264-1283) — not separately required, stored in architecture docs
- Error handling/recovery (design.md §1058-1118) — not separately required, stored in architecture docs

## Tasks Not Migrated

The legacy `tasks.md` (2847+ lines) was NOT migrated to OpenSpec. Rationale:
- OpenSpec task format differs significantly from the legacy checklist format
- Tasks.md contains detailed implementation progress (checkboxes, sections, sub-tasks)
- Much of tasks.md tracks done/not-done state that would need manual reconciliation
- **Recommendation**: Review tasks.md and selectively migrate remaining work items into the new change system

## Legacy File Status

| File | Status | Action Required |
|------|--------|----------------|
| `requirements.md` | **Preserved** | Review → approve deletion |
| `design.md` | **Preserved** | Review → approve deletion |
| `tasks.md` | **Preserved** | Review → selective migration → approve deletion |

**⚠️ No legacy files have been deleted.** All three files remain in place pending your review.

## New OpenSpec Structure

```
openspec/
├── config.yaml                           ← Updated with project context
├── docs/
│   └── architecture/
│       └── system-architecture.md        ← Core system architecture
├── specs/                                 ← 48 capability specs
│   ├── language-parser/spec.md
│   ├── type-system/spec.md
│   ├── execution-engine/spec.md
│   ├── ta-functions/spec.md
│   ├── multi-symbol-data/spec.md
│   ├── plotting-visualization/spec.md
│   ├── drawing-objects/spec.md
│   ├── strategy-execution/spec.md
│   ├── extensibility/spec.md
│   ├── performance-scalability/spec.md
│   ├── testing-compatibility/spec.md
│   ├── input-configuration/spec.md
│   ├── string-time-functions/spec.md
│   ├── alert-system/spec.md
│   ├── color-system/spec.md
│   ├── script-declaration/spec.md
│   ├── frontend-application/spec.md
│   ├── monorepo-structure/spec.md
│   ├── backend-api-server/spec.md
│   ├── bybit-integration/spec.md
│   ├── canvas-charting-library/spec.md
│   ├── strategy-backtest-engine/spec.md
│   ├── script-bank-management/spec.md
│   ├── unified-script-editor/spec.md
│   ├── telegram-notification/spec.md
│   ├── ai-agent-integration/spec.md
│   ├── file-based-storage/spec.md
│   ├── separate-indicator-panes/spec.md
│   ├── dynamic-indicator-management-ui/spec.md
│   ├── multi-version-support/spec.md
│   ├── progressive-computation/spec.md
│   ├── time-based-rendering/spec.md
│   ├── dark-theme/spec.md
│   ├── auto-scale-toggle/spec.md
│   ├── scroll-re-execution/spec.md
│   ├── parser-lowercase-types/spec.md
│   ├── builtin-test-indicators/spec.md
│   ├── forming-candle-lifecycle/spec.md
│   ├── index-based-rendering/spec.md
│   ├── forming-candle-colors/spec.md
│   ├── quick-indicator-adder/spec.md
│   ├── cli-backtest-tool/spec.md
│   ├── chart-viewport-autofit/spec.md
│   ├── time-module/spec.md
│   ├── go-to-date/spec.md
│   ├── error-console/spec.md
│   ├── single-strategy-enforcement/spec.md
│   └── footer-bar/spec.md
└── changes/
    └── legacy-spec-migration/
        └── proposal.md                   ← Migration change proposal
```

## Verification

- [x] All 49 requirements mapped to specs
- [x] No data loss in migration
- [x] Legacy files preserved
- [x] Migration change documented
- [x] Architecture extracted to docs/

## Next Steps

1. **Review this report** and the new OpenSpec structure
2. **Approve legacy file deletion** (or request modifications)
3. **Migrate tasks.md** selectively into the new change system
4. **Use OpenSpec CLI** for future changes: `openspec new change "<title>"`
