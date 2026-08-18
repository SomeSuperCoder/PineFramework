/**
 * PARITY ORACLE — legacy mergeDiffIntoResult, preserved VERBATIM.
 *
 * F2 (shared-contract refactor): the map-driven driver in
 * frontend/src/hooks/indicator-merge.ts replaced this implementation. This
 * file is NOT dead production code — it is a TEST FIXTURE for F3 parity tests,
 * which feed identical deterministic/random diffs to both this legacy function
 * and the new driver and assert identical output (modulo the documented
 * empty-diff-skip delta for tail-merge/replace strategies).
 *
 * The body below is the exact mergeDiffIntoResult as it existed before F2
 * (context: B1 contract landed, F1 type adoption landed). Only the export name
 * and import paths were adapted so it compiles standalone. Do NOT "fix" or
 * modernize this code — its entire purpose is to be the frozen legacy behavior.
 */
import type {
  ScriptResult,
  ShapeData,
  FillData,
  LineData,
  LinefillData,
  LabelData,
  BoxData,
} from '../../types/index.js';
import {
  transformFillKey,
  mapShapes,
  mapLines,
  mapLabels,
  mapBoxes,
  mapFills,
  mapStrategyMarkers,
} from '../../hooks/chart-data-transform.js';
import type { ExecutionResultMessage } from 'pine-framework/contracts';

/**
 * Merge a real-time diff message into an existing ScriptResult.
 *
 * WebSocket updates carry the latest tick value(s) for each output key.
 * This function replaces the last entry of each plot series with the new
 * value (forming candle update) or appends a new entry (new bar confirmed).
 * Shapes, fills, lines, labels, and boxes are deduped by timestamp.
 * Alert triggers use an ID+barIndex dedup key to avoid duplicates.
 */
export function legacyMergeDiffIntoResult(
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
        const rawTime = msg.barTimestamps?.[msg.barIndex!];
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
        msg.barTimestamps?.[msg.barIndex!] ?? (lastEntry?.time ?? 0);
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
            (s) => !diffShapes.some((d: ShapeData) => d.time === s.time),
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
                (d: FillData) => d.from === f.from && d.to === f.to,
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
                (d: LineData) => d.points[0]?.time === l.points[0]?.time,
              ),
          ),
          ...diffLines,
        ]
      : prev.lines;

  // ── Linefills (accumulate+dedupe like lines/fills — a forming tick carries
  //    ONLY newly-created fills, so replacing prev with the diff clobbers the
  //    REST-accumulated fills on the first live tick) ──
  const diffLinefills = msg.linefills || [];
  const mergedLinefills =
    diffLinefills.length > 0
      ? [
          ...(prev.linefills || []).filter(
            (lf) =>
              !diffLinefills.some(
                (d: LinefillData) =>
                  d.line1.x1 === lf.line1.x1 && d.line2.x1 === lf.line2.x1,
              ),
          ),
          ...diffLinefills,
        ]
      : prev.linefills || [];

  // ── Labels ──
  const diffLabels = mapLabels(msg.labels);
  const mergedLabels =
    diffLabels.length > 0
      ? [
          ...prev.labels.filter(
            (l) => !diffLabels.some((d: LabelData) => d.time === l.time),
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
  let mergedBgcolor = prev.bgcolor;
  if (msg.bgcolor) {
    const bg = msg.bgcolor;
    mergedBgcolor = [
      ...(prev.bgcolor || []).slice(0, bg.length > 0 ? -bg.length : undefined),
      ...bg.map((b) => ({
        time: Math.floor(b.time / 1000),
        color: b.color,
      })),
    ];
  }

  // ── Boxes ──
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

  // ── Alert triggers (deduped by alertId+barIndex) ──
  const diffAlertTriggers = msg.alertTriggers;
  const mergedAlertTriggers =
    diffAlertTriggers && diffAlertTriggers.length > 0
      ? (() => {
          const existingKeys = new Set(
            (prev.alertTriggers ?? []).map(
              (t) => `${t.alertId}:${t.barIndex}`,
            ),
          );
          const dedupedNew = diffAlertTriggers.filter(
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
    linefills: mergedLinefills,
  };
}