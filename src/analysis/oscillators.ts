import { rma, ema as emaFunc, sma as smaFunc } from './moving-averages.js';

export function rsi(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      continue;
    }

    const change = source[i]! - source[i - 1]!;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  const avgGains = rma(gains, length);
  const avgLosses = rma(losses, length);

  return avgGains.map((gain, i) => {
    const loss = avgLosses[i];
    if (gain === undefined || loss === undefined || isNaN(gain) || isNaN(loss)) {
      return NaN;
    }
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  });
}

export function macd(
  source: number[],
  fastLength: number,
  slowLength: number,
  signalLength: number,
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEma = emaFunc(source, fastLength);
  const slowEma = emaFunc(source, slowLength);

  const macdLine: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const fast = fastEma[i];
    const slow = slowEma[i];
    if (fast === undefined || slow === undefined || isNaN(fast) || isNaN(slow)) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fast - slow);
    }
  }

  const signalLine = rma(macdLine, signalLength);

  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    const macdVal = macdLine[i];
    const signalVal = signalLine[i];
    if (macdVal === undefined || signalVal === undefined || isNaN(macdVal) || isNaN(signalVal)) {
      histogram.push(NaN);
    } else {
      histogram.push(macdVal - signalVal);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

export function stoch(
  high: number[],
  low: number[],
  close: number[],
  kSmooth: number,
  dSmooth: number,
): { k: number[]; d: number[] } {
  const rawK: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < kSmooth - 1) {
      rawK.push(NaN);
      continue;
    }

    let highest = -Infinity;
    let lowest = Infinity;

    for (let j = 0; j < kSmooth; j++) {
      const idx = i - j;
      highest = Math.max(highest, high[idx]!);
      lowest = Math.min(lowest, low[idx]!);
    }

    const range = highest - lowest;
    rawK.push(range === 0 ? 50 : ((close[i]! - lowest) / range) * 100);
  }

  const smoothedK = rma(rawK, dSmooth);
  const d = rma(smoothedK, dSmooth);

  return { k: smoothedK, d };
}

export function stochRsi(
  source: number[],
  rsiLength: number,
  stochLength: number,
  kSmooth: number,
  dSmooth: number,
): { k: number[]; d: number[] } {
  const rsiValues = rsi(source, rsiLength);

  const rawK: number[] = [];
  for (let i = 0; i < rsiValues.length; i++) {
    if (i < stochLength - 1 || isNaN(rsiValues[i]!)) {
      rawK.push(NaN);
      continue;
    }

    let highest = -Infinity;
    let lowest = Infinity;

    for (let j = 0; j < stochLength; j++) {
      const idx = i - j;
      const val = rsiValues[idx];
      if (val !== undefined && !isNaN(val)) {
        highest = Math.max(highest, val);
        lowest = Math.min(lowest, val);
      }
    }

    const range = highest - lowest;
    rawK.push(range === 0 ? 50 : ((rsiValues[i]! - lowest) / range) * 100);
  }

  const smoothedK = rma(rawK, kSmooth);
  const d = rma(smoothedK, dSmooth);

  return { k: smoothedK, d };
}

export function atr(high: number[], low: number[], close: number[], length: number): number[] {
  const tr: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr.push(high[i]! - low[i]!);
      continue;
    }

    const prevClose = close[i - 1]!;
    const hl = high[i]! - low[i]!;
    const hc = Math.abs(high[i]! - prevClose);
    const lc = Math.abs(low[i]! - prevClose);

    tr.push(Math.max(hl, Math.max(hc, lc)));
  }

  return rma(tr, length);
}

