/**
 * Data transformation pipelines for chart data.
 *
 * Transforms raw execution engine outputs into the ScriptResult format
 * consumed by the chart renderer. Also handles color assignment, metadata
 * stripping, and timestamp normalization.
 */

import type { ScriptResult } from '../types';
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
} from './chart-alert-processor';

// Local aliases so buildScriptResult can use them
const mapShapes = transformShapes;
const mapLines = transformLines;
const mapBoxes = transformBoxes;
const mapLabels = transformLabels;
const mapFills = transformFills;
const mapStrategyMarkers = transformStrategyMarkers;
const mapBgColor = transformBgColors;
const mapAlertConditions = transformAlertConditions;
const mapAlertTriggers = transformAlertTriggers;

// ---------------------------------------------------------------------------
// Types matching the backend API response shape
// ---------------------------------------------------------------------------

export interface ExecuteResponse {
  success: boolean;
  error?: string;
  overlay: boolean;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes?: Array<{
    style: string;
    location: string;
    color: string;
    time: number;
    text: string;
    price?: number;
    overlay?: boolean;
  }>;
  fills?: Array<{ from: string; to: string; color: string }>;
  strategyMarkers?: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{
    points: Array<{ time: number; price: number }>;
    color: string;
    width?: number;
    style?: string;
    extend?: string;
  }>;
  labels?: Array<{
    time: number;
    price: number;
    text: string;
    color?: string;
    textColor?: string;
    style?: string;
    size?: string;
  }>;
  boxes?: Array<{
    startTime: number;
    startPrice: number;
    endTime: number;
    endPrice: number;
    borderColor?: string;
    backgroundColor?: string;
  }>;
  barTimestamps?: number[];
  maxLookback?: number;
  alertConditions?: Array<{ id: string; title: string; message: string }>;
  alertTriggers?: Array<{
    alertId: string;
    barIndex: number;
    timestamp: number;
  }>;
  tables?: import('../types').TableData[];
  hiddenPlotKeys?: string[];
}

export interface ExecutionResultMessage {
  success: boolean;
  error?: string;
  overlay: boolean;
  indicatorId?: string;
  outputs: Record<string, (number | string | boolean | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  fillColorData?: Record<string, (string | null)[]>;
  shapes: Array<{
    style: string;
    location: string;
    color: string;
    time: number;
    text: string;
    price?: number;
    overlay?: boolean;
  }>;
  fills: Array<{ from: string; to: string; color: string }>;
  strategyMarkers: Array<{
    type: string;
    name: string;
    direction: string;
    action: string;
    quantity: number;
    price: number;
    barIndex: number;
    timestamp: number;
    color: string;
    comment?: string;
  }>;
  bgcolor?: Array<{ time: number; color: string }>;
  lines?: Array<{
    points: Array<{ time: number; price: number }>;
    color: string;
    width?: number;
    style?: string;
  }>;
  labels?: Array<{
    time: number;
    price: number;
    text: string;
    color?: string;
    textColor?: string;
    style?: string;
    size?: string;
  }>;
  boxes?: Array<{
    startTime: number;
    startPrice: number;
    endTime: number;
    endPrice: number;
    borderColor?: string;
    backgroundColor?: string;
  }>;
  barTimestamps?: number[];
  formingCandle?: boolean;
  alertConditions?: Array<{ id: string; title: string; message: string }>;
  alertTriggers?: Array<{
    alertId: string;
    barIndex: number;
    timestamp: number;
  }>;
  barIndex: number;
  tables?: import('../types').TableData[];
  hiddenPlotKeys?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COLORS = [
  '#2196f3', '#ff9800', '#4caf50', '#e91e63',
  '#9c27b0', '#00bcd4', '#ff5722', '#607d8b',
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Strip line-width and style metadata suffixes from a plot title. */
export function stripMeta(s: string): string {
  return s.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '').trim();
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
} from './chart-alert-processor';

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
  tables?: import('../types').TableData[],
  hiddenPlotKeys?: string[],
): ScriptResult {
  const getTimestamp = (i: number): number | undefined => {
    if (barTimestamps && i < barTimestamps.length) return barTimestamps[i]!;
    return ohlcvData[i]?.timestamp;
  };

  const plotData: import('../types').PlotData[] = [];
  let colorIndex = 0;
  for (const [key, values] of Object.entries(outputs)) {
    let plotColor: string | undefined;
    let lineWidth: number | undefined;
    const lwMatch = key.match(/__lw:(\d+)/);
    const styleMatch = key.match(/__style:([^_]+)/);
    if (lwMatch) lineWidth = parseInt(lwMatch[1], 10);
    const plotStyle = (styleMatch
      ? styleMatch[1]
      : 'line') as import('../types').PlotData['type'];
    const title = key.replace(/__lw:\d+/g, '').replace(/__style:[^_]+/g, '');
    const perBarColors = plotColors?.[key];
    if (!plotColor) {
      plotColor = COLORS[colorIndex % COLORS.length];
    }
    colorIndex++;
    const mappedData: Array<{
      time: number;
      value: number | null;
      color: string | undefined;
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
        color: perBarColors?.[i] ?? undefined,
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
          color: string | undefined;
        } => d !== null,
      ),
      color: plotColor,
      lineWidth,
      title,
    });
  }

  // Hidden plot titles — plots with display=display.none
  const hiddenPlotTitles: string[] = (hiddenPlotKeys || []).map((key) =>
    stripMeta(key),
  );

  const transformedFillColorData: Record<string, (string | null)[]> = {};
  if (fillColorData) {
    for (const [key, colors] of Object.entries(fillColorData)) {
      transformedFillColorData[transformFillKey(key)] = colors;
    }
  }

  return {
    overlay,
    plots: plotData,
    shapes: mapShapes(shapes),
    lines: mapLines(lines),
    boxes: mapBoxes(boxes),
    labels: mapLabels(labels),
    fills: mapFills(fills),
    fillColorData: transformedFillColorData,
    plotColors: plotColors || {},
    strategyMarkers: mapStrategyMarkers(strategyMarkers),
    bgcolor: mapBgColor(bgcolor),
    alertConditions: mapAlertConditions(alertConditions),
    alertTriggers: mapAlertTriggers(alertTriggers),
    tables: tables || [],
    hiddenPlotTitles:
      hiddenPlotTitles.length > 0 ? hiddenPlotTitles : undefined,
  };
}
