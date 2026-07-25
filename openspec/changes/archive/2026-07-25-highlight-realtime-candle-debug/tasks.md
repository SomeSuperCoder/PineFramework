## 1. Chart highlight implementation

- [x] 1.1 In `PineChart.ts`, set a `CandleColorData` entry at index `candles.length - 1` with `#2196f3` body/wick/border inside `render()`, gated by `debugMode`
- [x] 1.2 Verify the highlight does not persist across renders when debug mode is off (clear or don't set the entry)

## 2. Verification

- [ ] 2.1 Manual: toggle debug mode on — confirm the last candle is blue
- [ ] 2.2 Manual: toggle debug mode off — confirm the last candle reverts to bull/bear colors
- [ ] 2.3 Manual: add new data while debug mode is on — confirm highlight moves to the new last candle
