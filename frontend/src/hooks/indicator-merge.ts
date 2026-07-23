/**
 * Indicator merge logic for prepend and real-time diff operations.
 *
 * When older bar data is loaded (e.g. scrolling left), the execution engine
 * recomputes the boundary region where the old and new bar sets overlap.
 * These functions merge the recomputed data into the existing ScriptResult
 * without discarding everything.
 *
 * Similarly, real-time WebSocket updates carry only the latest tick's values
 * (diff), which are merged into the existing result incrementally.
 */

import type { ScriptResult } from '../types';
import {
  stripMeta,
  transformFillKey,
  mapShapes,
  mapLines,
  mapLabels,
  mapBoxes,
  mapFills,
  mapStrategyMarkers,
  mapBgColor,
  mapAlertConditions,
  mapAlertTriggers,
} from './chart-data-transform';
import type { ExecutionResultMessage } from './chart-data-transform';

// ---------------------------------------------------------------------------
// Prepend merge
// ---------------------------------------------------------------------------

/**
 * Merge a prepended (older bars) execution result into a previous result.
 *
 * The new execution result contains entries for BOTH the new bars and the
 * context (lookback) bars. This function:
 *  - Prepends new bar data to each plot
 *  - Replaces the boundary region (context bars) with recomputed values
 *  - Merges shapes, fills, lines, labels with overlap-aware dedup
 *  - Shifts alert trigger barIndex values to account for the larger array
 */
