/**
 * BUG-REPRO suite — force-close (stop button) notification gap (Bug Hunter wave).
 *
 * User report: "When I stop the bot via the button while a position is opened,
 * it gets force-closed, but I don't get notification about that! It should feel
 * like a regular position closed notification... Just like a normal one I would
 * get from a natural close."
 *
 * Root-cause hypothesis verified here (FIXED by BUG 7):
 *   - NATURAL close (chaos sell, confirmed order result) notifies:
 *     bot-engine.ts notifyPositionResult → buildPositionNotificationTrade →
 *     telegramBot.notifyPositionClosed (:1465-1491).
 *   - FORCE close (stop/emergency, confirmed on-chain) DID NOT notify before
 *     the fix: CloseManager.applyCloseSideEffects emitted position_closed and
 *     called onPositionClosed (close-manager.ts:756-779) → the engine wired it
 *     to handlePositionClosed, which flattened executor state, broadcast WS,
 *     cleared the tombstone, persisted — but never called notifyPositionClosed.
 *   - FIX: onPositionClosed was widened to (PositionInfo, CloseResult), and
 *     handlePositionClosed now fires telegramBot.notifyPositionClosed(...)
 *     fire-and-forget for a confirmed close with a known entry (:1859-1963) —
 *     the same trade shape and message as a natural close (user report).
 *
 * Every `it(...)` that names a bug asserts the CORRECT behavior and FAILS (RED)
 * against the current source. Tests named `control:` assert the seam still works
 * and PASS, isolating exactly which link is broken.
 */

import { describe, it, expect, vi } from 'vitest';

// Import-time side-effect shields — the same surface bot-engine.test.ts uses:
// solana modules construct connections, strategy-engine is heavy, and the engine
// writes close-attempts.json / feed-state.json via node:fs/promises.
vi.mock('../../../src/trading/solana-config.js', () => ({
  createSolanaConnection: vi.fn().mockReturnValue({}),
  getDefaultSolanaConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/trading/solana-wallet.js', () => ({
  createConnection: vi.fn().mockReturnValue({}),
  getSolBalance: vi.fn(),
  getTokenBalance: vi.fn(),
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}));

vi.mock('../../../src/strategy/strategy-engine.js', () => ({
  StrategyEngine: vi.fn().mockImplementation(() => ({
    updateBar: vi.fn(),
    getEquity: vi.fn().mockReturnValue(10_000_000_000),
    getPosition: vi.fn().mockReturnValue({ direction: 'flat', quantity: 0 }),
    entry: vi.fn(),
    close: vi.fn(),
    getNewMarkers: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('node:fs/promises', () => {
  const writeFile = vi.fn(async () => {});
  const readFile = vi.fn(async () => {
    throw new Error('ENOENT: no such file or directory');
  });
  return { writeFile, readFile };
});

import { BotEngine } from '../../../src/trading/bot-engine.js';
import type { ExecutionResult, PositionInfo } from '../../../src/trading/live-strategy-executor.js';
import type { CloseResult } from '../../../src/trading/close-manager.js';
import type { TradeSignal as SchedulerTradeSignal } from '../../../src/trading/scheduler.js';

/** Engine with the private seams the repro drives (same cast convention as the
 *  F3 close-attempt suite in tests/unit/trading/bot-engine.test.ts). */
type EngineWithSeams = BotEngine & {
  notifyPositionResult: (signal: SchedulerTradeSignal, result: ExecutionResult) => void;
  handlePositionClosed: (position: PositionInfo, result: CloseResult) => void;
};

function makeEngine(telegramBot?: { notifyPositionClosed: ReturnType<typeof vi.fn> }): EngineWithSeams {
  const engine = new BotEngine({ telegramBot: (telegramBot ?? { notifyPositionClosed: vi.fn() }) as never });
  return engine as unknown as EngineWithSeams;
}

describe('BUG 7 — force-close (stop button) must notify position_close like a natural close', () => {
  it('control: a NATURAL close (confirmed sell) notifies via notifyPositionClosed', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = makeEngine({ notifyPositionClosed });

    // Same shape the chaos order-success handler feeds notifyPositionResult
    // (bot-engine.ts:1190): a confirmed sell with the B1 entry snapshot.
    const signal: SchedulerTradeSignal = {
      pair: { symbol: 'SOLUSDT', timeframe: '60' },
      action: 'sell',
      quantity: 0.1,
      price: 101,
      timestamp: 1_700_000_000_000,
      positionEntryPrice: 100,
    };
    const result = { success: true, swapResult: { signature: 'sig-natural' } } as unknown as ExecutionResult;

    engine.notifyPositionResult(signal, result);

    // Fire-and-forget by design: wait for the never-awaited notification.
    await vi.waitFor(() => expect(notifyPositionClosed).toHaveBeenCalledTimes(1));
    const trade = notifyPositionClosed.mock.calls[0]![0] as { symbol: string; realizedPnl: number };
    expect(trade.symbol).toBe('SOLUSDT');
    // (exit 101 − entry 100) × qty 0.1 — a truthful PnL, never a guess.
    expect(trade.realizedPnl).toBe(0.1);
  });

  it('a FORCE close (confirmed on-chain via stop/emergency) must also notify via notifyPositionClosed', async () => {
    const notifyPositionClosed = vi.fn().mockResolvedValue(undefined);
    const engine = makeEngine({ notifyPositionClosed });

    // This is EXACTLY what CloseManager.applyCloseSideEffects fires on a
    // confirmed force-close (close-manager.ts:776 onPositionClosed call) →
    // wired to the engine at bot-engine.ts:1018 → handlePositionClosed
    // (:1859): the full PositionInfo snapshot + the closed CloseResult.
    engine.handlePositionClosed(
      {
        symbol: 'SOLUSDT',
        timeframe: '60',
        direction: 'long',
        quantity: 0.1,
        entryPrice: 100,
        entryTime: 1_700_000_000_000,
      },
      { status: 'closed', txSignature: 'sig-force', exitPrice: 101 },
    );

    // CORRECT (post-fix): the force-close sink must deliver the same
    // position_close notification the natural close delivers (user report).
    await vi.waitFor(() => expect(notifyPositionClosed).toHaveBeenCalledTimes(1));
    expect(notifyPositionClosed).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'SOLUSDT',
        entryPrice: 100,
        exitPrice: 101,
        // (exit 101 − entry 100) × qty 0.1 — a truthful PnL, never a guess.
        realizedPnl: 0.1,
        transactionSignature: 'sig-force',
      }),
    );
  });
});
