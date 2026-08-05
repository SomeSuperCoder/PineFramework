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
import type { RiskManager } from './risk/risk-manager.js';
import type {
  ChaosExecutionMode,
  ChaosFailureReason,
  ChaosHeartbeat,
} from './types.js';

// ---- Constants ----

/**
 * Simulated equity floor for chaos mode when the real wallet balance is zero
 * or unreachable (D1). 10,000 USDC in smallest units (lamports) — matching
 * fetchUsdcBalance()/engine initialCapital units (1 USDC = 1e6 lamports) and
 * reintroducing the pre-balance-fetch documented floor. The floor keeps the
 * strategy machinery producing markers; DEX execution is NOT live-tested and
 * that caveat is reported loudly with the failure mode.
 */
const CHAOS_FALLBACK_EQUITY = 10_000_000_000;
/** CHAOS_FALLBACK_EQUITY in whole USDC, for log messages. */
const CHAOS_FALLBACK_EQUITY_USDC = CHAOS_FALLBACK_EQUITY / 1e6;

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
  /** Maximum daily realized loss in USDC. Trades below 1% of this are skipped as dust. */
  maxDailyLoss: number;
  /** Data directory for state persistence. */
  dataDir?: string;
  /** Chaos signal generator. When provided, chaos mode is active and strategy is bypassed. */
  chaosGenerator?: ChaosSignalGenerator;
  /** Optional provider of historical bars used to seed each pair's strategy engine (warm start). */
  seedHistory?: (pair: PairId) => Promise<ClosedCandle[]>;
  /**
   * Optional risk manager. When present, realized PnL from completed closing
   * trades and wallet-balance snapshots are fed to its guards. Optional so the
   * executor degrades gracefully (no risk tracking) when absent.
   */
  riskManager?: RiskManager;
  /**
   * Optional observer for per-candle chaos outcomes — the chaos heartbeat (D3).
   * Called once per processed candle in chaos mode with a signal / explicit
   * no-op reason / error outcome, so a running chaos mode is never silently
   * idle. Wired by BotEngine to its emitter for WS broadcast.
   */
  chaosHeartbeat?: (heartbeat: ChaosHeartbeat) => void;
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
  /**
   * Fraction of available USDC balance to spend on a buy. Chaos-originated
   * signals carry the chaos generator's fixed 0.1 (10% of equity) so on-chain
   * chaos buys stay at 10%; strategy signals omit it and fall back to the
   * configured positionSizePercent. Without this, chaos buys would use
   * positionSizePercent — bot-engine.ts defaults an unset config value to 100,
   * spending the whole wallet instead of 10% (QA blocker).
   */
  sizeFraction?: number;
  /**
   * Entry price of the position this signal closes, captured at generation
   * time (B1). The scheduler round-trip drops `timeframe`, and
   * reconcilePosition() flattens the executor's position state before the
   * signal executes, so the entry price must ride on the signal itself or the
   * realized-PnL feed is skipped on every close. Absent (undefined) when the
   * closing position is unknown — the PnL feed then fails safe (skips).
   */
  positionEntryPrice?: number;
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
  /**
   * Chaos execution mode: 'live' when the chaos engine is seeded with real
   * wallet funds, 'simulated' with the failure reason when the equity floor is
   * in use (D1/D2). Defaults to 'live' (no floor) when chaos is not active.
   */
  private chaosExecutionMode: { mode: ChaosExecutionMode; reason?: ChaosFailureReason } = {
    mode: 'live',
  };

  constructor(config: LiveStrategyConfig) {
    this.config = config;
    this.stateFilePath = path.join(config.dataDir ?? '.', 'strategy-state.json');
  }

  /**
   * Current chaos execution mode, for the bot snapshot (D1/D2): 'live' when
   * real wallet funds back the engine, 'simulated' with the failure reason
   * (`wallet-empty` | `rpc-unreachable`) when the equity floor is in use.
   */
  getChaosExecutionMode(): { mode: ChaosExecutionMode; reason?: ChaosFailureReason } {
    return this.chaosExecutionMode;
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

    let state: StrategyState;
    if (isChaos) {
      // Chaos mode drives a bare programmatic engine. Seed it with the real
      // wallet balance so equity reflects actual funds — or, when the balance
      // is zero/unreachable, with the documented simulated equity floor so the
      // engine machinery still produces markers instead of silent zero-qty
      // entries (D1/D2). The failure mode is logged loudly.
      const { seedEquity, mode } = await this.resolveChaosSeed();
      this.chaosExecutionMode = mode;
      state = this.createStrategyState(
        pair,
        null,
        new StrategyEngine({ initialCapital: seedEquity }),
      );
    } else {
      state = this.initializeStrategyNonChaos(pair);
    }

    this.strategyStates.set(key, state);
  }

  /**
   * Build a fresh StrategyState for a pair. Shared by initializeStrategy and
   * the chaos hot-swap rebuilds so every path constructs identical state.
   */
  private createStrategyState(
    pair: PairId,
    runtime: ExecutionEngine | null,
    engine: StrategyEngine | null,
  ): StrategyState {
    return {
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
  }

  /**
   * Initialize a pair through the non-chaos path: compile the Pine runtime and
   * drive the engine from it. Shared by initializeStrategy and
   * clearChaosGenerator so disabling chaos rebuilds exactly what a cold start
   * would build (D5). Parse/compile failures throw.
   */
  private initializeStrategyNonChaos(pair: PairId): StrategyState {
    const runtime = this.compileStrategyRuntime();
    return this.createStrategyState(pair, runtime, runtime.getStrategyEngine());
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
            // B1: attach the entry price of the position being closed now —
            // reconcilePosition() flattens it right after generation.
            positionEntryPrice:
              state.position.direction === 'long' && state.position.entryPrice > 0
                ? state.position.entryPrice
                : undefined,
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
          // B1: same snapshot-at-generation capture as the short-close above.
          positionEntryPrice:
            state.position.direction === 'long' && state.position.entryPrice > 0
              ? state.position.entryPrice
              : undefined,
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
      // Risk gate (R-gate): enforce before ANY buy proceeds — before balance
      // fetch or quote construction. Every signal (chaos + strategy) flows
      // through here via submitOrders, so gating at this single choke point
      // makes the risk manager effective: daily-loss / rolling / wallet-balance
      // guards and the emergency-stop flag actually block new entries.
      if (
        signal.action === 'buy' &&
        this.config.riskManager &&
        !this.config.riskManager.canEnterPosition()
      ) {
        return {
          success: false,
          signal,
          error: 'Entry blocked by risk controls',
        };
      }

      // Get wallet keypair
      const keypairData = await this.config.walletManager.getKeypair();

      try {
        // Get current balance
        const balance = await this.config.dex.getBalance(USDC_MINT, keypairData.value.publicKey);
        const availableBalance = BigInt(balance.amount);
        const availableBalanceUsdc = Number(availableBalance) / 1e6;

        // Buy input = position fraction of the available balance in WHOLE USDC.
        // Deliberately NO price division — the DEX contract takes the input
        // amount in the input token's smallest units (micro-USDC), and the old
        // `(balance * fraction) / price` mis-sized buys by ~1/price, producing
        // dust trades on the live path.
        // The fraction is signal-first: chaos-originated signals carry their
        // own sizeFraction (fixed 0.1 = 10% of equity per spec), so chaos buys
        // stay at 10% even when positionSizePercent is unset — bot-engine.ts
        // defaults it to 100, which would otherwise spend the whole wallet (QA
        // blocker). Strategy signals omit sizeFraction and fall back to the
        // configured positionSizePercent.
        const positionFraction = signal.sizeFraction ?? this.config.positionSizePercent / 100;
        const usdcAmount = signal.action === 'buy' ? availableBalanceUsdc * positionFraction : 0;

        // Dust guard: skip trades below 1% of maxDailyLoss (SSOT from config).
        // Compares whole-USDC usdcAmount against the whole-USDC threshold —
        // consistent units (the old guard multiplied by expectedPrice and
        // compared token-quantity × price against a USDC threshold).
        const minTradeUsdc = this.config.maxDailyLoss * 0.01;

        console.log(
          `[LiveStrategyExecutor] executeSignal: action=${signal.action} ` +
            `balance=${availableBalanceUsdc} USDC ` +
            `usdcAmount=${usdcAmount.toFixed(6)} USDC ` +
            `price=${signal.expectedPrice} ` +
            `minTrade=${minTradeUsdc.toFixed(2)} USDC`,
        );

        if (signal.action === 'buy' && usdcAmount < minTradeUsdc) {
          console.warn(
            `[LiveStrategyExecutor] Skipping trade: swap amount ${usdcAmount.toFixed(6)} USDC ` +
              `(< ${minTradeUsdc.toFixed(2)} USDC minimum)`,
          );
          return {
            success: false,
            signal,
            error: `Swap amount below minimum trade size: ${usdcAmount.toFixed(6)} USDC`,
          };
        }

        // Resolve the traded token's mint/decimals once (used for the buy
        // output mint and the sell input amount).
        const tokenInfo = this.getTokenInfoForSymbol(signal.symbol);

        // Buy: input amount in micro-USDC (USDC has 6 decimals → × 1_000_000).
        // Sell: input amount in the token's smallest units (10^decimals) so a
        // fractional quantity (e.g. 0.02 ETH) sends real lamports instead of
        // flooring to zero.
        const amount =
          signal.action === 'buy'
            ? BigInt(Math.floor(usdcAmount * 1_000_000))
            : BigInt(Math.floor(signal.quantity * 10 ** tokenInfo.decimals));

        // Insufficient-balance guard: compare micro-to-micro (consistent
        // units). The buy amount derives from the same balance fetch, so this
        // only trips when positionSizePercent > 100 or the balance moves
        // between fetch and quote — kept as a cheap safety net.
        if (signal.action === 'buy' && availableBalance < amount) {
          return {
            success: false,
            signal,
            error: `Insufficient USDC balance: have ${availableBalance}, need ${amount}`,
          };
        }

        // Get quote from DEX
        const inputMint = signal.action === 'buy' ? USDC_MINT : tokenInfo.mint;
        const outputMint = signal.action === 'buy' ? tokenInfo.mint : USDC_MINT;

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

        // Feed the risk manager: realized PnL (for closing trades) plus a fresh
        // wallet-balance snapshot. Both are fail-safe — a fetch failure never
        // blocks the completed trade and never feeds an unusable value (D5/D6).
        await this.recordClosedTradeRisk(signal);

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
    const serializableState: Record<string, Pick<StrategyState, 'position' | 'variables'>> = {};
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
      const stateData = JSON.parse(data) as Record<string, StrategyState>;

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
   * engine to a bare StrategyEngine seeded with the real wallet balance — or
   * the simulated equity floor when the balance is zero/unreachable (D1/D2) —
   * so the next processCandle call immediately routes through the chaos path.
   *
   * WHY: Enables chaos mode without stopping the bar feed or scheduler.
   * The generator swap is atomic (single assignment) — no race condition
   * because JS is single-threaded.
   */
  async setChaosGenerator(generator: ChaosSignalGenerator): Promise<void> {
    this.config.chaosGenerator = generator;

    // Resolve the seed equity once for all pairs (avoids N sequential RPC
    // calls) — real balance or the floor with a loud failure mode.
    const { seedEquity, mode } = await this.resolveChaosSeed();
    this.chaosExecutionMode = mode;

    for (const pair of this.config.pairs) {
      const key = this.getPairKey(pair);
      const state = this.strategyStates.get(key);
      if (state) {
        state.engine = new StrategyEngine({
          initialCapital: seedEquity,
        });
        state.runtime = null;
        state.warmUpComplete = true;
      }
    }
  }

  /**
   * Remove the chaos generator and rebuild each pair's strategy state through
   * the non-chaos initialization path (compile runtime + engine), so disabling
   * chaos resumes real strategy execution instead of silently producing no
   * signals (D5).
   *
   * Atomic: if any pair fails to compile, the chaos generator is restored and
   * the error propagates — the bot keeps running chaos rather than dying or
   * silently stopping all trading.
   */
  async clearChaosGenerator(): Promise<void> {
    const previousGenerator = this.config.chaosGenerator;
    this.config.chaosGenerator = undefined;

    try {
      // A chaos-only config may carry no strategy source (configure allows
      // omitting it in chaos mode). The non-chaos rebuild below cannot compile
      // a runtime in that case — degrade each pair to an indicator-only state
      // instead of throwing. Throwing would roll the toggle back and trap the
      // bot in chaos mode permanently (the silent-vanish trap D5 removes); a
      // null runtime is already an explicit no-op in processCandle.
      const source = this.config.strategySource;
      const hasStrategySource = !!source && source.trim() !== '';
      for (const pair of this.config.pairs) {
        const key = this.getPairKey(pair);
        if (!this.strategyStates.has(key)) continue;
        // Non-chaos branch of initializeStrategy: fresh state — chaos
        // simulation positions must not leak into the real strategy.
        this.strategyStates.set(
          key,
          hasStrategySource
            ? this.initializeStrategyNonChaos(pair)
            : this.createStrategyState(pair, null, null),
        );
      }
      // Chaos no longer backs the engine — no equity floor is in effect.
      this.chaosExecutionMode = { mode: 'live' };
    } catch (err) {
      this.config.chaosGenerator = previousGenerator;
      throw err;
    }
  }

  /**
   * Capture the wallet's USDC balance and feed it to the risk manager's
   * wallet-balance guard. No-op when no risk manager is configured.
   *
   * Called by BotEngine once per closed candle (D6) and after each completed
   * trade (via recordClosedTradeRisk).
   *
   * Fail-safe (D5): any fetch failure — or a zero/unusable balance returned by
   * a stub adapter — is logged and skipped. A failed or zero value MUST never
   * reach recordBalance: treating an RPC error as "wallet emptied" would
   * false-trigger an emergency stop (jupiter-ultra always returns zero).
   */
  async captureBalanceSnapshot(): Promise<void> {
    const riskManager = this.config.riskManager;
    if (!riskManager) return;
    // R4: skip the RPC entirely when the wallet-balance guard is disabled —
    // a fetch here would otherwise run once per candle for zero benefit (and
    // warn on zero-returning adapters like jupiter-ultra). The after-trade
    // PnL recording (recordTrade) is unaffected and still runs regardless.
    if (!riskManager.isWalletBalanceEnabled) return;

    try {
      const balance = await this.fetchUsdcBalance();
      if (balance <= 0n) {
        console.warn(
          '[LiveStrategyExecutor] Balance snapshot is zero/unusable — skipping guard evaluation',
        );
        return;
      }
      riskManager.recordBalance(balance);
    } catch (err) {
      console.warn(
        '[LiveStrategyExecutor] Balance snapshot fetch failed — skipping guard evaluation',
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  // ---- Private Methods ----

  /**
   * Fetch the wallet's current USDC balance in smallest units.
   * Shared by chaos-mode initialization and hot-swap so both paths use
   * the real on-chain balance instead of a hardcoded constant.
   */
  private async fetchUsdcBalance(): Promise<bigint> {
    const keypairData = await this.config.walletManager.getKeypair();
    try {
      const balance = await this.config.dex.getBalance(USDC_MINT, keypairData.value.publicKey);
      return BigInt(balance.amount);
    } finally {
      keypairData.dispose();
    }
  }

  /**
   * Resolve the chaos engine's seed equity and execution mode (D1/D2).
   *
   * A genuine empty wallet (verified 0 balance) and an unreachable RPC both
   * fall back to CHAOS_FALLBACK_EQUITY so the strategy machinery keeps
   * producing markers, but they are logged with distinct failure modes
   * (`wallet-empty` vs `rpc-unreachable`) and the loud caveat that the
   * execution layer is NOT live-tested. Returns 'live' when real funds back
   * the engine.
   */
  private async resolveChaosSeed(): Promise<{
    seedEquity: number;
    mode: { mode: ChaosExecutionMode; reason?: ChaosFailureReason };
  }> {
    let realBalance: bigint;
    try {
      realBalance = await this.fetchUsdcBalance();
    } catch (err) {
      // D2: the adapter now throws on transport errors instead of returning
      // '0', so "RPC down" is distinguishable from "wallet empty".
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[LiveStrategyExecutor] Chaos mode: USDC balance unreachable (RPC/transport error) — ` +
          `seeding simulated equity floor ${CHAOS_FALLBACK_EQUITY_USDC} USDC; ` +
          `execution layer NOT live-tested (failure mode: rpc-unreachable)`,
        { error: message },
      );
      return {
        seedEquity: CHAOS_FALLBACK_EQUITY,
        mode: { mode: 'simulated', reason: 'rpc-unreachable' },
      };
    }

    if (realBalance <= 0n) {
      console.warn(
        `[LiveStrategyExecutor] Chaos mode: real USDC balance is zero — seeding simulated ` +
          `equity floor ${CHAOS_FALLBACK_EQUITY_USDC} USDC; execution layer NOT live-tested ` +
          `(failure mode: wallet-empty)`,
      );
      return {
        seedEquity: CHAOS_FALLBACK_EQUITY,
        mode: { mode: 'simulated', reason: 'wallet-empty' },
      };
    }

    console.log(
      `[LiveStrategyExecutor] Chaos mode: real USDC balance = ${realBalance} ` +
        `(${Number(realBalance) / 1e6} USDC) — live execution`,
    );
    return { seedEquity: Number(realBalance), mode: { mode: 'live' } };
  }

  /**
   * Process a candle using chaos mode — drives a real StrategyEngine with
   * random long/short/exit actions so the resulting markers are produced by
   * the strategy engine itself, indistinguishable from a real strategy.
   *
   * Emits a per-candle heartbeat (D3): every processed candle reports an
   * observable outcome — a signal, an explicit no-op reason, or an error — so
   * a running chaos mode is never silently idle.
   */
  private async processCandleChaos(candle: ClosedCandle): Promise<TradeSignal[]> {
    const emitHeartbeat = (hb: {
      outcome: ChaosHeartbeat['outcome'];
      action?: ChaosHeartbeat['action'];
      reason?: string;
    }): void => {
      this.config.chaosHeartbeat?.({
        pair: `${candle.symbol}:${candle.timeframe}`,
        timeframe: candle.timeframe,
        candleTimestamp: candle.timestamp,
        ...hb,
      });
    };

    try {
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
      // semantics: no marker is produced when the transition is impossible —
      // that is an explicit no-op outcome, not an error (D3).
      let noopReason: string | undefined;
      switch (chaosSignal.action) {
        case 'long': {
          if (enginePosition.direction === 'flat') {
            // 10% of equity converted to token quantity (spec: fixed 10% sizing)
            const quantity = (equity * chaosSignal.sizeFraction) / currentPrice;
            if (quantity <= 0) {
              // D1: never drive engine.entry with qty <= 0 — it produces no
              // marker and silently starves signals (e.g. zero equity or a
              // non-positive candle price). Skip with an explicit reason.
              noopReason = `zero/negative entry quantity (equity=${equity.toFixed(2)}, price=${currentPrice})`;
            } else {
              engine.entry('Long', 'long', quantity);
            }
          } else {
            noopReason = `long while already ${enginePosition.direction} (impossible transition)`;
          }
          break;
        }
        case 'short': {
          // Close existing position (spot DEX doesn't support short selling)
          if (enginePosition.direction === 'long') {
            engine.close('Short');
          } else {
            noopReason = `short while ${enginePosition.direction} (impossible transition)`;
          }
          break;
        }
        case 'exit': {
          // Close existing position
          if (enginePosition.direction === 'long') {
            engine.close('Exit');
          } else {
            noopReason = `exit while ${enginePosition.direction} (impossible transition)`;
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
            // Carry the chaos sizing fraction through to executeSignal so the
            // on-chain buy matches the engine's simulated quantity (which is
            // sized from chaosSignal.sizeFraction — see entry above). Without
            // this, the executor sizes the buy from positionSizePercent (default
            // 100) and spends the whole wallet (QA blocker).
            sizeFraction: chaosSignal.sizeFraction,
          });
        } else if (marker.type === 'close' || marker.type === 'exit') {
          signals.push({
            action: 'sell',
            symbol: candle.symbol,
            quantity: marker.quantity,
            expectedPrice: currentPrice,
            timestamp: candle.timestamp,
            marker,
            // B1: the executor's position state is still the pre-close state
            // here (the marker sync below runs after signal generation) — attach
            // the entry price of the tracked long being closed, or leave absent
            // so the PnL feed fails safe (skips) when unknown.
            positionEntryPrice:
              state.position.direction === 'long' && state.position.entryPrice > 0
                ? state.position.entryPrice
                : undefined,
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

      // Per-candle heartbeat (D3): signal or explicit no-op — never silent.
      if (signals.length > 0) {
        emitHeartbeat({ outcome: 'signal', action: chaosSignal.action });
      } else {
        emitHeartbeat({ outcome: 'noop', reason: noopReason ?? 'no marker produced' });
      }

      return signals;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitHeartbeat({ outcome: 'error', reason: message });
      throw err;
    }
  }

  private getPairKey(pair: PairId): string {
    return `${pair.symbol}:${pair.timeframe}`;
  }

  /**
   * Resolve mint + decimals for a signal symbol.
   *
   * Fallback chain: try as a full pair symbol (e.g. "BTCUSDT"), then as a base
   * symbol (e.g. "BTC" → "BTCUSDT"), then fall back to USDC (6 decimals) for
   * unknown symbols. Sell sizing uses the real token decimals so fractional
   * quantities convert to correct on-chain units instead of flooring to zero.
   */
  private getTokenInfoForSymbol(symbol: string): { mint: string; decimals: number } {
    // Use centralized registry for token addresses
    // Try as pair symbol first (e.g., "BTCUSDT"), then as base symbol (e.g., "BTC")
    if (isValidPairSymbol(symbol)) {
      const info = getTokenInfo(symbol);
      return { mint: info.mint, decimals: info.decimals };
    }
    // Fallback: try to find by base symbol in the registry
    const pairSymbol = `${symbol}USDT`;
    if (isValidPairSymbol(pairSymbol)) {
      const info = getTokenInfo(pairSymbol);
      return { mint: info.mint, decimals: info.decimals };
    }
    return { mint: USDC_MINT, decimals: 6 };
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

  /**
   * Feed the risk manager after a completed trade (D6): record realized PnL
   * for closing trades and capture a wallet-balance snapshot. Fully fail-safe —
   * never throws and never blocks the caller (the trade is already done).
   *
   * PnL is only recorded when the closing trade's position (entry price /
   * quantity) is known; otherwise it is skipped rather than guessed.
   */
  private async recordClosedTradeRisk(signal: TradeSignal): Promise<void> {
    const riskManager = this.config.riskManager;
    if (!riskManager) return;

    if (signal.action === 'sell' || signal.action === 'close') {
      let realizedPnl: number | undefined;

      // B1: prefer the entry price snapshot attached at generation time —
      // it is exact for the state the signal was produced from. The state
      // scan below is only a fallback for signals that never carried one
      // (e.g. chaos path), and still fails safe (skip) when unknown.
      if (
        signal.positionEntryPrice !== undefined &&
        signal.positionEntryPrice > 0 &&
        signal.quantity > 0
      ) {
        // Spot DEX closes are long exits: realized PnL = (exit − entry) × qty.
        realizedPnl = (signal.expectedPrice - signal.positionEntryPrice) * signal.quantity;
      } else {
        const state = this.getStateForSignal(signal);
        if (
          state?.position.direction === 'long' &&
          state.position.entryPrice > 0 &&
          state.position.quantity > 0
        ) {
          realizedPnl =
            (signal.expectedPrice - state.position.entryPrice) * state.position.quantity;
        }
      }

      if (realizedPnl !== undefined) {
        riskManager.recordTrade(realizedPnl);
      }
    }

    await this.captureBalanceSnapshot();
  }

  /**
   * Resolve the strategy state a trade signal belongs to. Prefers the exact
   * `symbol:timeframe` key when the signal carries a timeframe; otherwise
   * falls back to any non-flat state tracking this symbol (the scheduler's
   * signal mapping drops `timeframe`, so entry/close signals often lack it).
   */
  private getStateForSignal(signal: TradeSignal): StrategyState | undefined {
    if (signal.timeframe) {
      return this.strategyStates.get(`${signal.symbol}:${signal.timeframe}`);
    }
    for (const state of this.strategyStates.values()) {
      if (state.position.symbol === signal.symbol && state.position.direction !== 'flat') {
        return state;
      }
    }
    return undefined;
  }
}
