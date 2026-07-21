## 1. Fix `mergeDiffIntoResult` — Timestamp-keyed merge for sparse arrays

- [x] 1.1 **Shapes** — Replaced `slice(0, -N)` with timestamp-keyed filter+concat.

- [x] 1.2 **Labels** — Same timestamp-keyed pattern as shapes.

- [x] 1.3 **Fills** — Replaced position-based merge with `from`+`to` composite key.

- [x] 1.4 **Lines** — Replaced position-based merge with `points[0].time` identity key.

- [x] 1.5 **Boxes** — Replaced position-based merge with `startTime` identity key.

## 2. Fix `prependIndicatorResult` — Deduplicate on prepend

- [x] 2.1 **Shapes/labels/lines/fills/boxes** — All 5 arrays now deduplicated by identity key before concatenation. Also fixed bgcolor by `time`.

## 3. Verify and test

- [ ] 3.1 **Run full test suite** — `npm test` — verify no regressions.
- [ ] 3.2 **Manual verification** — Deploy frontend, load an indicator with `plotshape()`, observe real-time kline updates on trailing candles. Confirm labels stay correct across 20+ bar updates.

## 4. Cleanup

- [ ] 4.1 **Commit** with message: `fix: merge shapes/labels/lines/fills/boxes by timestamp instead of array position in real-time WS diffs`

## Design References

| Decision | Section |
|----------|---------|
| Merge by timestamp (not position) | Decision 1 |
| Deduplicate in prepend | Decision 2 |
| No ChartComponent changes needed | Decision 3 |
| Identity keys per array type | Lines in Risks table, row 4 |
