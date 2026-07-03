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
  type: 'line' | 'stepline' | 'area' | 'areabr' | 'histogram' | 'columns' | 'circles' | 'cross';
  data: Array<{ time: number; value: number | null; color?: string }>;
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
  location?: 'abovebar' | 'belowbar' | 'top' | 'middle' | 'bottom' | 'absolute';
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

export interface AlertConditionData {
  id: string;
  title: string;
  message: string;
}

export interface ScriptResult {
  overlay: boolean;
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
  fillColorData?: Record<string, (string | null)[]>;
  plotColors?: Record<string, (string | null)[]>;
  strategyMarkers?: StrategyMarkerData[];
  alertConditions?: AlertConditionData[];
  alertTriggers?: AlertTriggerData[];
}

export interface TelegramSubscriber {
  chatId: number;
  hasAlertPreferences: boolean;
}

export interface TelegramConfig {
  botToken: string;
  subscribers: TelegramSubscriber[];
}

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
}

export interface AlertTriggerData {
  alertId: string;
  barIndex: number;
  timestamp: number;
}

export interface AlertMarkerData {
  id: string;
  time: number;
  title: string;
}

export interface StrategyMarkerData {
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

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageTradeDuration: number;
  commission: number;
}

export interface BacktestTrade {
  id: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  commission: number;
  entryName: string;
  exitName: string;
  mae: number;
  mfe: number;
  barsHeld: number;
}

export interface BacktestOrder {
  id: string;
  direction: string;
  action: string;
  type: string;
  quantity: number;
  price: number;
  fillPrice: number;
  fillTime: number;
  entryName: string;
  commission: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
  balance: number;
}

export interface BacktestJobResponse {
  job_id: string;
}

export interface BacktestStatusResponse {
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  error?: string;
  result_url?: string;
}

export interface BacktestResultResponse {
  metrics: BacktestMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
  trades: BacktestTrade[];
  orders: BacktestOrder[];
  equityPoints: EquityPoint[];
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
}

export interface BacktestConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  commissionType: 'percent' | 'fixed' | 'per_contract' | 'per_order';
  slippageType: 'percent' | 'ticks' | 'points';
  defaultQty: number;
  defaultQtyType: 'contracts' | 'percent_of_equity' | 'cash';
  pyramiding: number;
  marginLong: number;
  marginShort: number;
  currency: string;
}
