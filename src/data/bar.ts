export interface Bar {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface BarData {
  readonly symbol: string;
  readonly timeframe: string;
  readonly bars: Bar[];
}

export type Timeframe =
  | '1'
  | '3'
  | '5'
  | '15'
  | '30'
  | '45'
  | '60'
  | '120'
  | '180'
  | '240'
  | '360'
  | '720'
  | 'D'
  | 'W'
  | 'M'
  | '3M'
  | '6M'
  | '12M'
  | 'GA';

export function parseTimeframe(tf: string): number {
  const matchWithUnit = tf.match(/^(\d+)([SMHDW])$/);
  if (matchWithUnit) {
    const value = parseInt(matchWithUnit[1]!, 10);
    const unit = matchWithUnit[2];

    switch (unit) {
      case 'S':
        return value * 1000;
      case 'M':
        return value * 60 * 1000;
      case 'H':
        return value * 60 * 60 * 1000;
      case 'D':
        return value * 24 * 60 * 60 * 1000;
      case 'W':
        return value * 7 * 24 * 60 * 60 * 1000;
      default:
        return value * 60 * 1000;
    }
  }

  const matchNumber = tf.match(/^(\d+)$/);
  if (matchNumber) {
    const value = parseInt(matchNumber[1]!, 10);
    return value * 60 * 1000;
  }

  const singleLetterMap: Record<string, number> = {
    S: 1000,
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
    W: 7 * 24 * 60 * 60 * 1000,
  };

  if (singleLetterMap[tf]) {
    return singleLetterMap[tf];
  }

  throw new Error(`Invalid timeframe: ${tf}`);
}

export function timeframeToMinutes(tf: string): number {
  return parseTimeframe(tf) / (60 * 1000);
}

export function areTimeframesCompatible(source: string, target: string): boolean {
  const sourceMs = parseTimeframe(source);
  const targetMs = parseTimeframe(target);
  return targetMs % sourceMs === 0 || sourceMs % targetMs === 0;
}

export function createBar(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Bar {
  return { timestamp, open, high, low, close, volume };
}

export function validateBar(bar: Bar): boolean {
  if (bar.high < bar.low) return false;
  if (bar.open < bar.low || bar.open > bar.high) return false;
  if (bar.close < bar.low || bar.close > bar.high) return false;
  if (bar.volume < 0) return false;
  if (
    !Number.isFinite(bar.open) ||
    !Number.isFinite(bar.high) ||
    !Number.isFinite(bar.low) ||
    !Number.isFinite(bar.close) ||
    !Number.isFinite(bar.volume)
  )
    return false;
  return true;
}
