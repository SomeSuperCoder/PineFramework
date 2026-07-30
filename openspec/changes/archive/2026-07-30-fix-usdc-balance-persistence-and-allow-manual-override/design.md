## Context

The USDC balance is fetched twice:
1. During wallet import preview (in WalletImportPanel)
2. After import (in SetupWizard useEffect)

The preview balance shows correctly but isn't passed up to SetupWizard. The useEffect fetches again but the wallet may not be fully ready yet, or the RPC call returns 0.

## Goals / Non-Goals

**Goals:**
- Pass preview balance from WalletImportPanel to SetupWizard
- Allow manual override of auto-calculated maxDailyLoss
- Show both calculated and override values in config panel

**Non-goals:**
- Real-time balance updates
- Configurable risk percentage

## Decisions

### 1. Balance persistence

**Choice:** Pass preview balance up via onWalletChange callback.

**Rationale:**
- WalletImportPanel already has the correct balance from preview
- No need to fetch again
- Simple prop drilling

### 2. Manual override

**Choice:** Add a toggle checkbox to enable manual override.

**Rationale:**
- User can see the calculated value
- Toggle enables an input field to override
- Clear visual distinction between auto and manual

## Risks / Trade-offs

**[Risk] Balance stale** → User may deposit more USDC after import. Acceptable for v1.

**[Trade-off] Manual override** → User could set dangerously high risk. Mitigate with reasonable max.

## Migration Plan

1. Deploy frontend change
2. No backend changes needed
