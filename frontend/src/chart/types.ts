export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PlotSeriesData {
  time: number;
  value: number | null;
  color?: string;
}

export interface ShapeMarkerData {
  time: number;
  position: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom' | 'absolute';
  shape: string;
  color: string;
  text?: string;
  textcolor?: string;
  barIndex?: number;
  price?: number;
  overlay?: boolean;
  paneIndex?: number;
}

export interface StrategyMarkerData {
  type: string;
  name: string;
  direction: string;
  timestamp: number;
  color: string;
  comment?: string;
  barIndex?: number;
}

export interface FillData {
  from: string;
  to: string;
  color: string;
}

export interface HLineData {
  price: number;
  color: string;
  style?: 'solid' | 'dotted' | 'dashed';
  width?: number;
}

export interface DrawingLineData {
  points: Array<{ time: number; price: number }>;
  color: string;
  width?: number;
  style?: 'solid' | 'dotted' | 'dashed';
  extend?: 'none' | 'left' | 'right' | 'both';
}

export interface LabelData {
  time: number;
  price: number;
  text: string;
  color?: string;
  textColor?: string;
  style?: string;
  size?: string;
}

export interface AlertTriggerData {
  alertId: string;
  barIndex: number;
  timestamp: number;
  title?: string;
  message?: string;
  destination?: string;
}

/**
 * Per-candle multi-element color override.
 * Each field is an optional hex string. Absent fields fall back to
 * the next in chain: element-specific → body → default bull/bear.
 */
export interface CandleColorData {
  body?: string;
  wick?: string;
  border?: string;
}

export interface BoxData {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  borderColor?: string;
  borderWidth?: number;
  backgroundColor?: string;
}

export interface ChartOptions {
  background?: string;
  textColor?: string;
  gridColor?: string;
  borderColor?: string;
  fontSize?: number;
  fontFamily?: string;
  barSpacing?: number;
  minBarSpacing?: number;
  maxBarSpacing?: number;
  volumeHeightRatio?: number;
  priceScaleWidth?: number;
  timeScaleHeight?: number;
}

export const DEFAULT_OPTIONS: Required<ChartOptions> = {
  background: '#0d0d18',
  textColor: '#c8c8d0',
  gridColor: '#181830',
  borderColor: '#151530',
  fontSize: 12,
  fontFamily: 'Arial, sans-serif',
  barSpacing: 8,
  minBarSpacing: 2,
  maxBarSpacing: 100,
  volumeHeightRatio: 0.2,
  priceScaleWidth: 70,
  timeScaleHeight: 30,
};

export interface TableCellData {
  text: string;
  text_color: string;
  text_halign: string;
  text_valign: string;
  bgcolor: string;
  width: number;
  text_size: string;
  tooltip: string;
}

export interface TableData {
  position: number;
  columns: number;
  rows: number;
  bgcolor: string;
  border_color: string;
  border_width: number;
  frame_color: string;
  frame_width: number;
  cells: Record<string, TableCellData>;
}
