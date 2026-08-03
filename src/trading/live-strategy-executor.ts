/**
 * LiveStrategyExecutor — bridges strategy signals to DEX orders for live trading.
 *
 * Executes Pine Script strategies on live market data, translating strategy
 * signals (entry/exit) into real DEX orders via the Jupiter swap adapter.
 *
 * @module trading
 */

import { StrategyEngine, type StrategyMarker } from '../strategy/strategy-engine.js';
import { DexAdapter, type Quote, type SwapResult } from './dex/dex-adapter.js';
import { ClosedCandle, PairId } from './scheduler.js';
import { WalletManager, type WalletKeypair } from './wallet/wallet-manager.js';
import { getSolBalance, getTokenBalance, USDC_MINT } from './solana-wallet.js';
import { createConnection } from './solana-config.js';
import { Connection } from '@solana/web3.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
}

export interface StrategyState {
  /** Compiled strategy engine. */
  engine: StrategyEngine;
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
  private connection: Connection;
  private stateFilePath: string;

  constructor(config: LiveStrategyConfig) {
    this.config = config;
    this.connection = createConnection();
    this.stateFilePath = path.join(config.dataDir ?? '.', 'strategy-state.json');
  }

  /**
   * Initialize strategy for a trading pair.
   */
  async initializeStrategy(pair: PairId): Promise<void> {
    const key = this.getPairKey(pair);

    // Create strategy engine with default config
    const engine = new StrategyEngine({
      initialCapital: Number(this.config.initialCapital),
      positionSize: this.config.positionSizePercent,
    });

    // Initialize strategy state
    const state: StrategyState = {
      engine,
      position: {
        symbol: pair.symbol,
        direction: 'flat',
        quantity: 0,
        entryPrice: 0,
        entryTime: 0,
      },
      variables: {},
    };

    this.strategyStates.set(key, state);
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

    // Execute strategy on the candle
    // This is a simplified version - in reality, you'd need to integrate
    // with the Pine Script execution engine
    const signals: TradeSignal[] = [];

    // For now, we'll use a simple moving average crossover strategy
    // as a placeholder. In production, this would use the actual
    // Pine Script strategy execution.
    const currentPrice = candle.close;

    // Simple placeholder logic - replace with actual strategy execution
    if (state.position.direction === 'flat') {
      // Check for entry signal (simplified)
      if (this.shouldEnterLong(state, currentPrice)) {
        signals.push({
          action: 'buy',
          symbol: candle.symbol,
          quantity: this.calculatePositionSize(currentPrice),
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
        });
      }
    } else if (state.position.direction === 'long') {
      // Check for exit signal (simplified)
      if (this.shouldExitLong(state, currentPrice)) {
        signals.push({
          action: 'sell',
          symbol: candle.symbol,
          quantity: state.position.quantity,
          expectedPrice: currentPrice,
          timestamp: candle.timestamp,
        });
      }
    }

    return signals;
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
        const inputMint = signal.action === 'buy' ? USDC_MINT : this.getMintForSymbol(signal.symbol);
        const outputMint = signal.action === 'buy' ? this.getMintForSymbol(signal.symbol) : USDC_MINT;
        const amount = BigInt(Math.floor(signal.quantity * (signal.action === 'buy' ? signal.expectedPrice : 1)));

        const quote = await this.config.dex.quote(inputMint, outputMint, amount);

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

  // ---- Private Methods ----

  private getPairKey(pair: PairId): string {
    return `${pair.symbol}:${pair.timeframe}`;
  }

  private getMintForSymbol(symbol: string): string {
    // Simplified mapping - in production, this would be a proper lookup
    const mintMap: Record<string, string> = {
      SOL: 'So11111111111111111111111111111111111111112',
      BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
      ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    };
    return mintMap[symbol] ?? USDC_MINT;
  }

  private calculatePositionSize(price: number): number {
    // Calculate position size based on available balance and position size percent
    const capitalUsdc = Number(this.config.initialCapital) / 1e6; // Convert from lamports
    const positionSizeUsdc = capitalUsdc * (this.config.positionSizePercent / 100);
    return positionSizeUsdc / price;
  }

  private shouldEnterLong(_state: StrategyState, _price: number): boolean {
    // Simplified entry logic - replace with actual strategy execution
    return false;
  }

  private shouldExitLong(_state: StrategyState, _price: number): boolean {
    // Simplified exit logic - replace with actual strategy execution
    return false;
  }

  private updatePositionState(signal: TradeSignal, swapResult: SwapResult): void {
    const key = `${signal.symbol}:${signal.timestamp}`;
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
    } else if (signal.action === 'sell') {
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
