/**
 * LiveStrategyExecutor — bridges strategy signals to DEX orders for live trading.
 *
 * Executes Pine Script strategies on live market data, translating strategy
 * signals (entry/exit) into real DEX orders via the Jupiter swap adapter.
 *
 * @module trading
 */

import { StrategyEngine, type StrategyMarker } from '../strategy/strategy-engine.js';
import { ExecutionEngine } from '../language/runtime/execution-engine.js';
import { parse } from '../language/parser/index.js';
import { compile } from '../language/compiler/index.js';
import { createExecutionContextFromBar } from '../api.js';
import { DexAdapter, type SwapResult } from './dex/dex-adapter.js';
import { ClosedCandle, PairId } from './scheduler.js';
import type { WalletManager } from './wallet/wallet-manager.js';
import { USDC_MINT } from './solana-wallet.js';
import { getTokenInfo, isValidPairSymbol } from './token-registry.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ChaosSignalGenerator } from './chaos-signal-generator.js';

// ---- Constants ----

/** Chaos mode starting capital (10,000 USDC in lamports) so the simulated
 *  strategy engine has real margin to open entries and track equity. */
const CHAOS_INITIAL_CAPITAL_LAMPORTS = 10_000_000_000;

/**
 * Convert a strategy marker entry (from the ExecutionEngine runtime) into a
 * StrategyMarker. The runtime's entries drop the engine-internal `orderId`;
 * a placeholder is used since downstream consumers key on type/direction/
 * quantity/price/timestamp, not orderId.
 */
function toStrategyMarker(
  m: import('../language/runtime/execution-engine.js').StrategyMarkerEntry,
): StrategyMarker {
  return {
    type: m.type as StrategyMarker['type'],
    orderId: '',
    name: m.name,
    direction: m.direction as StrategyMarker['direction'],
    action: m.action as StrategyMarker['action'],
    quantity: m.quantity,
    price: m.price,
    barIndex: m.barIndex,
    timestamp: m.timestamp,
    color: m.color,
    comment: m.comment,
  };
}

// ---- Types ----

export interface LiveStrategyConfig {
  /** Strategy source code (Pine Script). */
  strategySource: string;
  /** DEX adapter for order execution. */
  dex: DexAdapter;
  /** Wallet manager for signing transactions. */
  walletManager: WalletManager;
  /** Trading pairs to execute on. */
  pairs: PairId[];
  /** Initial capital in USDC (smallest units). */
  initialCapital: bigint;
  /** Position size as percentage of available balance (0-100). */
  positionSizePercent: number;
  /** Data directory for state persistence. */
  dataDir?: string;
  /** Chaos signal generator. When provided, chaos mode is active and strategy is bypassed. */
  chaosGenerator?: ChaosSignalGenerator;
  /** Optional provider of historical bars used to seed each pair's strategy engine (warm start). */
  seedHistory?: (pair: PairId) => Promise<ClosedCandle[]>;
}

export interface StrategyState {
  /** Compiled Pine strategy runtime for real live execution (null in chaos mode). */
  runtime: ExecutionEngine | null;
  /** Programmatic strategy engine. Chaos mode drives it directly; the real path
   *  uses the runtime's internal engine. */
  engine: StrategyEngine | null;
  /** Current position for this strategy. */
  position: {
    symbol: string;
    direction: 'long' | 'short' | 'flat';
    quantity: number;
    entryPrice: number;
    entryTime: number;
  };
  /** Strategy variables state (for persistence). */
  variables: Record<string, unknown>;
  /** True once the historical seed has been consumed and live candles can produce signals. */
  warmUpComplete: boolean;
  /** Bar index of the next live bar to evaluate. */
  barIndex: number;
  /** Timestamp of the last bar fed to the engine (dedupe guard). */
  lastBarTimestamp: number;
}

