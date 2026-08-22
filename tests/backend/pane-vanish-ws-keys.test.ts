import fs from 'fs';
import { ScriptSession, type ScriptOutputs } from '../../backend/src/session/ScriptSession.js';

/**
 * Regression: supertrend-3d bottom pane vanishing ~5-8s after add.
 *
 * ROOT CAUSE (bug-hunter, data/handoffs/team/quality/bug-hunter/pane-vanish-root-cause.json):
 * WS execution_result messages omitted plotOverlayKeys/hiddenPlotKeys while the
 * REST path (execute.ts:206-207) included them. The frontend classifies each
 * plot via `result.overlay || overlayPlotTitles.includes(title)`; for
 * supertrend-3d BOTH plots are force_overlay=true, so the bottom pane exists
 * ONLY via maxManualNonOverlayCount=1. The WS full result (keys undefined) flipped
 * hasNonOverlayPlot to true, skipped the maxManual branch, and called
 * setManualNonOverlayPaneCount(0) → pane removed permanently.
 *
 * THE FIX: ScriptOutputs now carries optional plotOverlayKeys/hiddenPlotKeys and
 * FormingCandleManager.toOutputs + toFormingCandleOutputs forward them from the
 * engine result (mirroring execute.ts). This test proves the WS serializers emit
 * the keys — the exact missing piece that made the pane vanish.
 *
 * PRE-FIX FAILURE MODE: on the old code `output.plotOverlayKeys` is `undefined`,
 * so `expect(out.plotOverlayKeys).toContain('Up Trend')` throws. Verified by
 * stashing the fix (see test run evidence in the handoff).
 */

function makeBars(count: number, startPrice = 100, baseTime = 1700000000000) {
  const bars: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + 2;
    bars.push({
      timestamp: baseTime + i * 3600000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

describe('WS execution_result overlay classification keys (supertrend-3d pane-vanish regression)', () => {
  // supertrend-3d.pine: overlay=false, both plot() calls use force_overlay=true
  // with titles "Up Trend" / "Down Trend" (test_indicators/supertrend-3d.pine:5,213-214).
  const source = fs.readFileSync('./test_indicators/supertrend-3d.pine', 'utf-8');

  it('initialize() — the WS initial execution_result path (gateway.ts:547) — forwards plotOverlayKeys/hiddenPlotKeys via toOutputs', async () => {
    const session = new ScriptSession(source, 'BTCUSDT', '60', makeBars(60));
    const out: ScriptOutputs = await session.initialize();

    expect(out.success).toBe(true);
    // THE regression assertions: pre-fix code leaves these undefined.
    // Engine keys carry style metadata ("Up Trend__style:line" — see
    // plot-builtins.ts:104-110); the frontend strips it via stripMeta()
    // (chart-data-transform.ts:227) to build overlayPlotTitles — exactly the
    // REST path (execute.ts:206-207) the WS serializer now mirrors.
    expect(out.plotOverlayKeys).toBeDefined();
    expect(out.plotOverlayKeys!.length).toBeGreaterThan(0);
    expect(out.plotOverlayKeys!.some((k) => k.startsWith('Up Trend'))).toBe(true);
    expect(out.plotOverlayKeys!.some((k) => k.startsWith('Down Trend'))).toBe(true);
    // hiddenPlotKeys must also be emitted (as an array) so the frontend can
    // reclassify hidden plots on the WS replace without losing them.
    expect(Array.isArray(out.hiddenPlotKeys)).toBe(true);
  });

  it('appendOrUpdateBar forming-tick — the WS diff path (gateway reexecuteForTopic → appendOrUpdateBar → toFormingCandleOutputs) — forwards plotOverlayKeys', async () => {
    const session = new ScriptSession(source, 'BTCUSDT', '60', makeBars(60));
    await session.initialize();

    const bars = makeBars(60);
    const lastBar = bars[bars.length - 1]!;
    // Forming tick on the same timestamp as the last bar (tick → toFormingCandleOutputs).
    const formingBar = {
      timestamp: lastBar.timestamp,
      open: lastBar.open,
      high: Math.max(lastBar.high, lastBar.close + 1),
      low: Math.min(lastBar.low, lastBar.close - 1),
      close: lastBar.close + 1,
      volume: lastBar.volume,
    };

    const out: ScriptOutputs = await session.appendOrUpdateBar(formingBar);

    expect(out.success).toBe(true);
    expect(out.formingCandle).toBe(true);
    // Post-fix the diff serializer carries the same overlay classification keys
    // (style-suffixed engine keys, stripped to bare titles by the frontend).
    expect(out.plotOverlayKeys).toBeDefined();
    expect(out.plotOverlayKeys!.some((k) => k.startsWith('Up Trend'))).toBe(true);
    expect(out.plotOverlayKeys!.some((k) => k.startsWith('Down Trend'))).toBe(true);
  });
});
