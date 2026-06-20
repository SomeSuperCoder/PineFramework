import { TARegistry } from './ta-registry.js';
import * as movingAverages from './moving-averages.js';
import * as oscillators from './oscillators.js';
import * as mathFunctions from './math-functions.js';

export class TAEngine {
  private registry: TARegistry;

  constructor() {
    this.registry = new TARegistry();
    this.registerAllFunctions();
  }

  private registerAllFunctions(): void {
    this.registry.register({
      name: 'sma',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.sma([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Simple Moving Average',
    });

    this.registry.register({
      name: 'ema',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.ema([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Exponential Moving Average',
    });

    this.registry.register({
      name: 'wma',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.wma([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Weighted Moving Average',
    });

    this.registry.register({
      name: 'vwma',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.vwma([source], [source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Volume Weighted Moving Average',
    });

    this.registry.register({
      name: 'rma',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.rma([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: "RMA (Wilder's Smoothing)",
    });

    this.registry.register({
      name: 'hma',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.hma([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Hull Moving Average',
    });

    this.registry.register({
      name: 'dema',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.dema([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Double Exponential Moving Average',
    });

    this.registry.register({
      name: 'tema',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.tema([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Triple Exponential Moving Average',
    });

    this.registry.register({
      name: 'linreg',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = movingAverages.linreg([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Linear Regression',
    });

    this.registry.register({
      name: 'correlation',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (source1: number, source2: number, length: number) => {
        const result = movingAverages.correlation([source1], [source2], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Pearson Correlation Coefficient',
    });

    this.registry.register({
      name: 'rsi',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = oscillators.rsi([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Relative Strength Index',
    });

    this.registry.register({
      name: 'macd',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (source: number, fast: number, slow: number) => {
        const result = oscillators.macd([source], fast, slow, 9);
        return result.macd[result.macd.length - 1] ?? NaN;
      },
      description: 'MACD Line',
    });

    this.registry.register({
      name: 'stoch',
      namespace: 'ta',
      minArgs: 4,
      maxArgs: 4,
      implementation: (high: number, low: number, close: number, length: number) => {
        const result = oscillators.stoch([high], [low], [close], length, 3);
        return result.k[result.k.length - 1] ?? NaN;
      },
      description: 'Stochastic Oscillator',
    });

    this.registry.register({
      name: 'stochrsi',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (source: number, rsiLength: number, stochLength: number) => {
        const result = oscillators.stochRsi([source], rsiLength, stochLength, 3, 3);
        return result.k[result.k.length - 1] ?? NaN;
      },
      description: 'Stochastic RSI',
    });

    this.registry.register({
      name: 'atr',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (high: number, low: number, close: number) => {
        const result = oscillators.atr([high], [low], [close], 14);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Average True Range',
    });

    this.registry.register({
      name: 'adx',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (high: number, low: number, close: number) => {
        const result = oscillators.adx([high], [low], [close], 14);
        return result.adx[result.adx.length - 1] ?? NaN;
      },
      description: 'Average Directional Index',
    });

    this.registry.register({
      name: 'cci',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (high: number, low: number, close: number) => {
        const result = oscillators.cci([high], [low], [close], 20);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Commodity Channel Index',
    });

    this.registry.register({
      name: 'mfi',
      namespace: 'ta',
      minArgs: 4,
      maxArgs: 4,
      implementation: (high: number, low: number, close: number, volume: number) => {
        const result = oscillators.mfi([high], [low], [close], [volume], 14);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Money Flow Index',
    });

    this.registry.register({
      name: 'obv',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (close: number, volume: number) => {
        const result = oscillators.obv([close], [volume]);
        return result[result.length - 1] ?? NaN;
      },
      description: 'On Balance Volume',
    });

    this.registry.register({
      name: 'vwap',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (high: number, low: number, close: number) => {
        const result = oscillators.vwap([high], [low], [close], [1]);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Volume Weighted Average Price',
    });

    this.registry.register({
      name: 'roc',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = oscillators.roc([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Rate of Change',
    });

    this.registry.register({
      name: 'mom',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = oscillators.momentum([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Momentum',
    });

    this.registry.register({
      name: 'highest',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.highest([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Highest value over length bars',
    });

    this.registry.register({
      name: 'lowest',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.lowest([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Lowest value over length bars',
    });

    this.registry.register({
      name: 'highestbars',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.highestBars([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Bar offset of highest value',
    });

    this.registry.register({
      name: 'lowestbars',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.lowestBars([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Bar offset of lowest value',
    });

    this.registry.register({
      name: 'sum',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.sum([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Sum over length bars',
    });

    this.registry.register({
      name: 'dev',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.dev([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Standard deviation',
    });

    this.registry.register({
      name: 'stdev',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.stdev([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Standard deviation',
    });

    this.registry.register({
      name: 'variance',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.variance([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Variance',
    });

    this.registry.register({
      name: 'rank',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.rank([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Rank',
    });

    this.registry.register({
      name: 'median',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.median([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Median',
    });

    this.registry.register({
      name: 'percentile',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (source: number, length: number, percentage: number) => {
        const result = mathFunctions.percentile([source], length, percentage);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Percentile',
    });

    this.registry.register({
      name: 'quantile',
      namespace: 'ta',
      minArgs: 3,
      maxArgs: 3,
      implementation: (source: number, length: number, q: number) => {
        const result = mathFunctions.quantile([source], length, q);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Quantile',
    });

    this.registry.register({
      name: 'zscore',
      namespace: 'ta',
      minArgs: 2,
      maxArgs: 2,
      implementation: (source: number, length: number) => {
        const result = mathFunctions.zscore([source], length);
        return result[result.length - 1] ?? NaN;
      },
      description: 'Z-Score',
    });
  }

  call(namespace: string, name: string, args: number[]): number {
    return this.registry.call(namespace, name, args);
  }

  getRegistry(): TARegistry {
    return this.registry;
  }

  getAvailableFunctions(): string[] {
    return this.registry.getFunctionNames();
  }
}