export interface TradeSignal {
  /** Action to take. */
  action: 'buy' | 'sell' | 'close';
  /** Token symbol. */
  symbol: string;
  /** Quantity to trade. */
  quantity: number;
  /** Expected price (from strategy). */
  expectedPrice: number;
  /** Timestamp. */
  timestamp: number;
  /** Strategy marker metadata. */
  marker?: StrategyMarker;
  /** Pair timeframe — used to update the correct per-pair position state. */
  timeframe?: string;
}

export interface ExecutionResult {
  /** Whether the execution succeeded. */
  success: boolean;
  /** Trade signal that was executed. */
  signal: TradeSignal;
  /** DEX swap result. */
  swapResult?: SwapResult;
  /** Error message if failed. */
  error?: string;
}

// ---- LiveStrategyExecutor ----

/**
 * Executes Pine Script strategies on live market data.
 *
 * Features:
 * - Strategy compilation from Pine Script source
 * - Bar-by-bar execution on live candles
 * - Signal-to-order translation (buy → USDC→Asset, sell → Asset→USDC)
 * - Position size calculation based on available balance
 * - Strategy state persistence (series values, var variables)
 */
export class LiveStrategyExecutor {
  private config: LiveStrategyConfig;
  private strategyStates = new Map<string, StrategyState>();
  private stateFilePath: string;

  constructor(config: LiveStrategyConfig) {
    this.config = config;
    this.stateFilePath = path.join(config.dataDir ?? '.', 'strategy-state.json');
  }

  /**
   * Initialize strategy for a trading pair.
   * Compiles the configured Pine strategy source into a live `ExecutionEngine`
   * (real path) or creates the bare programmatic engine used by chaos mode.
   * Parse/compile failures throw so start() surfaces a descriptive error.
   */
  async initializeStrategy(pair: PairId): Promise<void> {
    const key = this.getPairKey(pair);

    const isChaos = this.config.chaosGenerator != null;

    let engine: StrategyEngine | null = null;
    let runtime: ExecutionEngine | null = null;

    if (isChaos) {
      // Chaos mode drives a bare programmatic engine with simulated margin.
      engine = new StrategyEngine({
        initialCapital: CHAOS_INITIAL_CAPITAL_LAMPORTS,
      });
    } else {
      runtime = this.compileStrategyRuntime();
      engine = runtime.getStrategyEngine();
    }

    // Initialize strategy state
    const state: StrategyState = {
      runtime,
      engine,
      position: {
        symbol: pair.symbol,
        direction: 'flat',
        quantity: 0,
        entryPrice: 0,
        entryTime: 0,
      },
      variables: {},
      warmUpComplete: false,
      barIndex: 0,
      lastBarTimestamp: 0,
    };

    this.strategyStates.set(key, state);
  }

