export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PineScriptError {
  type: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
}

export interface PlotData {
  type: 'line' | 'area' | 'histogram' | 'columns' | 'circles' | 'cross';
  data: Array<{ time: number; value: number | null }>;
  color?: string;
  lineWidth?: number;
  title?: string;
}

export interface ShapeData {
  type: 'arrowup' | 'arrowdown' | 'circle' | 'square' | 'diamond' | 'triangleup' | 'triangledown';
  time: number;
  price: number;
  color?: string;
  text?: string;
  location?: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom';
}

export interface LineData {
  points: Array<{ time: number; price: number }>;
  color?: string;
  width?: number;
  style?: 'solid' | 'dotted' | 'dashed';
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

export interface LabelData {
  time: number;
  price: number;
  text: string;
  color?: string;
  textColor?: string;
  style?: string;
  size?: string;
}

export interface ScriptResult {
  plots: PlotData[];
  shapes: ShapeData[];
  lines: LineData[];
  boxes: BoxData[];
  labels: LabelData[];
  bgcolor?: { time: number; color: string }[];
  barcolor?: { time: number; color: string }[];
  fills?: Array<{
    from: string;
    to: string;
    color: string;
  }>;
}
