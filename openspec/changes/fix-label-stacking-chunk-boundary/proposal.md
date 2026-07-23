## Why

When scrolling back in the chart, labels from re-executed indicators "stack" at chunk boundaries — the same logical label appears twice because the re-execution produces labels at slightly different timestamps than the original execution. This happens because `ta.valuewhen()` and similar stateful functions have different internal state when re-executing on a truncated dataset (200 new bars + context) versus the full history.

The current label merge in `prependIndicatorResult` deduplicates by timestamp only (`n.time === l.time`), which fails when re-execution produces different labels at different times in the overlap zone.

## What Changes

- Fix the label merge in `prependIndicatorResult` to replace ALL previous labels in the overlap zone, not just deduplicate by timestamp
- The re-execution result (which covers both new bars and the overlap context) becomes the single source of truth for labels in that zone
- Previous labels outside the overlap zone are preserved as before

## Capabilities

### Modified Capabilities
- `progressive-computation`: The merge behavior for labels during chunk prepend changes from timestamp-dedup to overlap-zone-replacement

### New Capabilities
- (none)

## Impact

**Affected code:**
- `frontend/src/hooks/indicator-merge.ts` — `prependIndicatorResult` function, lines 210-215 (label merge logic)

**Affected indicators:**
- Any indicator using `ta.valuewhen()` with labels (e.g., HHLL S/R indicator)
- The issue only manifests when scrolling back past a chunk boundary with indicators that produce labels based on stateful functions

**Non-goals:**
- Changing how labels are created in the execution engine (working correctly)
- Changing how labels are rendered (rendering uses absolute timestamps)
- Fixing line merging (already handled by separate logic)
- Handling labels from different indicators (each indicator has its own result)
