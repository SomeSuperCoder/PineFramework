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
  // endpoint, and if found, terminate the newResult line at that position.
  //
  // Two modes:
  //   contextSize > 0 (overlap): just set extend:none — the overlap bars
  //     already cover the boundary correctly.
  //   contextSize = 0 (disjoint): update the line's last point timestamp to
  //     the first prev line's start time — bridges the gap between the two
  //     independent datasets without over-extending past the boundary.
  //   No later prev line: keep extend:right unchanged (genuinely last).
  const fixedNewLines = newResult.lines.map((nl) => {
    if (nl.extend !== 'right') return nl;

    const endTime = nl.points[nl.points.length - 1]?.time;
    if (endTime === undefined) return nl;

    // Find the earliest surviving prev line whose start time ≥ endTime
    const nextPrevLine = survivingPrevLines
      .filter(
        (pl) =>
          pl.points[0]?.time !== undefined &&
          pl.points[0].time >= endTime,
      )
      .sort((a, b) => a.points[0].time - b.points[0].time)[0];

    if (!nextPrevLine) return nl; // no later line — keep extend:right

    if (contextSize > 0) {
      // With overlap context: the boundary is already covered by
      // recomputed data. Just terminate the line at its current endpoint.
      return { ...nl, extend: 'none' as const };
    }

    // Without overlap context (contextSize = 0): the datasets are disjoint.
    // The newResult line ends at the last bar of the chunk. We extend its
    // endpoint to the first prev pivot to bridge the gap without
    // over-extending past the boundary.
    const modifiedPoints = [...nl.points];
    modifiedPoints[modifiedPoints.length - 1] = {
      ...modifiedPoints[modifiedPoints.length - 1],
      time: nextPrevLine.points[0].time,
    };
    return { ...nl, extend: 'none' as const, points: modifiedPoints };
  });

  // ── Clip lines at chunk boundary ──
  // Lines from either execution may extend past the chunk boundary into
  // territory belonging to the other side. Clip any line that starts before
  // the boundary and ends after it.
  let chunkBoundaryTime = 0;
  if (overlapTimestamps && overlapTimestamps.size > 0) {
    chunkBoundaryTime = Math.min(...overlapTimestamps);
  }

  const clipAtBoundary = (line: typeof prev.lines[number]): typeof prev.lines[number] => {
    if (chunkBoundaryTime <= 0) return line;
    if (line.points.length < 2) return line;
    const firstPoint = line.points[0];
    const lastPoint = line.points[line.points.length - 1];
    if (firstPoint.time >= chunkBoundaryTime || lastPoint.time <= chunkBoundaryTime) {
      return line; // fully on one side of boundary
    }
    // Find the segment that crosses the boundary and clip there
    for (let i = 0; i < line.points.length - 1; i++) {
      const p1 = line.points[i];
      const p2 = line.points[i + 1];
      if (p1.time <= chunkBoundaryTime && p2.time >= chunkBoundaryTime) {
        const t = (p2.time - p1.time) > 0
          ? (chunkBoundaryTime - p1.time) / (p2.time - p1.time)
          : 0;
        return {
          ...line,
          points: [
            ...line.points.slice(0, i + 1),
            { time: chunkBoundaryTime, price: p1.price + t * (p2.price - p1.price) },
          ],
        };
      }
    }
    return line;
  };

  const clippedNewLines = fixedNewLines.map(clipAtBoundary);
  const clippedPrevLines = survivingPrevLines.map(clipAtBoundary);

  const mergedLines = [...clippedNewLines, ...clippedPrevLines];

  // ── Labels ──
  // Match labels by (text, price) tuple, not just timestamp. Re-execution
  // on a truncated dataset may produce labels at different timestamps due
  // to ta.valuewhen() state differences. We need to detect when a prev
  // label is "replaced" by a newResult label even if timestamps differ.
  //
  // Strategy:
  //   1. All newResult labels are kept (re-execution is authoritative for overlap zone)
  //   2. Prev labels are deduped in two passes:
  //      a. Global dedup by exact (time, text, price) — drop any prev label
  //         that is identical to a newResult label, even outside the overlap
  //         zone (safety net for edge cases where the same bar appears in both).
  //      b. Overlap-zone dedup by (text, price) — when the re-execution shifts
  //         a label to a nearby bar (e.g. from time 100 → 102), drop the old
  //         one in the overlap so it doesn't coexist with its replacement.
  //   3. This prevents both duplication (identical label in both results)
  //      and disappearance (label not reproduced by re-execution survives).
  const newTimeTextPriceKeys = new Set(
    newResult.labels.map((l) => `${l.time}|${l.text ?? ''}|${l.price ?? ''}`),
  );
  const newLabelTextPriceKeys = new Set(
    newResult.labels.map((l) => `${l.text}|${l.price}`),
  );
  const mergedLabels = [
    ...newResult.labels,
    ...prev.labels.filter((l) => {
      // Pass 1: Global dedup — drop exact (time, text, price) duplicates
      const timeTextPriceKey = `${l.time}|${l.text ?? ''}|${l.price ?? ''}`;
      if (newTimeTextPriceKeys.has(timeTextPriceKey)) return false;

      // Pass 2: Overlap-zone dedup — drop prev labels that were "shifted"
      // to a different timestamp in the re-execution
      const inOverlap = overlapTimestamps?.has(l.time);
      if (!inOverlap) return true;
      const textPriceKey = `${l.text}|${l.price}`;
      return !newLabelTextPriceKeys.has(textPriceKey);
    }),
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
  // Dedup by (time, text, price) — not just time. When the forming candle
  // changes, pivot detection shifts and labels move to different timestamps.
  // A time-only dedup fails to remove the old label, causing stacking.
  const diffLabels = mapLabels(msg.labels);
  const diffTimeTextPriceKeys = new Set(
    diffLabels.map((l) => `${l.time}|${l.text ?? ''}|${l.price ?? ''}`),
  );
  const mergedLabels =
    diffLabels.length > 0
      ? [
          ...prev.labels.filter(
            (l) => {
              const key = `${l.time}|${l.text ?? ''}|${l.price ?? ''}`;
              return !diffTimeTextPriceKeys.has(key);
            },
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
