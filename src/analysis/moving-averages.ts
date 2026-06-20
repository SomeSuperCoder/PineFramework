export function sma(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const result: number[] = [];
  let sum = 0;

  for (let i = 0; i < source.length; i++) {
    sum += source[i]!;
    if (i >= length) {
      sum -= source[i - length]!;
    }

    if (i >= length - 1) {
      result.push(sum / length);
    } else {
      result.push(NaN);
    }
  }

  return result;
}

export function ema(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const multiplier = 2 / (length + 1);
  const result: number[] = [];
  let prevEma: number | null = null;

  for (let i = 0; i < source.length; i++) {
    if (prevEma === null) {
      if (i < length - 1) {
        result.push(NaN);
        continue;
      }

      let sum = 0;
      for (let j = 0; j < length; j++) {
        sum += source[i - j]!;
      }
      prevEma = sum / length;
      result.push(prevEma);
    } else {
      prevEma = (source[i]! - prevEma) * multiplier + prevEma;
      result.push(prevEma);
    }
  }

  return result;
}

export function wma(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const result: number[] = [];
  const divisor = (length * (length + 1)) / 2;

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let weightedSum = 0;
    for (let j = 0; j < length; j++) {
      weightedSum += source[i - j]! * (length - j);
    }
    result.push(weightedSum / divisor);
  }

  return result;
}

export function vwma(source: number[], volume: number[], length: number): number[] {
  if (length <= 0 || source.length === 0 || volume.length === 0) {
    return source.map(() => NaN);
  }

  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let weightedSum = 0;
    let volumeSum = 0;

    for (let j = 0; j < length; j++) {
      const idx = i - j;
      weightedSum += source[idx]! * volume[idx]!;
      volumeSum += volume[idx]!;
    }

    result.push(volumeSum === 0 ? NaN : weightedSum / volumeSum);
  }

  return result;
}

export function rma(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const result: number[] = [];
  let prevRma: number | null = null;

  for (let i = 0; i < source.length; i++) {
    if (prevRma === null) {
      if (i < length - 1) {
        result.push(NaN);
        continue;
      }

      let sum = 0;
      for (let j = 0; j < length; j++) {
        sum += source[i - j]!;
      }
      prevRma = sum / length;
      result.push(prevRma);
    } else {
      prevRma = (prevRma * (length - 1) + source[i]!) / length;
      result.push(prevRma);
    }
  }

  return result;
}

export function hma(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const halfLength = Math.floor(length / 2);
  const sqrtLength = Math.floor(Math.sqrt(length));

  const wmaHalf = wma(source, halfLength);
  const wmaFull = wma(source, length);

  const diff: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const a = wmaHalf[i];
    const b = wmaFull[i];
    if (a === undefined || b === undefined || isNaN(a) || isNaN(b)) {
      diff.push(NaN);
    } else {
      diff.push(2 * a - b);
    }
  }

  return wma(diff, sqrtLength);
}

export function dema(source: number[], length: number): number[] {
  const ema1 = ema(source, length);
  const ema2 = ema(ema1, length);

  return ema1.map((v, i) => {
    const v2 = ema2[i];
    if (v === undefined || v2 === undefined || isNaN(v) || isNaN(v2)) {
      return NaN;
    }
    return 2 * v - v2;
  });
}

export function tema(source: number[], length: number): number[] {
  const ema1 = ema(source, length);
  const ema2 = ema(ema1, length);
  const ema3 = ema(ema2, length);

  return ema1.map((v, i) => {
    const v2 = ema2[i];
    const v3 = ema3[i];
    if (
      v === undefined ||
      v2 === undefined ||
      v3 === undefined ||
      isNaN(v) ||
      isNaN(v2) ||
      isNaN(v3)
    ) {
      return NaN;
    }
    return 3 * v - 3 * v2 + v3;
  });
}

export function linreg(source: number[], length: number): number[] {
  if (length <= 0 || source.length === 0) {
    return source.map(() => NaN);
  }

  const result: number[] = [];

  for (let i = 0; i < source.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let j = 0; j < length; j++) {
      const x = j;
      const y = source[i - j]!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (length * sumXY - sumX * sumY) / (length * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / length;

    result.push(intercept + slope * (length - 1));
  }

  return result;
}

export function correlation(source1: number[], source2: number[], length: number): number[] {
  if (length <= 0 || source1.length === 0 || source2.length === 0) {
    return source1.map(() => NaN);
  }

  const result: number[] = [];

  for (let i = 0; i < source1.length; i++) {
    if (i < length - 1) {
      result.push(NaN);
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let j = 0; j < length; j++) {
      const x = source1[i - j]!;
      const y = source2[i - j]!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const numerator = length * sumXY - sumX * sumY;
    const denominator = Math.sqrt((length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY));

    result.push(denominator === 0 ? NaN : numerator / denominator);
  }

  return result;
}
