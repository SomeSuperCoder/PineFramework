## Context

The BotConfigPanel has a static input for maxDailyLoss (default $50). The wallet already fetches USDC balance on import. We can reuse that balance to auto-calculate risk.

Formula: `maxDailyLoss = min($1, balance * 0.10)`

Examples:
- $0 USDC → $0 (no trading)
- $5 USDC → $0.50
- $10 USDC → $1.00 (capped)
- $100 USDC → $1.00 (capped)
- $1000 USDC → $1.00 (capped)

## Goals / Non-Goals

**Goals:**
- Auto-calculate maxDailyLoss from USDC balance
- Cap at $1 maximum
- Show calculated value in config panel
- Zero balance = zero risk (no trading)

**Non-goals:**
- Manual override of calculated value
- Configurable risk percentage
- Real-time balance updates affecting risk

## Decisions

### 1. Calculation location

**Choice:** Frontend calculates and sends to backend.

**Rationale:**
- Balance already fetched in frontend
- Backend receives the same `maxDailyLoss` number it already expects
- No backend changes needed

### 2. Cap value

**Choice:** Hardcode $1 maximum.

**Rationale:**
- Conservative default for a trading bot
- User can always adjust later if needed

### 3. Zero balance behavior

**Choice:** Set maxDailyLoss to 0 (effectively disables trading).

**Rationale:**
- No funds = no risk
- Prevents accidental trading with empty wallet

## Risks / Trade-offs

**[Risk] Balance stale** → Balance fetched once on import. If user deposits more, risk doesn't update until re-import. Acceptable for v1.

**[Trade-off] No manual override** → User can't increase risk beyond $1. Could add override later.

## Migration Plan

1. Deploy frontend change
2. No backend changes needed
3. No data migration

## Open Questions

- Should we show the formula to the user?