export function prependIndicatorResult(
  prev: ScriptResult,
  newResult: ScriptResult,
  addedCount: number,
  contextSize: number,
  overlapTimestamps?: Set<number>,
): ScriptResult {
  const mergedPlots = prev.plots.map((plot) => {
    const newPlot = newResult.plots.find((p) => p.title === plot.title);
    if (newPlot) {
      const newBarData = newPlot.data.slice(0, addedCount);
      const boundaryData = newPlot.data.slice(
        addedCount,
        addedCount + contextSize,
      );
      // Replace the first contextSize entries of prev with recomputed boundary
      const replacedPrev = [...boundaryData, ...plot.data.slice(contextSize)];
      return { ...plot, data: [...newBarData, ...replacedPrev] };
    }
    return plot;
  });
  // Add any entirely new plots from newResult
  for (const newPlot of newResult.plots) {
    if (!mergedPlots.find((p) => p.title === newPlot.title)) {
      mergedPlots.push(newPlot);
    }
  }

  const inOverlap = overlapTimestamps
    ? (t: number) => overlapTimestamps.has(t)
    : (_t: number) => false;

  const mergedShapes = [
    ...newResult.shapes,
    ...prev.shapes.filter(
      (s) =>
        !newResult.shapes.some((n) => n.time === s.time),
    ),
  ];
  const mergedFills = [
    ...(newResult.fills || []),
    ...(prev.fills || []).filter(
      (f) =>
        !(newResult.fills || []).some(
          (n) => n.from === f.from && n.to === f.to,
        ),
    ),
  ];
  // ── Lines ──
  // Match prev lines to newResult lines by FULL identity (all points), not
  // just points[0].time. Using only points[0].time is an over-match that
  // drops ALL prev lines starting at a given timestamp when newResult has
  // ANY line starting there — causing labels at chunk borders to lose their
  // attached lines when the re-execution doesn't reproduce every line.
  function linesMatch(
    a: typeof prev.lines[number],
    b: typeof prev.lines[number],
  ): boolean {
    if (a.points.length !== b.points.length) return false;
    for (let i = 0; i < a.points.length; i++) {
      if (a.points[i].time !== b.points[i].time) return false;
      if (a.points[i].price !== b.points[i].price) return false;
    }
    return true;
  }

  const prevLineReplaced = (pl: typeof prev.lines[number]): boolean =>
    newResult.lines.some((nl) => linesMatch(nl, pl));

  const survivingPrevLines = prev.lines.filter(
    (pl) => !prevLineReplaced(pl),
  );

  // Fix lines from newResult that incorrectly have extend:right because
  // the re-execution on a smaller dataset didn't see subsequent pivots
  // that terminated them.
  //
  // E.g., HHLL S/R lines: the last resistance/support line in the partial
  // re-execution has extend:right because no later pivot exists in the
  // small dataset. But when merged with prev, there IS a later line (from
  // the full-dataset execution) that should terminate it.  We detect this
  // by checking whether any surviving prev line starts after this line's
  // endpoint.
  //
  // This is more robust than matching by points[0].time because the
  // pivot detection (e.g. findprevious()) can produce different S/R
  // segments on the truncated dataset, making first-point matching fail.
  const fixedNewLines = newResult.lines.map((nl) => {
    if (nl.extend === 'right') {
      const endTime = nl.points[nl.points.length - 1]?.time;
      if (endTime !== undefined) {
        const hasLaterLine = survivingPrevLines.some(
          (pl) =>
            pl.points[0]?.time !== undefined &&
            pl.points[0].time >= endTime,
        );
        if (hasLaterLine) {
          return { ...nl, extend: 'none' as const };
        }
      }
    }
    return nl;
  });

  const mergedLines = [...fixedNewLines, ...survivingPrevLines];
  const mergedLabels = [
    ...newResult.labels,
    ...prev.labels.filter(
      (l) => !newResult.labels.some((n) => n.time === l.time),
    ),
  ];
  const mergedStrategyMarkers = [
    ...(newResult.strategyMarkers || []),
    ...(prev.strategyMarkers || []).map((m) => ({
      ...m,
      barIndex: m.barIndex + addedCount,
    })),
  ];

  // Prepend fillColorData entries and recompute boundary
  const mergedFillColorData: Record<string, (string | null)[]> = {};
  const allFillKeys = new Set([
    ...Object.keys(prev.fillColorData || {}),
    ...Object.keys(newResult.fillColorData || {}),
  ]);
  for (const key of allFillKeys) {
    const newColors = newResult.fillColorData?.[key] || [];
    const prevColors = prev.fillColorData?.[key] || [];
    const boundaryColors = newColors.slice(addedCount, addedCount + contextSize);
    mergedFillColorData[key] = [
      ...newColors.slice(0, addedCount),
      ...boundaryColors,
      ...prevColors.slice(contextSize),
    ];
  }

  // Prepend plotColors entries and recompute boundary
  const mergedPlotColors: Record<string, (string | null)[]> = {};
  const allColorKeys = new Set([
    ...Object.keys(prev.plotColors || {}),
    ...Object.keys(newResult.plotColors || {}),
  ]);
  for (const key of allColorKeys) {
    const newColors = newResult.plotColors?.[key] || [];
    const prevColors = prev.plotColors?.[key] || [];
    const boundaryColors = newColors.slice(addedCount, addedCount + contextSize);
    mergedPlotColors[key] = [
      ...newColors.slice(0, addedCount),
      ...boundaryColors,
      ...prevColors.slice(contextSize),
    ];
  }

  const mergedBgcolor = [
    ...(newResult.bgcolor || []),
    ...(prev.bgcolor || []).filter(
      (b) =>
        !(newResult.bgcolor || []).some((n) => n.time === b.time),
    ),
  ];
  const mergedBoxes = [
    ...(newResult.boxes || []),
    ...(prev.boxes || []).filter(
      (b) =>
        !(newResult.boxes || []).some((n) => n.startTime === b.startTime),
    ),
  ];
  // Tables are static dashboard state — use the latest
  const mergedTables =
    newResult.tables.length > 0 ? newResult.tables : prev.tables;

  // Merge alert triggers with barIndex shifting
  const newTriggers = newResult.alertTriggers || [];
  const prevTriggers = prev.alertTriggers || [];
  const mergedAlertTriggers = [
    ...newTriggers.filter((t) => t.barIndex < addedCount),
    ...newTriggers.filter(
      (t) =>
        t.barIndex >= addedCount && t.barIndex < addedCount + contextSize,
    ),
    ...prevTriggers
      .filter((t) => t.barIndex >= contextSize)
      .map((t) => ({ ...t, barIndex: t.barIndex + addedCount })),
  ];

  const mergedAlertConditions =
    newResult.alertConditions && newResult.alertConditions.length > 0
      ? newResult.alertConditions
      : prev.alertConditions;

  // Merge barColors: newResult's entries replace prev's by time, with overlap-aware dedup
  const mergedBarColors = (() => {
    const newColors = newResult.barColors || [];
    const prevColors = prev.barColors || [];
    if (newColors.length === 0) return prevColors;
    const prevByTime = new Map(prevColors.map((c) => [c.time, c]));
    for (const c of newColors) {
      if (!inOverlap(c.time)) {
        prevByTime.set(c.time, c);
      }
    }
    return Array.from(prevByTime.values()).sort((a, b) => a.time - b.time);
  })();

  return {
    ...prev,
    plots: mergedPlots,
    shapes: mergedShapes,
    fills: mergedFills,
    lines: mergedLines,
    labels: mergedLabels,
    strategyMarkers: mergedStrategyMarkers,
    fillColorData: mergedFillColorData,
    plotColors: mergedPlotColors,
    bgcolor: mergedBgcolor,
    boxes: mergedBoxes,
    tables: mergedTables,
    alertTriggers: mergedAlertTriggers,
    alertConditions: mergedAlertConditions,
    barColors: mergedBarColors.length > 0 ? mergedBarColors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Diff merge (real-time WebSocket updates)
// ---------------------------------------------------------------------------

/**
 * Merge a real-time diff message into an existing ScriptResult.
 *
 * WebSocket updates carry the latest tick value(s) for each output key.
 * This function replaces the last entry of each plot series with the new
 * value (forming candle update) or appends a new entry (new bar confirmed).
 * Shapes, fills, lines, labels, and boxes are deduped by timestamp.
 * Alert triggers use an ID+barIndex dedup key to avoid duplicates.
 */
export function mergeDiffIntoResult(
  prev: ScriptResult,
  msg: ExecutionResultMessage,
): ScriptResult {
  const mergedPlots = prev.plots.map((plot) => {
    const diffKey = Object.keys(msg.outputs).find((k) => {
      const stripped = k
        .replace(/__lw:\d+/g, '')
        .replace(/__style:[^_]+/g, '');
      return stripped === plot.title || k === plot.title;
    });
    if (diffKey && msg.outputs[diffKey] && msg.outputs[diffKey].length > 0) {
      const diffValue = msg.outputs[diffKey]![0];
      const numValue =
        diffValue === null || diffValue === undefined
          ? null
          : typeof diffValue === 'boolean'
            ? diffValue
              ? 1
              : 0
            : typeof diffValue === 'number'
              ? diffValue
              : null;
      const perBarColors = msg.plotColors?.[diffKey];
      const color =
        perBarColors?.[perBarColors.length - 1] ??
        plot.data[plot.data.length - 1]?.color;
      const isNewBar = (msg.barIndex ?? 0) >= plot.data.length;
      if (isNewBar) {
        const rawTime = msg.barTimestamps?.[msg.barIndex];
        const newTime =
          rawTime !== undefined
            ? Math.floor(rawTime / 1000)
            : plot.data[plot.data.length - 1]?.time ?? 0;
        return {
          ...plot,
          data: [...plot.data, { time: newTime, value: numValue, color }],
        };
      }
      const lastEntry = plot.data[plot.data.length - 1];
      if (lastEntry) {
        return {
          ...plot,
          data: [
            ...plot.data.slice(0, -1),
            { ...lastEntry, value: numValue, color },
          ],
        };
      }
    } else if (
      (msg.barIndex ?? 0) >= plot.data.length &&
      plot.data.length > 0
    ) {
      const lastEntry = plot.data[plot.data.length - 1];
      const rawTime =
        msg.barTimestamps?.[msg.barIndex] ?? (lastEntry?.time ?? 0);
      const newTime = Math.floor(rawTime / 1000);
      return {
        ...plot,
        data: [
          ...plot.data,
          {
            time: newTime,
            value: lastEntry?.value ?? null,
            color: lastEntry?.color,
          },
        ],
      };
    }
    return plot;
  });

  // ── Shapes ──
  const diffShapes = mapShapes(msg.shapes);
  const mergedShapes =
    diffShapes.length > 0
      ? [
          ...prev.shapes.filter(
            (s) => !diffShapes.some((d) => d.time === s.time),
          ),
          ...diffShapes,
        ]
      : prev.shapes;

  // ── Fills ──
  const diffFills = mapFills(msg.fills);
  const mergedFills =
    diffFills.length > 0
      ? [
          ...(prev.fills || []).filter(
            (f) =>
              !diffFills.some(
                (d) => d.from === f.from && d.to === f.to,
              ),
          ),
          ...diffFills,
        ]
      : prev.fills || [];

  // ── Lines ──
  const diffLines = mapLines(msg.lines);
  const mergedLines =
    diffLines.length > 0
      ? [
          ...prev.lines.filter(
            (l) =>
              !diffLines.some(
                (d) => d.points[0]?.time === l.points[0]?.time,
              ),
          ),
          ...diffLines,
        ]
      : prev.lines;

  // ── Labels ──
  const diffLabels = mapLabels(msg.labels);
  const mergedLabels =
    diffLabels.length > 0
      ? [
          ...prev.labels.filter(
            (l) => !diffLabels.some((d) => d.time === l.time),
          ),
          ...diffLabels,
        ]
      : prev.labels;

  // ── Strategy markers ──
  const diffStrategyMarkers = mapStrategyMarkers(msg.strategyMarkers);
  const mergedStrategyMarkers = [
    ...(prev.strategyMarkers || []),
    ...diffStrategyMarkers,
  ];

  // ── Plot colors ──
  const mergedPlotColors = msg.plotColors
    ? Object.entries(msg.plotColors).reduce(
        (acc, [key, colors]) => {
          const prevColors = prev.plotColors?.[key];
          if (prevColors) {
            acc[key] = [
              ...prevColors.slice(0, -colors.length || undefined),
              ...colors,
            ];
          } else {
            acc[key] = colors;
          }
          return acc;
        },
        {} as Record<string, (string | null)[]>,
      )
    : prev.plotColors;

  // ── Fill color data ──
  const mergedFillColorData = msg.fillColorData
    ? Object.entries(msg.fillColorData).reduce(
        (acc, [key, colors]) => {
          const transformedKey = transformFillKey(key);
          const prevColors = prev.fillColorData?.[transformedKey];
          if (prevColors) {
            acc[transformedKey] = [
              ...prevColors.slice(0, -colors.length || undefined),
              ...colors,
            ];
          } else {
            acc[transformedKey] = colors;
          }
          return acc;
        },
        {} as Record<string, (string | null)[]>,
      )
    : prev.fillColorData;

  // ── Bar colors (diff) ──
  const mergedBarColors = (() => {
    if (!msg.barColors || msg.barColors.length === 0) return prev.barColors;
    const prevColors = prev.barColors || [];
    const prevByTime = new Map(prevColors.map((c) => [c.time, c]));
    for (const b of msg.barColors) {
      prevByTime.set(b.time, { time: b.time, body: b.bodyColor ?? b.color, wick: b.wickColor, border: b.borderColor, offset: b.offset });
    }
    const result = Array.from(prevByTime.values()).sort((a, b) => a.time - b.time);
    return result.length > 0 ? result : undefined;
  })();

  // ── Background color ──
  const mergedBgcolor = msg.bgcolor
    ? [
        ...(prev.bgcolor || []).slice(0, -(msg.bgcolor.length || undefined)),
        ...msg.bgcolor.map((b) => ({
          time: Math.floor(b.time / 1000),
          color: b.color,
        })),
      ]
    : prev.bgcolor;

  // ── Boxes ──
  const diffBoxes = mapBoxes(msg.boxes);
  const mergedBoxes =
    diffBoxes.length > 0
      ? [
          ...(prev.boxes || []).filter(
            (b) => !diffBoxes.some((d) => d.startTime === b.startTime),
          ),
          ...diffBoxes,
        ]
      : prev.boxes || [];

  // ── Alert triggers (deduped by alertId+barIndex) ──
  const mergedAlertTriggers =
    msg.alertTriggers?.length > 0
      ? (() => {
          const existingKeys = new Set(
            (prev.alertTriggers ?? []).map(
              (t) => `${t.alertId}:${t.barIndex}`,
            ),
          );
          const dedupedNew = msg.alertTriggers.filter(
            (t) => !existingKeys.has(`${t.alertId}:${t.barIndex}`),
          );
          return dedupedNew.length > 0
            ? [...(prev.alertTriggers ?? []), ...dedupedNew]
            : prev.alertTriggers;
        })()
      : prev.alertTriggers;

  return {
    ...prev,
    plots: mergedPlots,
    shapes: mergedShapes,
    fills: mergedFills,
    lines: mergedLines,
    labels: mergedLabels,
    strategyMarkers: mergedStrategyMarkers,
    plotColors: mergedPlotColors,
    fillColorData: mergedFillColorData,
    bgcolor: mergedBgcolor,
    barColors: mergedBarColors,
    boxes: mergedBoxes,
    tables: msg.tables || prev.tables,
    alertTriggers: mergedAlertTriggers,
  };
}
