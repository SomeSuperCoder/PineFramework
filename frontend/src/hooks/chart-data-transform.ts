/**
 * Data transformation pipelines for chart data.
 *
 * Transforms raw execution engine outputs into the ScriptResult format
 * consumed by the chart renderer. Also handles color assignment, metadata
 * stripping, and timestamp normalization.
 */

import type { ScriptResult } from '../types/index.js';
import { tokens } from '../theme/tokens.js';
import {
  transformShapes,
  transformLines,
  transformBoxes,
  transformLabels,
  transformFills,
  transformStrategyMarkers,
  transformBgColors,
  transformAlertConditions,
  transformAlertTriggers,
} from './chart-alert-processor.js';
// Shared execution-result contract (B1) — single source of truth for the
// WS message payload and REST response shapes. Re-exported below so existing
// callers (useChartData, indicator-merge) compile unchanged.
import type {
  ExecutionResultMessage,
  ExecuteResponse,
  EngineError,
} from 'pine-framework/contracts';

export type {
  ExecutionResultMessage,
  ExecuteResponse,
  EngineError,
} from 'pine-framework/contracts';

// Local aliases so buildScriptResult can use them
const mapShapes = transformShapes;
const mapLines = transformLines;
const mapBoxes = transformBoxes;
const mapLabels = transformLabels;
const mapFills = transformFills;
const mapStrategyMarkers = transformStrategyMarkers;
const mapBgColor = transformBgColors;
const mapAlertConditions = (
  conditions?: Array<{ id: string; title: string; message: string }> | null,
  formatContext?: { ticker?: string; interval?: string },
): Array<{ id: string; title: string; message: string }> =>
  transformAlertConditions(conditions, formatContext);
const mapAlertTriggers = transformAlertTriggers;

// ---------------------------------------------------------------------------
// Types matching the backend API response shape
//
// ExecutionResultMessage and ExecuteResponse now come from the shared
// pine-framework/contracts module (B1). They are re-exported above so the
// callers that imported them from this file compile unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COLORS = [
  tokens.colors.brand.blue,
  tokens.colors.semantic.warning,
  tokens.colors.semantic.success,
  '#e91e63',
  '#9c27b0',
  '#00bcd4',
  '#ff5722',
  '#607d8b',
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A render-safe normalized execute error: display string + optional metadata. */
export interface NormalizedEngineError {
  /** User-visible message (never a raw object). */
  message: string;
  /** 0-based bar index the error occurred at, when the wire carried one. */
  barIndex?: number;
}

/**
 * SINGLE SOURCE OF TRUTH for normalizing `ExecuteResponse.error` /
 * `ExecutionResultMessage.error` into a render-safe value. The backend sends
 * either a legacy string or the structured EngineError OBJECT
 * {message, barIndex, span?, stack?} raw over the wire
 * (backend/src/routes/execute.ts) — this mirrors the backend's own
 * toErrorMessage so user-visible strings stay identical:
 * string → itself; object with string message → that message; else 'Execution failed'.
 */
export function normalizeEngineError(
  err: string | EngineError | undefined | null,
): NormalizedEngineError {
  if (typeof err === 'string') return { message: err };
  if (err && typeof err === 'object' && typeof err.message === 'string') {
    return typeof err.barIndex === 'number'
      ? { message: err.message, barIndex: err.barIndex }
      : { message: err.message };
  }
  return { message: 'Execution failed' };
}

/** Strip line-width and style metadata suffixes from a plot title. */
export function stripMeta(s: string): string {
  return s
    .replace(/__lw:\d+/g, '')
    .replace(/__style:[^_]+/g, '')
    .trim();
}

/** Transform a fill color key by stripping metadata from each part. */
export function transformFillKey(rawKey: string): string {
  const parts = rawKey.split('::');
  return parts.map(stripMeta).join('::');
}

// ---------------------------------------------------------------------------
// Element transformation helpers (delegated to chart-alert-processor)
// ---------------------------------------------------------------------------

/** Re-exported for convenience */
export {
  transformShapes as mapShapes,
  transformLines as mapLines,
  transformLabels as mapLabels,
  transformBoxes as mapBoxes,
  transformFills as mapFills,
  transformStrategyMarkers as mapStrategyMarkers,
  transformBgColors as mapBgColor,
  transformAlertConditions as mapAlertConditions,
  transformAlertTriggers as mapAlertTriggers,
} from './chart-alert-processor.js';

// ---------------------------------------------------------------------------
// Main transformation pipeline
// ---------------------------------------------------------------------------

/**
 * Build a complete ScriptResult from raw execution engine outputs.
 * Handles plot data with metadata stripping, color assignment, and
 * timestamp normalization from milliseconds to seconds.
 */
