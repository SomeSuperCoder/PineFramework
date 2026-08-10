# Fix remaining React.forwardRef warnings in shadcn UI components

**Date:** 2026-08-10
**Source:** Test Engineer (post-verification)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Several shadcn UI components still lack `React.forwardRef` and produce warnings when used with Radix's `asChild` pattern. The Button component was fixed (this change), but 5 other instances of the warning remain in the test suite.

## Rationale
Each missing `forwardRef` is a potential silent failure when the component is used with Radix's `Slot` (asChild pattern). The Button fix resolved the immediate StrategySelector dropdown bug, but the same pattern may affect other Popover/Dialog/Tooltip triggers across the app.

## Evidence
- Test output shows 5 remaining "Function components cannot be given refs" warnings
- Pattern: components used with `<Component asChild>` in Radix-based wrappers
- Fix pattern is identical to Button: wrap in `React.forwardRef`, pass ref to underlying element
