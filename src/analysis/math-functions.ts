import { sma } from './moving-averages.js';

export function highest(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let max = -Infinity;
    for (let j = 0; j < length; j++) {
      max = Math.max(max, source[i - j]!);
    }
    result.push(max);
  }

  return result;
}

export function lowest(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let min = Infinity;
    for (let j = 0; j < length; j++) {
      min = Math.min(min, source[i - j]!);
    }
    result.push(min);
  }

  return result;
}

export function highestBars(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let max = -Infinity;
    let maxOffset = 0;
    for (let j = 0; j < length; j++) {
      if (source[i - j]! > max) {
        max = source[i - j]!;
        maxOffset = j;
      }
    }
    result.push(maxOffset);
  }

  return result;
}

export function lowestBars(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let min = Infinity;
    let minOffset = 0;
    for (let j = 0; j < length; j++) {
      if (source[i - j]! < min) {
        min = source[i - j]!;
        minOffset = j;
      }
    }
    result.push(minOffset);
  }

  return result;
}

export function sum(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let total = 0;
    for (let j = 0; j < length; j++) {
      total += source[i - j]!;
    }
    result.push(total);
  }

  return result;
}

export function cumSum(source: number[]): number[] {
  const result: number[] = [];
  let total = 0;

  for (let i = 0; i < source.length; i++) {
    total += source[i]!;
    result.push(total);
  }

  return result;
}

export function dev(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let sumVal = 0;
    for (let j = 0; j < length; j++) {
      sumVal += source[i - j]!;
    }
    const mean = sumVal / length;

    let sumSqDiff = 0;
    for (let j = 0; j < length; j++) {
      const diff = source[i - j]! - mean;
      sumSqDiff += diff * diff;
    }

    result.push(Math.sqrt(sumSqDiff / length));
  }

  return result;
}

export function variance(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let sumVal = 0;
    for (let j = 0; j < length; j++) {
      sumVal += source[i - j]!;
    }
    const mean = sumVal / length;

    let sumSqDiff = 0;
    for (let j = 0; j < length; j++) {
      const diff = source[i - j]! - mean;
      sumSqDiff += diff * diff;
    }

    result.push(sumSqDiff / length);
  }

  return result;
}

export function stdev(source: number[], length: number): number[] {
  return variance(source, length).map((v) => (isNaN(v) ? NaN : Math.sqrt(v)));
}

export function zscore(source: number[], length: number): number[] {
  const avg = sma(source, length);
  const sd = stdev(source, length);

  return source.map((val, i) => {
    const a = avg[i];
    const s = sd[i];
    if (a === undefined || s === undefined || isNaN(a) || isNaN(s) || s === 0) {
      return NaN;
    }
    return (val - a) / s;
  });
}

export function rank(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let count = 0;
    for (let j = 0; j < length; j++) {
      if (source[i - j]! < source[i]!) {
        count++;
      }
    }
    result.push(count / (length - 1));
  }

  return result;
}

export function quantile(source: number[], length: number, q: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    const window: number[] = [];
    for (let j = 0; j < length; j++) {
      window.push(source[i - j]!);
    }
    window.sort((a, b) => a - b);

    const index = q * (window.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const frac = index - lower;

    if (lower === upper) {
      result.push(window[lower]!);
    } else {
      result.push(window[lower]! * (1 - frac) + window[upper]! * frac);
    }
  }

  return result;
}

export function median(source: number[], length: number): number[] {
  return quantile(source, length, 0.5);
}

export function percentile(source: number[], length: number, percentage: number): number[] {
  return quantile(source, length, percentage / 100);
}

export function taMin(source: number[], length: number): number[] {
  return lowest(source, length);
}

export function taMax(source: number[], length: number): number[] {
  return highest(source, length);
}

export function taMedian(source: number[], length: number): number[] {
  return median(source, length);
}

export function taMode(source: number[], length: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    const counts = new Map<number, number>();
    let maxCount = 0;
    let mode = source[i]!;

    for (let j = 0; j < length; j++) {
      const val = source[i - j]!;
      const count = (counts.get(val) || 0) + 1;
      counts.set(val, count);
      if (count > maxCount) {
        maxCount = count;
        mode = val;
      }
    }

    result.push(mode);
  }

  return result;
}

export function taQuantile(source: number[], length: number, q: number): number[] {
  return quantile(source, length, q);
}

export function taPercentile(source: number[], length: number, percentage: number): number[] {
  return percentile(source, length, percentage);
}

export function taStdev(source: number[], length: number): number[] {
  return stdev(source, length);
}

export function taVariance(source: number[], length: number): number[] {
  return variance(source, length);
}

export function taAverage(source: number[], length: number): number[] {
  return sma(source, length);
}
