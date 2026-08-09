# Button forwardRef + ChatCollapsible accessible-name hardening
**Date:** 2026-08-09
**Source:** test-engineer (AccessControl/Recipients card test handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
1. **Button forwardRef:** `Function components cannot be given refs… Check the render method of Primitive.button.Slot` fires when `AlertDialogTrigger asChild` wraps `Button` (AccessControlCard:263, RecipientsCard:182) and for `AlertDialogOverlay` — shadcn/radix ref-forwarding warning in production UI code. Fix the `ui/button.tsx` Button to forwardRef (or use the `asChild`-compatible pattern already used elsewhere).
2. **ChatCollapsible trigger accessible name** is `PrivateTrading Chat` (no space, JSX whitespace trimmed) — brittle for screen readers/queryers. Add a visually-hidden space or explicit `aria-label` on the trigger.

## Rationale
Both are a11y robustness issues, non-blocking but cheap to fix; the first also silences a React console warning.

## Evidence
- Test Engineer run: console warning observed in production UI code (not tests).
- recipients-card.test.tsx accessible-name assertion required regex /PrivateTrading Chat/.