export function adx(
  high: number[],
  low: number[],
  close: number[],
  length: number,
): { adx: number[]; plusDi: number[]; minusDi: number[] } {
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr.push(high[i]! - low[i]!);
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }

    const prevClose = close[i - 1]!;
    const hl = high[i]! - low[i]!;
    const hc = Math.abs(high[i]! - prevClose);
    const lc = Math.abs(low[i]! - prevClose);
    tr.push(Math.max(hl, Math.max(hc, lc)));

    const upMove = high[i]! - high[i - 1]!;
    const downMove = low[i - 1]! - low[i]!;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothedTR = rma(tr, length);
  const smoothedPlusDM = rma(plusDM, length);
  const smoothedMinusDM = rma(minusDM, length);

  const plusDi: number[] = [];
  const minusDi: number[] = [];
  const dx: number[] = [];

  for (let i = 0; i < close.length; i++) {
    const str = smoothedTR[i];
    const spdm = smoothedPlusDM[i];
    const smdm = smoothedMinusDM[i];

    if (
      str === undefined ||
      spdm === undefined ||
      smdm === undefined ||
      isNaN(str) ||
      isNaN(spdm) ||
      isNaN(smdm) ||
      str === 0
    ) {
      plusDi.push(NaN);
      minusDi.push(NaN);
      dx.push(NaN);
      continue;
    }

    const pdi = (spdm / str) * 100;
    const mdi = (smdm / str) * 100;
    plusDi.push(pdi);
    minusDi.push(mdi);

    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }

  const adxValues = rma(dx, length);

  return { adx: adxValues, plusDi, minusDi };
}

export function bollingerBands(
  source: number[],
  length: number,
  mult: number,
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = smaFunc(source, length);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1 || isNaN(middle[i]!)) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }

    let sumSqDiff = 0;
    for (let j = 0; j < length; j++) {
      const diff = source[i - j]! - middle[i]!;
      sumSqDiff += diff * diff;
    }

    const stdDev = Math.sqrt(sumSqDiff / length);
    upper.push(middle[i]! + mult * stdDev);
    lower.push(middle[i]! - mult * stdDev);
  }

  return { upper, middle, lower };
}

export function cci(high: number[], low: number[], close: number[], length: number): number[] {
  const tp: number[] = [];
  for (let i = 0; i < close.length; i++) {
    tp.push((high[i]! + low[i]! + close[i]!) / 3);
  }

  const result: number[] = [];

  for (let i = 0; i < tp.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += tp[i - j]!;
    }
    const mean = sum / length;

    let sumAbsDev = 0;
    for (let j = 0; j < length; j++) {
      sumAbsDev += Math.abs(tp[i - j]! - mean);
    }
    const meanAbsDev = sumAbsDev / length;

    result.push(meanAbsDev === 0 ? 0 : (tp[i]! - mean) / (0.015 * meanAbsDev));
  }

  return result;
}

export function mfi(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  length: number,
): number[] {
  const tp: number[] = [];
  const mf: number[] = [];

  for (let i = 0; i < close.length; i++) {
    tp.push((high[i]! + low[i]! + close[i]!) / 3);
    mf.push(tp[i]! * volume[i]!);
  }

  const result: number[] = [];

  for (let i = 0; i < tp.length; i++) {
    if (i < length) {
      result.push(NaN);
      continue;
    }

    let positiveMF = 0;
    let negativeMF = 0;

    for (let j = 0; j < length; j++) {
      const idx = i - j;
      if (tp[idx]! > tp[idx - 1]!) {
        positiveMF += mf[idx]!;
      } else {
        negativeMF += mf[idx]!;
      }
    }

    const mfRatio = negativeMF === 0 ? 100 : positiveMF / negativeMF;
    result.push(100 - 100 / (1 + mfRatio));
  }

  return result;
}

export function obv(close: number[], volume: number[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      result.push(volume[i]!);
      continue;
    }

    if (close[i]! > close[i - 1]!) {
      result.push(result[i - 1]! + volume[i]!);
    } else if (close[i]! < close[i - 1]!) {
      result.push(result[i - 1]! - volume[i]!);
    } else {
      result.push(result[i - 1]!);
    }
  }

  return result;
}

export function vwap(high: number[], low: number[], close: number[], volume: number[]): number[] {
  const result: number[] = [];
  let cumTPV = 0;
  let cumVol = 0;

  for (let i = 0; i < close.length; i++) {
    const tp = (high[i]! + low[i]! + close[i]!) / 3;
    cumTPV += tp * volume[i]!;
    cumVol += volume[i]!;

    result.push(cumVol === 0 ? NaN : cumTPV / cumVol);
  }

  return result;
}

export function roc(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length || source[i - length] === 0) {
      result.push(NaN);
    } else {
      result.push(((source[i]! - source[i - length]!) / source[i - length]!) * 100);
    }
  }

  return result;
}

export function momentum(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length) {
      result.push(NaN);
    } else {
      result.push(source[i]! - source[i - length]!);
    }
  }

  return result;
}
