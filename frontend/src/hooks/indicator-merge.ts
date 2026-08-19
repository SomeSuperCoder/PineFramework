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

import type {
  ScriptResult,
  ShapeData,
  FillData,
  LineData,
  LinefillData,
  LabelData,
  BoxData,
} from '../types/index.js';
import {
  transformFillKey,
  mapShapes,
  mapLines,
  mapLabels,
  mapBoxes,
  mapFills,
  mapStrategyMarkers,
} from './chart-data-transform.js';
import {
  FIELD_SEMANTICS,
  normalizeExecutionResultMessage,
  type ExecutionResultMessage,
  type FieldSemanticsMap,
} from 'pine-framework/contracts';
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
      // Merge the overlap region with null-safe preservation + backfill.
      // When the re-execution has a valid (non-null) value, it is
      // authoritative and replaces the prev value. When the re-execution
      // produced null (warmup zone not satisfied), keep the prev value
      // to prevent rendering gaps at chunk borders.
      //
      // Backfill when BOTH are null (warmup > addedCount): scan forward
      // for the first valid value in the overlap and use it to fill the
      // gap. This prevents rendering gaps at chunk borders where the
      // warmup zone extends past the chunk size — same strategy as the
      // fillColorData and plotColors merges.
      const overlapFromNew = newPlot.data.slice(addedCount, addedCount + contextSize);
      const firstValidIdx = overlapFromNew.findIndex(
        (v) => v.value !== null && v.value !== undefined,
      );
      const replacedPrev = overlapFromNew
        .map((v, i) => {
          if (v.value !== null && v.value !== undefined) return v;
          const prevEntry = plot.data[i];
          if (prevEntry && prevEntry.value !== null && prevEntry.value !== undefined)
            return prevEntry;
          // Both null — backfill from the first valid post-warmup entry
          if (firstValidIdx >= 0 && i < firstValidIdx) {
            return { ...overlapFromNew[firstValidIdx], time: v.time };
          }
          return v;
        })
        .concat(plot.data.slice(contextSize));
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
    ...prev.shapes.filter((s) => !newResult.shapes.some((n) => n.time === s.time)),
  ];
  const mergedFills = [
    ...(newResult.fills || []),
    ...(prev.fills || []).filter(
      (f) => !(newResult.fills || []).some((n) => n.from === f.from && n.to === f.to),
    ),
  ];
  // ── Lines ──
  // Match prev lines to newResult lines by FULL identity (all points), not
  // just points[0].time. Using only points[0].time is an over-match that
  // drops ALL prev lines starting at a given timestamp when newResult has
  // ANY line starting there — causing labels at chunk borders to lose their
  // attached lines when the re-execution doesn't reproduce every line.
  function linesMatch(a: (typeof prev.lines)[number], b: (typeof prev.lines)[number]): boolean {
    if (a.points.length !== b.points.length) return false;
    for (let i = 0; i < a.points.length; i++) {
      if (a.points[i].time !== b.points[i].time) return false;
      if (a.points[i].price !== b.points[i].price) return false;
    }
    return true;
  }

  const prevLineReplaced = (pl: (typeof prev.lines)[number]): boolean =>
    newResult.lines.some((nl) => linesMatch(nl, pl));

  const survivingPrevLines = prev.lines.filter((pl) => !prevLineReplaced(pl));

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
      .filter((pl) => pl.points[0]?.time !== undefined && pl.points[0].time >= endTime)
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

  const clipAtBoundary = (line: (typeof prev.lines)[number]): (typeof prev.lines)[number] => {
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
        const t = p2.time - p1.time > 0 ? (chunkBoundaryTime - p1.time) / (p2.time - p1.time) : 0;
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
  const newLabelTextPriceKeys = new Set(newResult.labels.map((l) => `${l.text}|${l.price}`));
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

  // Prepend fillColorData entries and recompute boundary.
  // Uses null-safe overlap merge: when the re-execution has a valid color,
  // it replaces the prev value. When null (warmup zone not satisfied),
  // the prev value is preserved to prevent rendering gaps.
  //
  // Backfill strategy for persistent warmup nulls: when both new AND prev
  // have null at the same overlap position (because warmup > addedCount),
  // scan forward for the first valid color in the overlap and backfill.
  // This prevents rendering gaps at chunk borders where the fill warmup
  // zone extends past the chunk size.
  const mergedFillColorData: Record<string, (string | null)[]> = {};
  const allFillKeys = new Set([
    ...Object.keys(prev.fillColorData || {}),
    ...Object.keys(newResult.fillColorData || {}),
  ]);
  for (const key of allFillKeys) {
    const newColors = newResult.fillColorData?.[key] || [];
    const prevColors = prev.fillColorData?.[key] || [];
    const overlapNewFillColors = newColors.slice(addedCount, addedCount + contextSize);
    // Find the first valid color in the overlap region (past the warmup zone)
    const firstValidIdx = overlapNewFillColors.findIndex((c) => c !== null && c !== undefined);
    mergedFillColorData[key] = [
      ...newColors.slice(0, addedCount),
      ...overlapNewFillColors.map((c, i) => {
        if (c !== null) return c;
        if (prevColors[i] !== null && prevColors[i] !== undefined) return prevColors[i];
        // Both null — backfill from the first valid post-warmup color in the
        // new execution, so the gap at the chunk border is filled with a
        // reasonable color instead of rendering nothing. Once more chunk data
        // accumulates, the warmup zone shrinks and later prepends overwrite
        // these backfilled entries with correct values.
        if (firstValidIdx >= 0 && i < firstValidIdx) {
          return overlapNewFillColors[firstValidIdx];
        }
        return null;
      }),
      ...prevColors.slice(contextSize),
    ];
  }

  // Prepend plotColors entries and recompute boundary.
  //
  // Uses null-safe overlap merge: when the re-execution has a valid color,
  // it is authoritative (correct warmup state & trend conditions). When null
  // (warmup zone not satisfied), keep the prev color to prevent rendering
  // gaps. This is the same approach as raw plot data — unlike the previous
  // unconditional replacement which fixed "orphaned uncolored line" bugs but
  // introduced warmup gap bugs at chunk borders.
  //
  // Same backfill strategy as fillColorData: when both new and prev have null
  // (warmup > addedCount), backfill from the first valid color in the overlap.
  const mergedPlotColors: Record<string, (string | null)[]> = {};
  const allColorKeys = new Set([
    ...Object.keys(prev.plotColors || {}),
    ...Object.keys(newResult.plotColors || {}),
  ]);
  for (const key of allColorKeys) {
    const newColors = newResult.plotColors?.[key] || [];
    const prevColors = prev.plotColors?.[key] || [];
    const overlapNewColors = newColors.slice(addedCount, addedCount + contextSize);
    const firstValidIdx = overlapNewColors.findIndex((c) => c !== null && c !== undefined);
    mergedPlotColors[key] = [
      ...newColors.slice(0, addedCount),
      ...overlapNewColors.map((c, i) => {
        if (c !== null) return c;
        if (prevColors[i] !== null && prevColors[i] !== undefined) return prevColors[i];
        if (firstValidIdx >= 0 && i < firstValidIdx) {
          return overlapNewColors[firstValidIdx];
        }
        return null;
      }),
      ...prevColors.slice(contextSize),
    ];
  }

  const mergedBgcolor = [
    ...(newResult.bgcolor || []),
    ...(prev.bgcolor || []).filter(
      (b) => !(newResult.bgcolor || []).some((n) => n.time === b.time),
    ),
  ];
  const mergedBoxes = [
    ...(newResult.boxes || []),
    ...(prev.boxes || []).filter(
      (b) => !(newResult.boxes || []).some((n) => n.startTime === b.startTime),
    ),
  ];
  // Tables are static dashboard state — use the latest
  const mergedTables = newResult.tables.length > 0 ? newResult.tables : prev.tables;

  // Merge alert triggers with barIndex shifting
  const newTriggers = newResult.alertTriggers || [];
  const prevTriggers = prev.alertTriggers || [];
  const mergedAlertTriggers = [
    ...newTriggers.filter((t) => t.barIndex < addedCount),
    ...newTriggers.filter((t) => t.barIndex >= addedCount && t.barIndex < addedCount + contextSize),
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

  // ── Re-apply plotColors to plot data entries ──
  // The plotColors merge above may fill nulls with backfilled colors, but the
  // plot data entries carry their own per-bar colors that were set during
  // buildScriptResult (before backfill existed). Apply the (now-corrected)
  // mergedPlotColors to the plot data so the LineRenderer gets non-null colors.
  for (const [colorKey, colors] of Object.entries(mergedPlotColors)) {
    const plotTitle = colorKey.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const plot = mergedPlots.find((p) => p.title === plotTitle);
    if (plot) {
      for (let i = 0; i < plot.data.length && i < colors.length; i++) {
        if (colors[i] !== undefined) {
          plot.data[i] = { ...plot.data[i], color: colors[i] };
        }
      }
    }
  }

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
    linefills: newResult.linefills || prev.linefills || [],
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
 *
 * IMPLEMENTATION (F2, shared-contract refactor): the per-collection merge
 * branches were extracted VERBATIM from the original inline function into
 * named strategy functions registered per field. The driver iterates
 * FIELD_SEMANTICS from the shared contract (pine-framework/contracts) and
 * dispatches each field to its registered strategy, with a generic
 * accumulate-dedupe fallback for any future field that declares
 * accumulate-dedupe semantics but has no custom strategy.
 *
 * The ONLY intentional behavior delta vs the legacy implementation: EMPTY
 * incoming diff values ({}/[]) for tail-merge and replace strategies SKIP the
 * merge and keep prev. This closes the B1 merge-clobber hazard — B2 serializers
 * emit plotColors:{} / tables:[] on diffs that carry none, and clobbering
 * accumulated state on those ticks is exactly the fills-vanish class of bug.
 * (barColors already skipped empty diffs in the legacy code; the extracted
 * strategy preserves that.)
 *
 * The legacy implementation is preserved VERBATIM as the parity oracle at
 * frontend/src/__tests__/fixtures/legacy-merge.ts (legacyMergeDiffIntoResult).
 */
export function mergeDiffIntoResult(prev: ScriptResult, msg: ExecutionResultMessage): ScriptResult {
  // Normalize at merge entry: guarantees every contract collection exists
  // (arrays as [], records as {}), strips unknown wire keys, and never mutates
  // or freezes the input — the caller may still mutate the result (seed-trim).
  const diff = normalizeExecutionResultMessage(msg);

  const merged: ScriptResult = { ...prev };
  for (const field of Object.keys(FIELD_SEMANTICS) as Array<keyof FieldSemanticsMap>) {
    const semantics = FIELD_SEMANTICS[field];
    const strategy = MERGE_STRATEGIES[field];
    if (strategy) {
      Object.assign(merged, strategy(prev, diff));
      continue;
    }
    // Generic fallback: an unregistered accumulate-dedupe field merges by its
    // declared dedupeKeys (empty dedupeKeys = plain append, no dedupe).
    if (semantics.merge === 'accumulate-dedupe') {
      const incoming = (diff as unknown as Record<string, unknown>)[field];
      if (Array.isArray(incoming)) {
        const prevValue = (prev as unknown as Record<string, unknown>)[field];
        Object.assign(merged, {
          [field]: genericAccumulateDedupe(
            prevValue as readonly unknown[] | undefined,
            incoming,
            semantics.dedupeKeys ?? [],
          ),
        });
      }
    }
    // static / tail-merge / replace / outputs-append-update fields without a
    // registered strategy are intentionally skipped: no generic merge is
    // possible without more shape info, and static fields are not merged here.
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Strategy registry — field name → merge strategy (mirrors FIELD_SEMANTICS).
// Static fields (hiddenPlotKeys, plotOverlayKeys) are deliberately NOT
// registered: the merge does not touch them.
// ---------------------------------------------------------------------------

type MergeStrategy = (prev: ScriptResult, msg: ExecutionResultMessage) => Partial<ScriptResult>;

const MERGE_STRATEGIES: Partial<Record<keyof FieldSemanticsMap, MergeStrategy>> = {
  outputs: mergeOutputs,
  plotColors: mergePlotColors,
  fillColorData: mergeFillColorData,
  shapes: mergeShapes,
  fills: mergeFills,
  linefills: mergeLinefills,
  lines: mergeLines,
  labels: mergeLabels,
  boxes: mergeBoxes,
  strategyMarkers: mergeStrategyMarkers,
  alertTriggers: mergeAlertTriggers,
  bgcolor: mergeBgcolor,
  barColors: mergeBarColors,
  tables: mergeTables,
};

// ── outputs (per-key append-or-update; plots' isNewBar replace-last) ──
function mergeOutputs(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const mergedPlots = prev.plots.map((plot) => {
    const diffKey = Object.keys(msg.outputs).find((k) => {
      const stripped = k.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
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
        perBarColors?.[perBarColors.length - 1] ?? plot.data[plot.data.length - 1]?.color;
      const isNewBar = (msg.barIndex ?? 0) >= plot.data.length;
      if (isNewBar) {
        // NOTE: `msg.barIndex!` is retained — the shared contract keeps
        // barIndex OPTIONAL (Frontend Lead carve-out), so normalize() cannot
        // make it present. The `?? 0` above handles the absent case for the
        // isNewBar check; the non-null assertion is needed for array indexing.
        const rawTime = msg.barTimestamps?.[msg.barIndex!];
        const newTime =
          rawTime !== undefined
            ? Math.floor(rawTime / 1000)
            : (plot.data[plot.data.length - 1]?.time ?? 0);
        return {
          ...plot,
          data: [...plot.data, { time: newTime, value: numValue, color }],
        };
      }
      const lastEntry = plot.data[plot.data.length - 1];
      if (lastEntry) {
        return {
          ...plot,
          data: [...plot.data.slice(0, -1), { ...lastEntry, value: numValue, color }],
        };
      }
    } else if ((msg.barIndex ?? 0) >= plot.data.length && plot.data.length > 0) {
      const lastEntry = plot.data[plot.data.length - 1];
      const rawTime = msg.barTimestamps?.[msg.barIndex!] ?? lastEntry?.time ?? 0;
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
  return { plots: mergedPlots };
}

// ── shapes (accumulate-dedupe by time) ──
function mergeShapes(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffShapes = mapShapes(msg.shapes);
  const mergedShapes =
    diffShapes.length > 0
      ? [
          ...prev.shapes.filter((s) => !diffShapes.some((d: ShapeData) => d.time === s.time)),
          ...diffShapes,
        ]
      : prev.shapes;
  return { shapes: mergedShapes };
}

// ── fills (accumulate-dedupe by [from, to]) ──
function mergeFills(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffFills = mapFills(msg.fills);
  const mergedFills =
    diffFills.length > 0
      ? [
          ...(prev.fills || []).filter(
            (f) => !diffFills.some((d: FillData) => d.from === f.from && d.to === f.to),
          ),
          ...diffFills,
        ]
      : prev.fills || [];
  return { fills: mergedFills };
}

// ── lines (accumulate-dedupe by points[0].time) ──
function mergeLines(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffLines = mapLines(msg.lines);
  const mergedLines =
    diffLines.length > 0
      ? [
          ...prev.lines.filter(
            (l) => !diffLines.some((d: LineData) => d.points[0]?.time === l.points[0]?.time),
          ),
          ...diffLines,
        ]
      : prev.lines;
  return { lines: mergedLines };
}

// ── linefills (accumulate-dedupe like lines/fills — a forming tick carries
//    ONLY newly-created fills, so replacing prev with the diff clobbers the
//    REST-accumulated fills on the first live tick) ──
function mergeLinefills(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffLinefills = msg.linefills || [];
  const mergedLinefills =
    diffLinefills.length > 0
      ? [
          ...(prev.linefills || []).filter(
            (lf) =>
              !diffLinefills.some(
                (d: LinefillData) => d.line1.x1 === lf.line1.x1 && d.line2.x1 === lf.line2.x1,
              ),
          ),
          ...diffLinefills,
        ]
      : prev.linefills || [];
  return { linefills: mergedLinefills };
}

// ── labels (accumulate-dedupe by time) ──
function mergeLabels(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffLabels = mapLabels(msg.labels);
  const mergedLabels =
    diffLabels.length > 0
      ? [
          ...prev.labels.filter((l) => !diffLabels.some((d: LabelData) => d.time === l.time)),
          ...diffLabels,
        ]
      : prev.labels;
  return { labels: mergedLabels };
}

// ── boxes (accumulate-dedupe by startTime) ──
function mergeBoxes(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const diffBoxes = mapBoxes(msg.boxes);
  const mergedBoxes =
    diffBoxes.length > 0
      ? [
          ...(prev.boxes || []).filter(
            (b) => !diffBoxes.some((d: BoxData) => d.startTime === b.startTime),
          ),
          ...diffBoxes,
        ]
      : prev.boxes || [];
  return { boxes: mergedBoxes };
}

// ── strategyMarkers (pure append, NO dedupe — dedupeKeys: []) ──
function mergeStrategyMarkers(
  prev: ScriptResult,
  msg: ExecutionResultMessage,
): Partial<ScriptResult> {
  const diffStrategyMarkers = mapStrategyMarkers(msg.strategyMarkers);
  const mergedStrategyMarkers = [...(prev.strategyMarkers || []), ...diffStrategyMarkers];
  return { strategyMarkers: mergedStrategyMarkers };
}

// ── alertTriggers (accumulate-dedupe by alertId+barIndex) ──
function mergeAlertTriggers(
  prev: ScriptResult,
  msg: ExecutionResultMessage,
): Partial<ScriptResult> {
  const diffAlertTriggers = msg.alertTriggers;
  const mergedAlertTriggers =
    diffAlertTriggers && diffAlertTriggers.length > 0
      ? (() => {
          const existingKeys = new Set(
            (prev.alertTriggers ?? []).map((t) => `${t.alertId}:${t.barIndex}`),
          );
          const dedupedNew = diffAlertTriggers.filter(
            (t) => !existingKeys.has(`${t.alertId}:${t.barIndex}`),
          );
          return dedupedNew.length > 0
            ? [...(prev.alertTriggers ?? []), ...dedupedNew]
            : prev.alertTriggers;
        })()
      : prev.alertTriggers;
  return { alertTriggers: mergedAlertTriggers };
}

// ── plotColors (tail-merge) ──
function mergePlotColors(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const incoming = msg.plotColors;
  // EMPTY-DIFF SKIP (B1 hazard fix): a diff carrying no per-bar colors must
  // NOT clobber the accumulated colors (B2 emits plotColors:{} on such ticks).
  if (!incoming || Object.keys(incoming).length === 0) {
    return { plotColors: prev.plotColors };
  }
  const mergedPlotColors = Object.entries(incoming).reduce(
    (acc, [key, colors]) => {
      const prevColors = prev.plotColors?.[key];
      if (prevColors) {
        acc[key] = [...prevColors.slice(0, -colors.length || undefined), ...colors];
      } else {
        acc[key] = colors;
      }
      return acc;
    },
    {} as Record<string, (string | null)[]>,
  );
  return { plotColors: mergedPlotColors };
}

// ── fillColorData (tail-merge + transformFillKey) ──
function mergeFillColorData(
  prev: ScriptResult,
  msg: ExecutionResultMessage,
): Partial<ScriptResult> {
  const incoming = msg.fillColorData;
  // EMPTY-DIFF SKIP (B1 hazard fix) — see mergePlotColors.
  if (!incoming || Object.keys(incoming).length === 0) {
    return { fillColorData: prev.fillColorData };
  }
  const mergedFillColorData = Object.entries(incoming).reduce(
    (acc, [key, colors]) => {
      const transformedKey = transformFillKey(key);
      const prevColors = prev.fillColorData?.[transformedKey];
      if (prevColors) {
        acc[transformedKey] = [...prevColors.slice(0, -colors.length || undefined), ...colors];
      } else {
        acc[transformedKey] = colors;
      }
      return acc;
    },
    { ...(prev.fillColorData || {}) } as Record<string, (string | null)[]>,
  );
  return { fillColorData: mergedFillColorData };
}

// ── barColors (time-map-merge + sort; empty diff already skipped) ──
function mergeBarColors(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const mergedBarColors = (() => {
    if (!msg.barColors || msg.barColors.length === 0) return prev.barColors;
    const prevColors = prev.barColors || [];
    const prevByTime = new Map(prevColors.map((c) => [c.time, c]));
    for (const b of msg.barColors) {
      prevByTime.set(b.time, {
        time: b.time,
        body: b.bodyColor ?? b.color,
        wick: b.wickColor,
        border: b.borderColor,
        offset: b.offset,
      });
    }
    const result = Array.from(prevByTime.values()).sort((a, b) => a.time - b.time);
    return result.length > 0 ? result : undefined;
  })();
  return { barColors: mergedBarColors };
}

// ── bgcolor (tail-merge with ms→s time conversion) ──
function mergeBgcolor(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const incoming = msg.bgcolor;
  // EMPTY-DIFF SKIP (B1 hazard fix) — an empty bgcolor diff must not clobber
  // the accumulated background colors.
  if (!incoming || incoming.length === 0) {
    return { bgcolor: prev.bgcolor };
  }
  const mergedBgcolor = [
    ...(prev.bgcolor || []).slice(0, incoming.length > 0 ? -incoming.length : undefined),
    ...incoming.map((b) => ({
      time: Math.floor(b.time / 1000),
      color: b.color,
    })),
  ];
  return { bgcolor: mergedBgcolor };
}

// ── tables (full replace; empty diff skipped) ──
function mergeTables(prev: ScriptResult, msg: ExecutionResultMessage): Partial<ScriptResult> {
  const incoming = msg.tables;
  // EMPTY-DIFF SKIP (B1 hazard fix): B2 emits tables:[] on diffs with no
  // table payload — replacing prev with [] would clobber accumulated tables.
  if (!incoming || incoming.length === 0) {
    return { tables: prev.tables };
  }
  return { tables: incoming };
}

// ---------------------------------------------------------------------------
// Generic accumulate-dedupe fallback
// ---------------------------------------------------------------------------

/** Resolve a dotted dedupe path (e.g. 'points[0].time') against an element. */
function resolveDedupePath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    const arrayAccess = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayAccess) {
      const arr = (acc as Record<string, unknown>)[arrayAccess[1]];
      return Array.isArray(arr) ? arr[Number(arrayAccess[2])] : undefined;
    }
    return (acc as Record<string, unknown>)[part];
  }, value);
}

/**
 * Generic accumulate-dedupe for fields declared with accumulate-dedupe
 * semantics but no custom strategy. Empty dedupeKeys = plain append with NO
 * dedupe (strategyMarkers behavior).
 */
function genericAccumulateDedupe<T>(
  prev: readonly T[] | undefined,
  incoming: readonly T[],
  dedupeKeys: readonly string[],
): T[] {
  if (incoming.length === 0) return [...(prev ?? [])];
  if (dedupeKeys.length === 0) return [...(prev ?? []), ...incoming];
  return [
    ...(prev ?? []).filter(
      (p) =>
        !incoming.some((d) =>
          dedupeKeys.every((key) => resolveDedupePath(d, key) === resolveDedupePath(p, key)),
        ),
    ),
    ...incoming,
  ];
}