export function buildScriptResult(
  overlay: boolean,
  outputs: Record<string, (number | string | boolean | null)[]>,
  shapes: ExecutionResultMessage['shapes'],
  fills: ExecutionResultMessage['fills'],
  strategyMarkers: ExecutionResultMessage['strategyMarkers'],
  ohlcvData: Array<{ timestamp: number }>,
  bgcolor?: ExecutionResultMessage['bgcolor'],
  plotColors?: Record<string, (string | null)[]>,
  fillColorData?: Record<string, (string | null)[]>,
  lines?: ExecutionResultMessage['lines'],
  labels?: ExecutionResultMessage['labels'],
  barTimestamps?: number[],
  alertConditions?: Array<{ id: string; title: string; message: string }>,
  alertTriggers?: Array<{
    alertId: string;
    barIndex: number;
    timestamp: number;
  }>,
  boxes?: ExecutionResultMessage['boxes'],
  tables?: import('../types/index.js').TableData[],
  hiddenPlotKeys?: string[],
  barColors?: ExecuteResponse['barColors'],
  formatContext?: { ticker?: string; interval?: string },
  linefills?: ExecutionResultMessage['linefills'],
  plotOverlayKeys?: string[],
  hlines?: ExecutionResultMessage['hlines'],
): ScriptResult {
  const getTimestamp = (i: number): number | undefined => {
    if (barTimestamps && i < barTimestamps.length) return barTimestamps[i]!;
    return ohlcvData[i]?.timestamp;
  };

  const plotData: import('../types/index.js').PlotData[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const lwMatch = key.match(/__lw:(\d+)/);
    const styleMatch = key.match(/__style:([^_]+)/);
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    const plotStyle = (
      styleMatch ? styleMatch[1] : 'line'
    ) as import('../types/index.js').PlotData['type'];
    const title = key.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const perBarColors = plotColors?.[key];
    const hasExplicitColor = perBarColors?.some((c) => c !== null && c !== undefined) ?? false;
    if (!hasExplicitColor) {
      plotColor = COLORS[colorIndex % COLORS.length];
      colorIndex++;
    } else {
      plotColor = perBarColors!.find((c) => c !== null && c !== undefined)!;
    }
    const mappedData: Array<{
      time: number;
      value: number | null;
      color: string | null | undefined;
    } | null> = values.map((v, i) => {
      const ts = getTimestamp(i);
      if (ts === undefined) return null;
      let numValue: number | null;
      if (v === null || v === undefined) {
        numValue = null;
      } else if (typeof v === 'boolean') {
        numValue = v ? 1 : 0;
      } else if (typeof v === 'number') {
        numValue = v;
      } else {
        numValue = null;
      }
      return {
        time: Math.floor(ts / 1000),
        value: numValue,
        color: perBarColors !== undefined ? (perBarColors[i] ?? plotColor) : undefined,
      };
    });
    plotData.push({
      type: plotStyle,
      data: mappedData.filter(
        (
          d,
        ): d is {
          time: number;
          value: number | null;
          color: string | null | undefined;
        } => d !== null,
      ),
      color: plotColor,
      lineWidth,
      title,
    });
  }

  // Hidden plot titles — plots with display=display.none
  const hiddenPlotTitles: string[] = (hiddenPlotKeys || []).map((key) => stripMeta(key));

  // Overlay plot titles — plots with force_overlay=true that go on the main chart
  const overlayPlotTitles: string[] = (plotOverlayKeys || []).map((key) => stripMeta(key));

  const transformedFillColorData: Record<string, (string | null)[]> = {};
  if (fillColorData) {
    for (const [key, colors] of Object.entries(fillColorData)) {
      transformedFillColorData[transformFillKey(key)] = colors;
    }
  }

  // Convert backend barColors (bodyColor/wickColor/borderColor) to ScriptResult format (body/wick/border)
  const transformedBarColors = barColors?.map((b) => ({
    time: b.time,
    body: b.bodyColor ?? b.color,
    wick: b.wickColor,
    border: b.borderColor,
    offset: b.offset,
  }));

  return {
    overlay,
    plots: plotData,
    shapes: mapShapes(shapes),
    lines: mapLines(lines),
    boxes: mapBoxes(boxes),
    labels: mapLabels(labels),
    fills: mapFills(fills),
    linefills: linefills || [],
    hlines: hlines || [],
    fillColorData: transformedFillColorData,
    plotColors: plotColors || {},
    strategyMarkers: mapStrategyMarkers(strategyMarkers),
    bgcolor: mapBgColor(bgcolor),
    alertConditions: mapAlertConditions(alertConditions, formatContext),
    alertTriggers: mapAlertTriggers(alertTriggers),
    tables: tables || [],
    hiddenPlotTitles: hiddenPlotTitles.length > 0 ? hiddenPlotTitles : undefined,
    overlayPlotTitles: overlayPlotTitles.length > 0 ? overlayPlotTitles : undefined,
    barColors:
      transformedBarColors && transformedBarColors.length > 0 ? transformedBarColors : undefined,
  };
}
