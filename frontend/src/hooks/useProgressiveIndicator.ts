import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScriptResult } from '../types';

interface ProgressiveState {
  fullResult: ScriptResult | null;
  revealedBars: number;
  isRevealing: boolean;
}

/**
 * Manages progressive indicator computation:
 * - Reveals indicator data in batches per animation frame
 * - Supports interruption (new scroll cancels current reveal)
 * - Supports instant catch-up (reveal all at once)
 */
export function useProgressiveIndicator(
  scriptResult: ScriptResult | null,
  visibleBarCount: number,
): { progressiveResult: ScriptResult | null; revealAll: () => void } {
  const [state, setState] = useState<ProgressiveState>({
    fullResult: null,
    revealedBars: 0,
    isRevealing: false,
  });
  const rafRef = useRef<number | null>(null);
  const visibleBarCountRef = useRef(visibleBarCount);
  visibleBarCountRef.current = visibleBarCount;

  useEffect(() => {
    if (!scriptResult) {
      setState({ fullResult: null, revealedBars: 0, isRevealing: false });
      return;
    }

    const maxPlots = Math.max(
      0,
      ...scriptResult.plots.map((p) => p.data.length),
    );

    if (maxPlots === 0) {
      setState({ fullResult: scriptResult, revealedBars: maxPlots, isRevealing: false });
      return;
    }

    setState({ fullResult: scriptResult, revealedBars: 0, isRevealing: true });

    const batchSize = 50;

    let currentRevealed = 0;
    const revealBatch = () => {
      currentRevealed = Math.min(currentRevealed + batchSize, maxPlots);

      setState((prev) => {
        if (prev.fullResult !== scriptResult) {
          return prev;
        }
        return { ...prev, revealedBars: currentRevealed };
      });

      if (currentRevealed < maxPlots) {
        rafRef.current = requestAnimationFrame(revealBatch);
      } else {
        setState((prev) => {
          if (prev.fullResult !== scriptResult) return prev;
          return { ...prev, isRevealing: false, revealedBars: maxPlots };
        });
      }
    };

    rafRef.current = requestAnimationFrame(revealBatch);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scriptResult]);

  const revealAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setState((prev) => {
      if (!prev.fullResult) return prev;
      const maxPlots = Math.max(0, ...prev.fullResult.plots.map((p) => p.data.length));
      return { ...prev, revealedBars: maxPlots, isRevealing: false };
    });
  }, []);

  const progressiveResult: ScriptResult | null = state.fullResult && state.revealedBars > 0
    ? {
        ...state.fullResult,
        plots: state.fullResult.plots.map((plot) => ({
          ...plot,
          data: plot.data.slice(-state.revealedBars),
        })),
        shapes: state.fullResult.shapes,
        fills: state.fullResult.fills,
        fillColorData: state.fullResult.fillColorData,
        plotColors: state.fullResult.plotColors,
        strategyMarkers: state.fullResult.strategyMarkers,
        bgcolor: state.fullResult.bgcolor,
        lines: state.fullResult.lines,
        labels: state.fullResult.labels,
        boxes: state.fullResult.boxes,
        alertConditions: state.fullResult.alertConditions,
        alertTriggers: state.fullResult.alertTriggers,
      }
    : null;

  return { progressiveResult, revealAll };
}