  /** Parse and compile the configured Pine strategy source into a live runtime. */
  private compileStrategyRuntime(): ExecutionEngine {
    const source = this.config.strategySource;
    if (!source || source.trim() === '') {
      throw new Error('No strategy source configured for live trading.');
    }
    let parseResult;
    try {
      parseResult = parse(source);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse strategy source: ${message}`);
    }
    let compileResult;
    try {
      compileResult = compile(parseResult.ast);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to compile strategy source: ${message}`);
    }
    return new ExecutionEngine(compileResult);
  }

  /**
   * Process a live candle and generate trade signals.
   */
  async processCandle(candle: ClosedCandle): Promise<TradeSignal[]> {
    const key = this.getPairKey(candle);
    const state = this.strategyStates.get(key);

    if (!state) {
      throw new Error(`Strategy not initialized for ${key}`);
    }

    // Chaos mode: delegate to random signal generator instead of strategy
    if (this.config.chaosGenerator) {
      return this.processCandleChaos(candle);
    }

    if (!state.runtime) {
      // Indicator-only (non-strategy) source — no orders can be produced.
      console.warn(
        `[LiveStrategyExecutor] No strategy runtime for ${key} — source is not a strategy script; ignoring candle`,
      );
      return [];
    }

    // Warm start: if warm-up was not completed explicitly, complete it with an
    // empty seed so a live candle can still be evaluated (a caller that seeds
    // real history will have set warmUpComplete already).
    if (!state.warmUpComplete) {
      await this.warmUp({ symbol: candle.symbol, timeframe: candle.timeframe }, []);
    }

    // Dedupe guard: never feed the same candle twice (the engine must not be
    // double-advanced, which would corrupt series and marker state).
    if (state.lastBarTimestamp !== 0 && candle.timestamp <= state.lastBarTimestamp) {
      return [];
    }
    state.lastBarTimestamp = candle.timestamp;

    const barIndex = state.barIndex++;
    const context = createExecutionContextFromBar(candle, barIndex);
    const result = state.runtime.executeBar(context);

    if (!result.success) {
      const message = result.error?.message ?? 'strategy execution failed';
      throw new Error(`[LiveStrategyExecutor] ${key}: ${message}`);
    }

    const markers = (result.strategyMarkers ?? []).map(toStrategyMarker);
    const signals = this.markersToSignals(markers, candle, state);
    this.reconcilePosition(markers, state);
    return signals;
  }

  /**
   * Seed a pair's strategy engine with historical bars (warm start). Seed
   * markers are consumed without generating orders. Completes the warm-up so
   * subsequent live candles continue from an populated indicator/var state.
   */
  async warmUp(pair: PairId, bars: ClosedCandle[]): Promise<void> {
    const key = this.getPairKey(pair);
    const state = this.strategyStates.get(key);
    if (!state) {
      throw new Error(`Strategy not initialized for ${key}`);
    }

    if (!state.runtime) {
      // Chaos mode or non-strategy source — nothing to seed.
      state.warmUpComplete = true;
      return;
    }

    if (bars.length > 0) {
      const contexts = bars.map((bar, i) => createExecutionContextFromBar(bar, i));
      const result = state.runtime.executeBars(contexts);
      if (!result.success) {
        const message = result.error?.message ?? 'warm-up execution failed';
        throw new Error(`[LiveStrategyExecutor] Warm-up failed for ${key}: ${message}`);
      }
    }

    state.barIndex = bars.length;
    state.lastBarTimestamp = bars.length > 0 ? bars[bars.length - 1].timestamp : 0;
    state.warmUpComplete = true;
  }

  /** Whether every initialized strategy has completed warm-up. */
  isWarmUpComplete(): boolean {
    const states = Array.from(this.strategyStates.values());
    return states.length > 0 && states.every((s) => s.warmUpComplete);
  }

  /** Warm-up status keyed by pair key (symbol:timeframe). */
  getWarmUpStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [key, state] of this.strategyStates) {
      status[key] = state.warmUpComplete;
    }
    return status;
  }

  /**
   * Translate strategy engine markers into trade signals for the live path.
   * entry(long) → buy; exit/close → sell; entry(short) follows the spot-DEX
   * short interpretation (close-if-long, warn-if-flat/short).
   */
  private markersToSignals(
    markers: StrategyMarker[],
    candle: ClosedCandle,
    state: StrategyState,
  ): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const currentPrice = candle.close;

    for (const marker of markers) {
      if (marker.type === 'entry' && marker.direction === 'long') {
        signals.push({
          action: 'buy',
          symbol: candle.symbol,
          quantity: marker.quantity,
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
          marker,
          timeframe: candle.timeframe,
        });
      } else if (marker.type === 'entry' && marker.direction === 'short') {
        if (state.position.direction === 'long') {
          console.warn(
            `[LiveStrategyExecutor] Short signal received while long on ${candle.symbol} — closing position (spot DEX does not support short selling)`,
          );
          signals.push({
            action: 'close',
            symbol: candle.symbol,
            quantity: state.position.quantity,
            expectedPrice: currentPrice,
            timestamp: candle.timestamp,
            marker,
            timeframe: candle.timeframe,
          });
        } else if (state.position.direction === 'flat') {
          console.warn(
            `[LiveStrategyExecutor] Short signal received while flat on ${candle.symbol} — ignored (no position to close)`,
          );
        } else {
          console.warn(
            `[LiveStrategyExecutor] Short signal received while already short on ${candle.symbol} — ignored (spot DEX does not support short selling)`,
          );
        }
      } else if (marker.type === 'close' || marker.type === 'exit' || marker.type === 'close_all') {
        signals.push({
          action: 'sell',
          symbol: candle.symbol,
          quantity: marker.quantity,
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
          marker,
          timeframe: candle.timeframe,
        });
      }
    }

    return signals;
  }

  /** Reconcile the executor's position state from the emitted markers so it
   *  stays coherent with the strategy engine's position. */
  private reconcilePosition(markers: StrategyMarker[], state: StrategyState): void {
    for (const marker of markers) {
      if (marker.type === 'entry' && marker.direction === 'long') {
        state.position = {
          symbol: state.position.symbol,
          direction: 'long',
          quantity: marker.quantity,
          entryPrice: marker.price,
          entryTime: marker.timestamp,
        };
      } else if (
        marker.type === 'close' ||
        marker.type === 'exit' ||
        marker.type === 'close_all' ||
        (marker.type === 'entry' &&
          marker.direction === 'short' &&
          state.position.direction === 'long')
      ) {
        state.position = {
          symbol: state.position.symbol,
          direction: 'flat',
          quantity: 0,
          entryPrice: 0,
          entryTime: 0,
        };
      }
    }
  }

  /**
   * Execute a trade signal on the DEX.
   */
  async executeSignal(signal: TradeSignal): Promise<ExecutionResult> {
    try {
      // Get wallet keypair
      const keypairData = await this.config.walletManager.getKeypair();

      try {
        // Get current balance
        const balance = await this.config.dex.getBalance(USDC_MINT, keypairData.value.publicKey);
        const availableBalance = BigInt(balance.amount);

        // Check if we have enough balance
        if (signal.action === 'buy') {
          const requiredBalance = BigInt(Math.floor(signal.quantity * signal.expectedPrice));
          if (availableBalance < requiredBalance) {
            return {
              success: false,
              signal,
              error: `Insufficient USDC balance: have ${availableBalance}, need ${requiredBalance}`,
            };
          }
        }

        // Get quote from DEX
        const inputMint =
          signal.action === 'buy' ? USDC_MINT : this.getMintForSymbol(signal.symbol);
        const outputMint =
          signal.action === 'buy' ? this.getMintForSymbol(signal.symbol) : USDC_MINT;
        const amount = BigInt(
          Math.floor(signal.quantity * (signal.action === 'buy' ? signal.expectedPrice : 1)),
        );

        const quote = await this.config.dex.quote(inputMint, outputMint, amount, 50);

        // Execute swap
        const swapResult = await this.config.dex.swap(quote, keypairData.value.privateKey);

        if (!swapResult.success) {
          return {
            success: false,
            signal,
            swapResult,
            error: swapResult.error,
          };
        }

        // Update position state
        this.updatePositionState(signal, swapResult);

        return {
          success: true,
          signal,
          swapResult,
        };
      } finally {
        // Always dispose of the keypair after use
        keypairData.dispose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        signal,
        error: message,
      };
    }
  }

  /**
   * Get strategy state for persistence.
   */
  getState(): Record<string, StrategyState> {
    return Object.fromEntries(this.strategyStates);
  }

  /**
   * Restore strategy state from persistence.
   */
  setState(state: Record<string, StrategyState>): void {
    this.strategyStates = new Map(Object.entries(state));
  }

  /**
   * Get current position for a pair.
   */
  getPosition(pair: PairId): StrategyState['position'] | null {
    const key = this.getPairKey(pair);
    const state = this.strategyStates.get(key);
    return state?.position ?? null;
  }

  /**
   * Save strategy state to disk.
   */
  async saveState(): Promise<void> {
    const stateData = this.getState();

    // Convert Map to serializable object
    const serializableState: Record<string, any> = {};
    for (const [key, value] of Object.entries(stateData)) {
      serializableState[key] = {
        position: value.position,
        variables: value.variables,
        // Note: StrategyEngine instance cannot be serialized
        // In production, you'd need to serialize/deserialize the engine state
      };
    }

    // Ensure directory exists
    const dir = path.dirname(this.stateFilePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write state to file
    await writeFile(this.stateFilePath, JSON.stringify(serializableState, null, 2));
  }

  /**
   * Load strategy state from disk.
   */
  async loadState(): Promise<boolean> {
    try {
      if (!existsSync(this.stateFilePath)) {
        return false;
      }

      const data = await readFile(this.stateFilePath, 'utf-8');
      const stateData = JSON.parse(data) as Record<string, any>;

      // Restore state
      this.setState(stateData);
      return true;
    } catch (err) {
      console.error('Failed to load strategy state:', err);
      return false;
    }
  }

  /**
   * Clear saved strategy state.
   */
  async clearState(): Promise<void> {
    try {
      if (existsSync(this.stateFilePath)) {
        const { unlink } = await import('node:fs/promises');
        await unlink(this.stateFilePath);
      }
    } catch (err) {
      console.error('Failed to clear strategy state:', err);
    }
  }

  // ---- Chaos hot-swap ----

  /**
   * Hot-swap a ChaosSignalGenerator into a running executor.
   * Replaces the chaos generator and reinitializes each pair's strategy
   * engine to a bare StrategyEngine with chaos-mode capital, so the next
   * processCandle call immediately routes through the chaos path.
   *
   * WHY: Enables chaos mode without stopping the bar feed or scheduler.
   * The generator swap is atomic (single assignment) — no race condition
   * because JS is single-threaded.
   */
  setChaosGenerator(generator: ChaosSignalGenerator): void {
    this.config.chaosGenerator = generator;

    for (const pair of this.config.pairs) {
      const key = this.getPairKey(pair);
      const state = this.strategyStates.get(key);
      if (state) {
        state.engine = new StrategyEngine({
          initialCapital: CHAOS_INITIAL_CAPITAL_LAMPORTS,
        });
        state.runtime = null;
        state.warmUpComplete = true;
      }
    }
  }

  /**
   * Remove the chaos generator, falling back to the normal strategy path
   * on the next processCandle call.
   */
  clearChaosGenerator(): void {
    this.config.chaosGenerator = undefined;
  }

  // ---- Private Methods ----

  /**
   * Process a candle using chaos mode — drives a real StrategyEngine with
   * random long/short/exit actions so the resulting markers are produced by
   * the strategy engine itself, indistinguishable from a real strategy.
   */
  private async processCandleChaos(candle: ClosedCandle): Promise<TradeSignal[]> {
    const generator = this.config.chaosGenerator!;
    const pair: PairId = { symbol: candle.symbol, timeframe: candle.timeframe };
    const key = this.getPairKey(pair);

    // Ensure a strategy state exists so chaos drives a real engine per pair.
    let state = this.strategyStates.get(key);
    if (!state) {
      await this.initializeStrategy(pair);
      state = this.strategyStates.get(key)!;
    }

    const engine = state.engine;
    if (!engine) {
      throw new Error(`[LiveStrategyExecutor] Chaos mode requires a strategy engine for ${key}`);
    }
    const currentPrice = candle.close;

    // Advance the engine to this bar — fills any pending orders from the
    // previous candle so the engine's position reflects prior signals.
    engine.updateBar(
      candle.timestamp,
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    );

    // Current equity (engine tracks realized PnL); convert lamports → USDC.
    const equity = engine.getEquity() / 1e6;
    const chaosSignal = generator.generate(equity, candle.timestamp);
    const enginePosition = engine.getPosition();

    // Drive the real strategy engine. Markers follow real position-state
    // semantics: no marker is produced when the transition is impossible.
    switch (chaosSignal.action) {
      case 'long': {
        if (enginePosition.direction === 'flat') {
          // 10% of equity converted to token quantity (spec: fixed 10% sizing)
          const quantity = (equity * chaosSignal.sizeFraction) / currentPrice;
          engine.entry('Long', 'long', quantity);
        }
        break;
      }
      case 'short': {
        // Close existing position (spot DEX doesn't support short selling)
        if (enginePosition.direction === 'long') {
          engine.close('Short');
        }
        break;
      }
      case 'exit': {
        // Close existing position
        if (enginePosition.direction === 'long') {
          engine.close('Exit');
        }
        break;
      }
    }

    // Map genuine engine markers to trade signals (entry → buy, close → sell),
    // attaching the marker so it can be broadcast as the truth of this candle.
    const markers = engine.getNewMarkers();
    const signals: TradeSignal[] = [];
    for (const marker of markers) {
      if (marker.type === 'entry' && marker.direction === 'long') {
        signals.push({
          action: 'buy',
          symbol: candle.symbol,
          quantity: marker.quantity,
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
          marker,
        });
      } else if (marker.type === 'close' || marker.type === 'exit') {
        signals.push({
          action: 'sell',
          symbol: candle.symbol,
          quantity: marker.quantity,
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
          marker,
        });
      }
    }

    // Sync the executor's position state from the emitted markers so
    // downstream execution stays coherent with the engine.
    for (const marker of markers) {
      if (marker.type === 'entry' && marker.direction === 'long') {
        state.position = {
          symbol: candle.symbol,
          direction: 'long',
          quantity: marker.quantity,
          entryPrice: marker.price,
          entryTime: marker.timestamp,
        };
      } else if (marker.type === 'close' || marker.type === 'exit') {
        state.position = {
          symbol: candle.symbol,
          direction: 'flat',
          quantity: 0,
          entryPrice: 0,
          entryTime: 0,
        };
      }
    }

    return signals;
  }

  private getPairKey(pair: PairId): string {
    return `${pair.symbol}:${pair.timeframe}`;
  }

  private getMintForSymbol(symbol: string): string {
    // Use centralized registry for token addresses
    // Try as pair symbol first (e.g., "BTCUSDT"), then as base symbol (e.g., "BTC")
    if (isValidPairSymbol(symbol)) {
      return getTokenInfo(symbol).mint;
    }
    // Fallback: try to find by base symbol in the registry
    const pairSymbol = `${symbol}USDT`;
    if (isValidPairSymbol(pairSymbol)) {
      return getTokenInfo(pairSymbol).mint;
    }
    return USDC_MINT;
  }

  private updatePositionState(signal: TradeSignal, _swapResult: SwapResult): void {
    if (!signal.timeframe) {
      console.warn('[LiveStrategyExecutor] Cannot update position state: signal missing timeframe');
      return;
    }

    // States are keyed by `symbol:timeframe` (see getPairKey).
    const key = `${signal.symbol}:${signal.timeframe}`;
    const state = this.strategyStates.get(key);

    if (!state) {
      return;
    }

    if (signal.action === 'buy') {
      state.position = {
        symbol: signal.symbol,
        direction: 'long',
        quantity: signal.quantity,
        entryPrice: signal.expectedPrice,
        entryTime: signal.timestamp,
      };
    } else if (signal.action === 'sell' || signal.action === 'close') {
      state.position = {
        symbol: signal.symbol,
        direction: 'flat',
        quantity: 0,
        entryPrice: 0,
        entryTime: 0,
      };
    }
  }
}
