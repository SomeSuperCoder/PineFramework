## 1. Fix overlap-zone element dropping (lines, shapes, labels, boxes, bgcolor)

- [x] 1.1 Refactor `prependIndicatorResult` to change all overlap-zone filters from `!inOverlap(key)` to `!(inOverlap(key) && replaced)` — apply uniformly to shapes, lines, labels, boxes, and bgcolor
- [x] 1.2 Add `prevLineReplaced` / `prevLineInOverlap` pattern for labels (matching by `time`)
- [x] 1.3 Add `prevBoxReplaced` / `prevBoxInOverlap` pattern for boxes (matching by `startTime`)
- [x] 1.4 Add `prevBgcolorReplaced` / `prevBgcolorInOverlap` pattern for bgcolor (matching by `time`)
- [x] 1.5 Verify fills merge already correctly skips overlap filtering (no change needed)

## 2. Fix strategy marker barIndex

- [x] 2.1 Shift prev strategy marker `barIndex` values by `addedCount` in `prependIndicatorResult`, matching the pattern used for `alertTriggers` (existing lines 203-214)

## 3. Add unit tests

- [x] 3.1 Add test: shape in overlap zone survives when newResult does not reproduce it
- [x] 3.2 Add test: shape in overlap zone is replaced when newResult reproduces it
- [x] 3.3 Add test: line in overlap zone survives when newResult does not reproduce it
- [x] 3.4 Add test: label in overlap zone survives when not replaced
- [x] 3.5 Add test: box in overlap zone survives when not replaced
- [x] 3.6 Add test: bgcolor entry in overlap zone survives when not replaced
- [x] 3.7 Add test: strategy marker barIndex is shifted by addedCount after prepend
- [x] 3.8 Add test: new strategy markers keep their original barIndex unchanged
- [x] 3.9 Run all 99 existing tests + new tests to confirm no regressions

## 4. Verify with debug mode

- [ ] 4.1 Load an indicator that draws lines+markers at chunk boundaries (e.g., a custom HHLL with marked pivot points)
- [ ] 4.2 Enable debug mode, scroll back past a chunk boundary, confirm no missing markers or cut-off lines
- [ ] 4.3 Verify strategy markers render at correct bar positions after scroll-back
