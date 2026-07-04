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
  barIndex?: number;
  price?: number;
  overlay?: boolean;
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
  background: '#1a1a2e',
  textColor: '#e0e0e0',
  gridColor: '#2a2a4e',
  borderColor: '#0f3460',
  fontSize: 12,
  fontFamily: 'Arial, sans-serif',
  barSpacing: 8,
  minBarSpacing: 2,
  maxBarSpacing: 100,
  volumeHeightRatio: 0.2,
  priceScaleWidth: 70,
  timeScaleHeight: 30,
};
