/**
 * Chart element transformation helpers.
 *
 * Pure functions for converting raw execution engine element data
 * (shapes, lines, labels, boxes, fills, strategy markers, alerts)
 * into the chart renderer's format.
 *
 * These are shared between the initial data pipeline (buildScriptResult)
 * and the runtime merge functions (prependIndicatorResult, mergeDiffIntoResult).
 */

import { stripMeta } from './chart-data-transform';

// ---------------------------------------------------------------------------
// Shape transformations
// ---------------------------------------------------------------------------

export interface RawShape {
  style: string;
  location: string;
  color: string;
  time: number;
  text: string;
  price?: number;
  overlay?: boolean;
  textcolor?: string;
}

export function transformShape(s: RawShape): import('../types').ShapeData {
  return {
    type: s.style as import('../types').ShapeData['type'],
    time: Math.floor(s.time / 1000),
    price: s.price ?? 0,
    color: s.color,
    text: s.text,
    textcolor: s.textcolor,
    location: s.location as import('../types').ShapeData['location'],
    overlay: s.overlay,
  };
}

export function transformShapes(
  shapes?: RawShape[] | null,
): import('../types').ShapeData[] {
  return (shapes || []).map(transformShape);
}

// ---------------------------------------------------------------------------
// Line transformations
// ---------------------------------------------------------------------------

export interface RawLinePoint {
  time: number;
  price: number;
}

export interface RawLine {
  points: RawLinePoint[];
  color: string;
  width?: number;
  style?: string;
  extend?: string;
}

export function transformLine(l: RawLine): import('../types').LineData {
  return {
    points: l.points.map((p) => ({
      time: Math.floor(p.time / 1000),
      price: p.price,
    })),
    color: l.color,
    width: l.width,
    style: l.style as 'solid' | 'dotted' | 'dashed' | undefined,
    extend: l.extend,
  };
}

export function transformLines(
  lines?: RawLine[] | null,
): import('../types').LineData[] {
  return (lines || []).map(transformLine);
}

// ---------------------------------------------------------------------------
// Label transformations
// ---------------------------------------------------------------------------

export interface RawLabel {
  time: number;
  price: number;
  text: string;
  color?: string;
  textColor?: string;
  style?: string;
  size?: string;
}

export function transformLabel(l: RawLabel): import('../types').LabelData {
  return {
    time: Math.floor(l.time / 1000),
    price: l.price,
    text: l.text,
    color: l.color,
    textColor: l.textColor,
    style: l.style,
    size: l.size,
  };
}

export function transformLabels(
  labels?: RawLabel[] | null,
): import('../types').LabelData[] {
  return (labels || []).map(transformLabel);
}

// ---------------------------------------------------------------------------
// Box transformations
// ---------------------------------------------------------------------------

export interface RawBox {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  borderColor?: string;
  backgroundColor?: string;
}

export function transformBox(b: RawBox): import('../types').BoxData {
  return {
    startTime: Math.floor(b.startTime / 1000),
    startPrice: b.startPrice,
    endTime: Math.floor(b.endTime / 1000),
    endPrice: b.endPrice,
    borderColor: b.borderColor,
    backgroundColor: b.backgroundColor,
  };
}

export function transformBoxes(
  boxes?: RawBox[] | null,
): import('../types').BoxData[] {
  return (boxes || []).map(transformBox);
}

// ---------------------------------------------------------------------------
// Fill transformations
// ---------------------------------------------------------------------------

export interface RawFill {
  from: string;
  to: string;
  color: string;
}

export function transformFill(f: RawFill): import('../types').FillData {
  return {
    from: stripMeta(f.from),
    to: stripMeta(f.to),
    color: f.color,
  };
}

export function transformFills(
  fills?: RawFill[] | null,
): import('../types').FillData[] {
  return (fills || []).map(transformFill);
}

// ---------------------------------------------------------------------------
// Strategy marker transformations
// ---------------------------------------------------------------------------

export interface RawStrategyMarker {
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
}

export function transformStrategyMarker(
  m: RawStrategyMarker,
): import('../types').StrategyMarkerData {
  return {
    type: m.type,
    name: m.name,
    direction: m.direction,
    action: m.action,
    quantity: m.quantity,
    price: m.price,
    barIndex: m.barIndex,
    timestamp: m.timestamp,
    color: m.color,
    comment: m.comment,
  };
}

export function transformStrategyMarkers(
  markers?: RawStrategyMarker[] | null,
): import('../types').StrategyMarkerData[] {
  return (markers || []).map(transformStrategyMarker);
}

// ---------------------------------------------------------------------------
// Background color transformations
// ---------------------------------------------------------------------------

export interface RawBgColor {
  time: number;
  color: string;
}

export function transformBgColor(
  b: RawBgColor,
): { time: number; color: string } {
  return { time: Math.floor(b.time / 1000), color: b.color };
}

export function transformBgColors(
  bgcolors?: RawBgColor[] | null,
): Array<{ time: number; color: string }> {
  return (bgcolors || []).map(transformBgColor);
}

// ---------------------------------------------------------------------------
// Alert condition / trigger transformations
// ---------------------------------------------------------------------------

export interface RawAlertCondition {
  id: string;
  title: string;
  message: string;
}

export function transformAlertCondition(
  a: RawAlertCondition,
): { id: string; title: string; message: string } {
  return { id: a.id, title: a.title, message: a.message };
}

export function transformAlertConditions(
  conditions?: RawAlertCondition[] | null,
): Array<{ id: string; title: string; message: string }> {
  return (conditions || []).map(transformAlertCondition);
}

export interface RawAlertTrigger {
  alertId: string;
  barIndex: number;
  timestamp: number;
}

export function transformAlertTrigger(
  t: RawAlertTrigger,
): { alertId: string; barIndex: number; timestamp: number } {
  return {
    alertId: t.alertId,
    barIndex: t.barIndex,
    timestamp: t.timestamp,
  };
}

export function transformAlertTriggers(
  triggers?: RawAlertTrigger[] | null,
): Array<{ alertId: string; barIndex: number; timestamp: number }> {
  return (triggers || []).map(transformAlertTrigger);
}
