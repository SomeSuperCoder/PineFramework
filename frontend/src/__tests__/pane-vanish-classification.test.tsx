import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChartComponent } from '../components/ChartComponent';
import { PlotSeriesManager } from '../chart/plot-series-manager';
import type { ScriptResult } from '../types';

/**
 * Regression: supertrend-3d bottom pane vanishing ~5-8s after add.
 *
 * MECHANISM UNDER TEST (ChartComponent.tsx:310-361):
 *   REST result arrives (plotOverlayKeys present → overlayPlotTitles populated)
 *   → every plot classifies as overlay (plotIsOverlay=true) → hasNonOverlayPlot
 *   stays false → maxManualNonOverlayCount=1 → setManualNonOverlayPaneCount(1)
 *   → pane rendered. Then the WS execution_result replaces the result; PRE-FIX
 *   it carried NO overlay keys → plotIsOverlay=false → hasNonOverlayPlot=true →
 *   the maxManual branch is skipped → setManualNonOverlayPaneCount(0) → pane
 *   removed permanently. POST-FIX the WS result carries the keys → the pane
 *   survives the replace.
 *
 * The test renders the REAL ChartComponent (public surface) with a fake chart
 * (jsdom has no canvas — same mock strategy as bot-stop-step.test.tsx) and
 * asserts the `setManualNonOverlayPaneCount` calls the classification effect
 * makes.
 */

// vi.mock is hoisted above imports; state must live in vi.hoisted.
const { manualCountMock, makeFakeChart } = vi.hoisted(() => {
  const manualCountMock = vi.fn();
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Every chart method used by the classification effect is a no-op except
      // setManualNonOverlayPaneCount, which we record. Symbol props (inspect,
      // toStringTag) return undefined so host introspection stays sane.
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'setManualNonOverlayPaneCount') return manualCountMock;
      if (prop === 'timeScale') return () => new Proxy({}, handler);
      return () => undefined;
    },
  };
  return {
    manualCountMock,
    makeFakeChart: () => new Proxy({}, handler),
  };
});

vi.mock('../chart', () => ({
  PineChart: class PineChart {},
  createChart: () => makeFakeChart(),
}));

/** A supertrend-3d-shaped ScriptResult: overlay=false with two force_overlay plots. */
function supertrendResult(overlayPlotTitles?: string[]): ScriptResult {
  return {
    overlay: false,
    plots: [
      {
        title: 'Up Trend',
        data: [{ time: 1, value: 1 }],
        color: '#089981',
        lineWidth: 1,
        type: 'line',
      },
      {
        title: 'Down Trend',
        data: [{ time: 1, value: 1 }],
        color: '#f23645',
        lineWidth: 1,
        type: 'line',
      },
    ],
    shapes: [],
    lines: [],
    boxes: [],
    labels: [],
    tables: [],
    ...(overlayPlotTitles ? { overlayPlotTitles } : {}),
  };
}

const baseProps = {
  data: [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  scriptResult: null,
  dataVersion: 1,
  symbol: 'BTCUSDT',
  interval: '60',
  fetchOlderOHLCV: async () => 0,
};

function wsReplacedResult(overlayPlotTitles?: string[]): Map<string, ScriptResult> {
  // A NEW Map instance — the classification effect deps are
  // [data, scriptResult, indicatorResults], so re-rendering with a fresh map
  // re-runs the effect, exactly like a WS execution_result replace.
  return new Map([['st3d', supertrendResult(overlayPlotTitles)]]);
}

describe('supertrend-3d pane survival across WS execution_result (pane-vanish regression)', () => {
  beforeEach(() => {
    manualCountMock.mockClear();
  });

  it('REST result with overlayPlotTitles → pane kept at 1 (baseline)', () => {
    render(
      <ChartComponent
        {...baseProps}
        indicatorResults={wsReplacedResult(['Up Trend', 'Down Trend'])}
      />,
    );
    expect(manualCountMock).toHaveBeenCalledWith(1);
  });

  it('WS-replaced result WITH overlay keys (post-fix) → pane PERSISTS at 1 — THE REGRESSION', () => {
    const { rerender } = render(
      <ChartComponent
        {...baseProps}
        indicatorResults={wsReplacedResult(['Up Trend', 'Down Trend'])}
      />,
    );
    // WS execution_result arrives with the same overlay classification keys
    // (the backend fix forwards plotOverlayKeys on the WS serializers).
    rerender(
      <ChartComponent
        {...baseProps}
        indicatorResults={wsReplacedResult(['Up Trend', 'Down Trend'])}
      />,
    );
    expect(manualCountMock).toHaveBeenLastCalledWith(1);
  });

  it('NEGATIVE CONTROL — WS-replaced result WITHOUT overlay keys (pre-fix shape) → pane DROPS to 0', () => {
    const { rerender } = render(
      <ChartComponent
        {...baseProps}
        indicatorResults={wsReplacedResult(['Up Trend', 'Down Trend'])}
      />,
    );
    // Pre-fix, the WS serializer omitted the keys → overlayPlotTitles undefined.
    rerender(<ChartComponent {...baseProps} indicatorResults={wsReplacedResult(undefined)} />);
    expect(manualCountMock).toHaveBeenLastCalledWith(0);
  });
});

describe('pane allocation ordering — all-overlay added BEFORE a normal indicator', () => {
  /**
   * Regression: [all-overlay, normal] under-allocates panes.
   * The all-overlay indicator (supertrend-3d) claims the manual count
   * (manual=1); the normal indicator is assigned paneIndex 1. Pre-fix,
   * getNonOverlayPaneCount returned max(paneIndices.size=1, manual=1)=1 —
   * only pane 0 allocated, so the normal indicator's series at paneIndex 1
   * never rendered. The count must also derive from the highest pane index
   * actually assigned.
   *
   * NOTE: this exercises PlotSeriesManager directly — the component-level
   * tests above mock `../chart`, so they never reach the manager where the
   * allocation decision lives.
   */
  it('[all-overlay, normal] → pane count = 2 (maxPaneIndex+1 floor)', () => {
    const manager = new PlotSeriesManager();
    // supertrend-3d first: force-overlay plots, no paneIndex, manual count 1
    manager.addPlotSeries('Up Trend', {}, true, undefined);
    manager.addPlotSeries('Down Trend', {}, true, undefined);
    manager.setManualNonOverlayCount(1);
    // normal indicator second: lands on paneIndex 1
    manager.addPlotSeries('RSI', {}, false, 1);

    expect(manager.getNonOverlayPaneCount()).toBe(2);
  });

  it('[normal, all-overlay] → 1 pane is correct (normal rides the main pane)', () => {
    const manager = new PlotSeriesManager();
    manager.addPlotSeries('RSI', {}, false, 0);
    manager.addPlotSeries('Up Trend', {}, true, undefined);
    manager.addPlotSeries('Down Trend', {}, true, undefined);
    manager.setManualNonOverlayCount(1);

    expect(manager.getNonOverlayPaneCount()).toBe(1);
  });

  it('overlays only → count stays at manual (no phantom pane)', () => {
    const manager = new PlotSeriesManager();
    manager.addPlotSeries('Up Trend', {}, true, undefined);
    manager.setManualNonOverlayCount(0);

    expect(manager.getNonOverlayPaneCount()).toBe(0);
  });
});
