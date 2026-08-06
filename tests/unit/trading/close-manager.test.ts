import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CloseManager,
  CloseManagerOptions,
  CloseSummary,
  MAX_PARALLEL_CLOSES,
  PER_CLOSE_TIMEOUT_MS,
  EMERGENCY_DEADLINE_MS,
  GRACEFUL_DEADLINE_MS,
  EMERGENCY_MAX_RETRIES,
  GRACEFUL_MAX_RETRIES,
  RETRY_BACKOFF_BASE_MS,
  CLOSE_SLIPPAGE_BPS,
  withTimeout,
} from '../../../src/trading/close-manager.js';
import type { DexAdapter, Quote, SwapResult, TxStatus } from '../../../src/trading/dex/dex-adapter.js';
import type { PositionInfo } from '../../../src/trading/live-strategy-executor.js';
import { SensitiveData } from '../../../src/trading/wallet/sensitive-data.js';
import type { WalletKeypair } from '../../../src/trading/wallet/wallet-manager.js';
import type { PineLogger } from '../../../src/utils/logger/types.js';
import { USDC_MINT, getTokenInfo } from '../../../src/trading/token-registry.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

function makeLogger(): PineLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as PineLogger;
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    inputMint: USDC_MINT,
    outputMint: USDC_MINT,
    inAmount: '0',
    outAmount: '0',
    priceImpactPct: 0,
    slippageBps: CLOSE_SLIPPAGE_BPS,
    feeBps: 0,
    ...overrides,
  };
}

function makeSwapResult(overrides: Partial<SwapResult> = {}): SwapResult {
  return {
    success: true,
    signature: 'mock-sig',
    inputAmount: '0',
    outputAmount: '0',
    fee: '0',
    ...overrides,
  };
}

/**
 * A swap failure with NO signature — the send never landed, so the close
 * retry policy can classify it. (A failure WITH a signature is the ambiguous
 * path and MUST go through getTransactionStatus — that is what the ambiguous
 * tests build explicitly.)
 */
function makeSignaturelessFailure(error: string): SwapResult {
  return makeSwapResult({ success: false, error, signature: undefined });
}

function makePosition(
  symbol: string,
  timeframe: string,
  quantity: number,
  overrides: Partial<PositionInfo> = {},
): PositionInfo {
  return {
    symbol,
    timeframe,
    direction: 'long',
    quantity,
    entryPrice: 100,
    entryTime: 1_700_000_000_000,
    ...overrides,
  };
}

interface Harness {
  manager: CloseManager;
  dex: DexAdapter;
  quote: MockFn;
  swap: MockFn;
  getTransactionStatus: MockFn;
  getKeypair: MockFn;
  getPositions: MockFn;
  onPositionClosed: MockFn;
  onPositionCloseFailed: MockFn;
  onEvent: MockFn;
  preflightClose?: MockFn;
}

function makeHarness(positions: PositionInfo[], deps: Partial<CloseManagerOptions> = {}): Harness {
  // A faithful quote mock: echo the REAL quote arguments so the swap receives
  // a quote mirroring the actual base→USDC request (with the base mint in
  // inputMint). A canned quote that defaulted every mint to USDC would make
  // swap() swap the wrong asset — and here it would defeat the tokens
  // decisions in the swap mockImplementation in several tests below.
  const quote = vi.fn().mockImplementation(
    async (inputMint: string, outputMint: string, amount: bigint, slippageBps: number) =>
      makeQuote({
        inputMint,
        outputMint,
        inAmount: amount.toString(),
        slippageBps,
      }),
  );
  const swap = vi.fn().mockResolvedValue(makeSwapResult());
  const getTransactionStatus = vi.fn().mockResolvedValue('confirmed' as TxStatus);
  const dex = {
    name: 'mock-dex',
    commissionModel: { name: 'mock', feeBps: 0, variable: false, description: 'Mock' },
    slippageConfig: { bps: CLOSE_SLIPPAGE_BPS, configurable: true },
    quote,
    swap,
    getBalance: vi.fn(),
    getTransactionStatus,
  } as unknown as DexAdapter;

  const getKeypair: MockFn = (
    deps.getKeypair ??
    vi.fn(
      async (): Promise<SensitiveData<WalletKeypair>> =>
        new SensitiveData<WalletKeypair>({
          publicKey: 'mock-public-key',
          privateKey: new Uint8Array(64),
        }),
    )
  ) as MockFn;
  const getPositions = vi.fn(() => positions);
  const onPositionClosed = vi.fn();
  const onPositionCloseFailed = vi.fn();
  const onEvent = vi.fn();
  const preflightClose: MockFn | undefined = deps.preflightClose as MockFn | undefined;

  const manager = new CloseManager({
    dex,
    getKeypair,
    getPositions,
    onPositionClosed,
    onPositionCloseFailed,
    onEvent,
    preflightClose,
    logger: makeLogger(),
  });

  return {
    manager,
    dex,
    quote,
    swap,
    getTransactionStatus,
    getKeypair,
    getPositions,
    onPositionClosed,
    onPositionCloseFailed,
    onEvent,
    preflightClose,
  };
}

// ---------------------------------------------------------------------------
// Constants contract (used by every scenario below — do not hardcode)
// ---------------------------------------------------------------------------

describe('CloseManager — deadline/retry constants contract', () => {
  it('keeps the per-close budget below the emergency deadline below the graceful deadline', () => {
    expect(PER_CLOSE_TIMEOUT_MS).toBeLessThan(EMERGENCY_DEADLINE_MS);
    expect(EMERGENCY_DEADLINE_MS).toBeLessThan(GRACEFUL_DEADLINE_MS);
  });

  it('gives graceful more retries than emergency and keeps a positive backoff base', () => {
    expect(GRACEFUL_MAX_RETRIES).toBeGreaterThan(EMERGENCY_MAX_RETRIES);
    expect(RETRY_BACKOFF_BASE_MS).toBeGreaterThan(0);
  });

  it('withTimeout rejects after ms when the promise never settles and clears the timer on fast settle', async () => {
    vi.useFakeTimers();
    try {
      const hanging = withTimeout(new Promise<void>(() => {}), 100);
      // Attach the rejection handler BEFORE advancing timers so the rejection
      // is never unhandled (a race that otherwise trips unhandled-rejection).
      const rejection = expect(hanging).rejects.toThrow('Operation timed out after 100ms');
      await vi.advanceTimersByTimeAsync(101);
      await rejection;

      await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Spec: Every stop path closes all open positions (confirmed only)
// ---------------------------------------------------------------------------

describe('CloseManager — happy path (every stop closes all positions, confirmed only)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('closes every snapshot position via a confirmed reverse swap (base → USDC) and aggregates', async () => {
    const btcInfo = getTokenInfo('BTCUSDT');
    const solInfo = getTokenInfo('SOLUSDT');
    const btcAmount = BigInt(Math.floor(0.5 * 10 ** btcInfo.decimals));
    const solAmount = BigInt(Math.floor(2 * 10 ** solInfo.decimals));

    const { manager, swap, quote, getPositions, onPositionClosed, onPositionCloseFailed } =
      makeHarness([
        makePosition('BTC', '1', 0.5),
        makePosition('SOL', '1', 2),
      ]);

    swap.mockImplementation(async (q: Quote) => {
      if (q.inputMint === btcInfo.mint) {
        return makeSwapResult({ signature: 'sig-btc', inputAmount: btcAmount.toString() });
      }
      return makeSwapResult({ signature: 'sig-sol', inputAmount: solAmount.toString() });
    });

    const summary: CloseSummary = await manager.closeAllPositions('test', 'graceful');

    // Aggregate: every position closed, none failed/timed out, nothing left on-chain.
    expect(summary).toMatchObject({
      total: 2,
      closed: 2,
      failed: 0,
      timedOut: 0,
      failedSymbols: [],
    });
    expect(summary.closeRunId).toEqual(expect.any(String));

    // Reverse pair (base mint → USDC) at the FULL snapshot quantity, with the
    // proven sell slippage — mirrors the executor's sell semantics.
    expect(quote).toHaveBeenCalledTimes(2);
    expect(quote).toHaveBeenCalledWith(btcInfo.mint, USDC_MINT, btcAmount, CLOSE_SLIPPAGE_BPS);
    expect(quote).toHaveBeenCalledWith(solInfo.mint, USDC_MINT, solAmount, CLOSE_SLIPPAGE_BPS);

    // The swap is executed against the reverse-pair quote with the keypair.
    expect(swap).toHaveBeenCalledTimes(2);
    expect(swap).toHaveBeenCalledWith(
      expect.objectContaining({ inputMint: btcInfo.mint, outputMint: USDC_MINT }),
      expect.any(Uint8Array),
    );
    expect(swap).toHaveBeenCalledWith(
      expect.objectContaining({ inputMint: solInfo.mint, outputMint: USDC_MINT }),
      expect.any(Uint8Array),
    );

    // Chain truth: each confirmed signature fires position_closed side effects,
    // and no position is reported failed.
    expect(onPositionClosed).toHaveBeenCalledTimes(2);
    expect(onPositionClosed).toHaveBeenCalledWith('BTC', '1', 'sig-btc');
    expect(onPositionClosed).toHaveBeenCalledWith('SOL', '1', 'sig-sol');
    expect(onPositionCloseFailed).not.toHaveBeenCalled();
    // The position accessor view is untouched by the CloseManager itself — the
    // engine's onPositionClosed seam owns state removal (chain-truth gate).
    expect(getPositions()).toHaveLength(2);
  });

  it('runs more positions than MAX_PARALLEL_CLOSES without dropping any', async () => {
    const positions = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'].map((symbol, i) =>
      makePosition(symbol, '1', 1 + i),
    );
    expect(positions.length).toBeGreaterThan(MAX_PARALLEL_CLOSES);

    const { manager, swap, onPositionClosed } = makeHarness(positions);
    swap.mockResolvedValue(makeSwapResult({ signature: 'sig' }));

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(summary).toMatchObject({ total: positions.length, closed: positions.length });
    expect(onPositionClosed).toHaveBeenCalledTimes(positions.length);
  });

  it('emits stop_started, close_started, position_closed, stop_completed all tagged with the same closeRunId', async () => {
    const { manager, swap, onEvent } = makeHarness([makePosition('BTC', '1', 0.5)]);
    swap.mockResolvedValue(makeSwapResult({ signature: 'sig-btc' }));

    await manager.closeAllPositions('test', 'graceful');

    const events = onEvent.mock.calls.map((call) => call[0] as { type: string; closeRunId: string });
    expect(events[0]).toMatchObject({ type: 'stop_started', reason: 'test', mode: 'graceful', total: 1 });
    expect(events[1]).toMatchObject({ type: 'close_started', symbol: 'BTC', timeframe: '1', attempt: 1 });
    expect(events[2]).toMatchObject({ type: 'position_closed', symbol: 'BTC', timeframe: '1', txSignature: 'sig-btc' });
    expect(events[events.length - 1]).toMatchObject({ type: 'stop_completed' });
    // Every event is tagged with the SAME close-run identifier (spec: Close
    // results are observable, tagged with the close-run id).
    const closeRunId = events[0]!.closeRunId;
    for (const event of events) {
      expect(event.closeRunId).toBe(closeRunId);
    }
  });
});

// ---------------------------------------------------------------------------
// Spec: Position is closed only on confirmed chain truth
// ---------------------------------------------------------------------------

describe('CloseManager — failed close leaves the position (closed only on chain truth)', () => {
  afterEach(() => vi.clearAllMocks());

  it('counts a signature-less swap failure as failed, emits close_failed, and never reports closed', async () => {
    const { manager, swap, getPositions, onPositionClosed, onPositionCloseFailed, onEvent } =
      makeHarness([makePosition('BTC', '1', 0.5)]);
    swap.mockResolvedValue(makeSignaturelessFailure('slippage'));

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1, timedOut: 0 });
    expect(summary.failedSymbols).toEqual(['BTC:1']);
    expect(onPositionCloseFailed).toHaveBeenCalledWith('BTC', '1', 'slippage');
    expect(onPositionClosed).not.toHaveBeenCalled();

    const events = onEvent.mock.calls.map((call) => call[0] as { type: string; reason?: string });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'close_failed', symbol: 'BTC', timeframe: '1', reason: 'failed', error: 'slippage' }),
    );

    // The position stays in the engine accessor view — nothing removed (the
    // engine only removes on a CONFIRMED signature).
    expect(getPositions()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Spec: Stop completes within the deadline
// ---------------------------------------------------------------------------

describe('CloseManager — deadline → timed_out (stop completes within the deadline)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('marks a hung close as timed_out when the per-close deadline fires and the run still resolves (no hang)', async () => {
    vi.useFakeTimers();
    const { manager, swap, getPositions, onPositionCloseFailed, onEvent } = makeHarness([
      makePosition('BTC', '1', 0.5),
    ]);
    // The swap never settles — a wedged Jupiter. The per-close timeout
    // (PER_CLOSE_TIMEOUT_MS) must produce a timed_out verdict and the run must
    // RESOLVE, never hang forever.
    swap.mockImplementation(() => new Promise(() => {}));

    const run = manager.closeAllPositions('test', 'graceful');
    await vi.advanceTimersByTimeAsync(PER_CLOSE_TIMEOUT_MS + 100);
    const summary = await run;

    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 0, timedOut: 1 });
    // A timed-out close is still on-chain → it belongs in failedSymbols (what
    // the operator must reconcile) AND timedOutSymbols (reported distinctly as
    // "still in flight", not a hard failure). Aggregate drop-bug lock.
    expect(summary.failedSymbols).toEqual(['BTC:1']);
    expect(summary.timedOutSymbols).toEqual(['BTC:1']);
    expect(getPositions()).toHaveLength(1);
    expect(onPositionCloseFailed).toHaveBeenCalledWith('BTC', '1', 'Close timed out before confirmation');

    const events = onEvent.mock.calls.map((call) => call[0] as { type: string; reason?: string });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'close_failed', reason: 'timed_out' }),
    );
  });

  it('keeps the deadline bounded below the global deadline (per-close is the shortest bound)', () => {
    expect(PER_CLOSE_TIMEOUT_MS).toBeLessThan(GRACEFUL_DEADLINE_MS);
  });
});

// ---------------------------------------------------------------------------
// Spec: Close outcome is unknown after a race (ambiguous confirm)
// ---------------------------------------------------------------------------

describe('CloseManager — ambiguous confirm → getTransactionStatus, no double-sell', () => {
  afterEach(() => vi.clearAllMocks());

  it('counts an ambiguous swap as CLOSED when the on-chain status confirms the signature', async () => {
    const { manager, swap, getTransactionStatus, onPositionClosed } = makeHarness([
      makePosition('BTC', '1', 0.5),
    ]);
    // The send landed but confirmation raced — the failure carries the
    // signature (Wave 1 enabler). Verify on-chain BEFORE deciding.
    swap.mockResolvedValue(makeSwapResult({ success: false, error: 'confirm timeout', signature: 'sig-abc' }));
    getTransactionStatus.mockResolvedValue('confirmed');

    const summary = await manager.closeAllPositions('test', 'graceful');

    // Confirmed on-chain → the signature IS the truth → closed.
    expect(summary).toMatchObject({ total: 1, closed: 1, failed: 0 });
    expect(onPositionClosed).toHaveBeenCalledWith('BTC', '1', 'sig-abc');
    expect(getTransactionStatus).toHaveBeenCalledWith('sig-abc');
    // Exactly ONE swap attempt — the ambiguous attempt is never retried.
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('counts an ambiguous swap as FAILED on unknown status and does NOT retry (no double-sell)', async () => {
    const { manager, swap, getTransactionStatus, onPositionClosed, onPositionCloseFailed } =
      makeHarness([makePosition('BTC', '1', 0.5)]);
    swap.mockResolvedValue(makeSwapResult({ success: false, error: 'confirm timeout', signature: 'sig-abc' }));
    getTransactionStatus.mockResolvedValue('unknown');

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1 });
    expect(swap).toHaveBeenCalledTimes(1); // NO retry of an ambiguous attempt
    expect(onPositionClosed).not.toHaveBeenCalled();
    expect(onPositionCloseFailed).toHaveBeenCalledWith('BTC', '1', expect.stringContaining('Ambiguous swap outcome'));
  });
});

// ---------------------------------------------------------------------------
// Spec: Retry policy (retryable classification + per-mode caps)
// ---------------------------------------------------------------------------

describe('CloseManager — retry policy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('graceful mode retries a retryable failure up to GRACEFUL_MAX_RETRIES extra attempts', async () => {
    vi.useFakeTimers();
    const { manager, swap, quote } = makeHarness([makePosition('BTC', '1', 0.5)]);
    // F2 (hardening): ONLY 429/rate-limit and blockhash/expired are retryable —
    // a 5xx status (the old `HTTP 503` fixture) is now fail-closed non-retryable.
    swap.mockResolvedValue(makeSignaturelessFailure('429 rate limit exceeded'));

    const run = manager.closeAllPositions('test', 'graceful');
    // Advance through the 1s/2s/4s backoffs — all within the 20s per-close budget.
    await vi.advanceTimersByTimeAsync(12_000);
    const summary = await run;

    expect(swap).toHaveBeenCalledTimes(GRACEFUL_MAX_RETRIES + 1);
    expect(quote).toHaveBeenCalledTimes(GRACEFUL_MAX_RETRIES + 1);
    expect(summary).toMatchObject({ closed: 0, failed: 1 });
  });

  it('emergency mode caps retries at EMERGENCY_MAX_RETRIES extra attempts', async () => {
    vi.useFakeTimers();
    const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
    // F2 (hardening): a bare 'network error' is now NON-retryable (fail-closed —
    // the send may have landed) — use a provably-safe retryable error instead.
    swap.mockResolvedValue(makeSignaturelessFailure('429 Too Many Requests'));

    const run = manager.closeAllPositions('test', 'emergency');
    await vi.advanceTimersByTimeAsync(5_000);
    const summary = await run;

    expect(swap).toHaveBeenCalledTimes(EMERGENCY_MAX_RETRIES + 1);
    expect(summary).toMatchObject({ closed: 0, failed: 1 });
  });

  it('does not retry a non-retryable failure — a single attempt', async () => {
    const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
    swap.mockResolvedValue(makeSignaturelessFailure('insufficient balance'));

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(swap).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1 });
  });
});

// ---------------------------------------------------------------------------
// Spec: One failing close must not block siblings (allSettled isolation)
// ---------------------------------------------------------------------------

describe('CloseManager — allSettled isolation (one failing close never blocks siblings)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves with a mixed summary when one position hangs, one fails, and one succeeds', async () => {
    vi.useFakeTimers();
    const btcInfo = getTokenInfo('BTCUSDT');
    const ethInfo = getTokenInfo('ETHUSDT');
    const solInfo = getTokenInfo('SOLUSDT');

    const { manager, swap, onPositionClosed } = makeHarness([
      makePosition('BTC', '1', 0.5), // hangs
      makePosition('ETH', '1', 0.5), // fails (non-retryable)
      makePosition('SOL', '1', 0.5), // succeeds
    ]);
    swap.mockImplementation(async (q: Quote) => {
      if (q.inputMint === solInfo.mint) return makeSwapResult({ signature: 'sig-sol' });
      if (q.inputMint === ethInfo.mint) {
        return makeSignaturelessFailure('insufficient balance');
      }
      // BTC hangs — the per-close deadline turns it into timed_out.
      void btcInfo;
      return new Promise(() => {});
    });

    const run = manager.closeAllPositions('test', 'graceful');
    await vi.advanceTimersByTimeAsync(PER_CLOSE_TIMEOUT_MS + 100);
    const summary = await run; // resolves — never rejects

    expect(summary).toMatchObject({
      total: 3,
      closed: 1,
      failed: 1,
      timedOut: 1,
      // Aggregate drop-bug lock: a timed-out close leaves the position on-chain,
      // so BTC:1 (hung) appears in failedSymbols AND is reported distinctly in
      // timedOutSymbols. Hardening F3 corrected the old loss of timed_out
      // symbols from failedSymbols.
      failedSymbols: ['BTC:1', 'ETH:1'],
      timedOutSymbols: ['BTC:1'],
    });
    // The success still fired its confirmed-close side effect despite siblings failing.
    expect(onPositionClosed).toHaveBeenCalledTimes(1);
    expect(onPositionClosed).toHaveBeenCalledWith('SOL', '1', 'sig-sol');
  });
});

// ---------------------------------------------------------------------------
// Hardening F2 — fail-closed retry classification
// (retries ONLY 429|rate-limit and blockhash|expired; network errors and 5xx
// statuses are AMBIGUOUS — the send may have landed — and are never retried)
// ---------------------------------------------------------------------------

describe('CloseManager — F2 fail-closed retry classification', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each(['socket hang up', 'fetch failed', 'connect ECONNRESET', 'request timed out'])(
    'F2: a network/transport failure (%s) is NON-retryable — a single attempt (fail-closed: the send may have landed)',
    async (error) => {
      const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
      swap.mockResolvedValue(makeSignaturelessFailure(error));

      const summary = await manager.closeAllPositions('test', 'graceful');

      expect(swap).toHaveBeenCalledTimes(1); // NO retry of an ambiguous network failure
      expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1, timedOut: 0 });
    },
  );

  it.each(['HTTP 503 Service Unavailable', 'HTTP 500 Internal Server Error'])(
    'F2: a 5xx status (%s) is NON-retryable — single attempt (was retried before the hardening)',
    async (error) => {
      const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
      swap.mockResolvedValue(makeSignaturelessFailure(error));

      const summary = await manager.closeAllPositions('test', 'graceful');

      expect(swap).toHaveBeenCalledTimes(1);
      expect(summary).toMatchObject({ failed: 1 });
    },
  );

  it('F2: an error whose MESSAGE contains a literal "500" is NOT misclassified as a retryable 5xx', async () => {
    const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
    // The OLD regex matched any `\b5\d{2}\b` substring — an amount like "500"
    // would have been misclassified as retryable. F2 classifies by message, not
    // by numeric substring: this is a domain error, not an HTTP status.
    swap.mockResolvedValue(makeSignaturelessFailure('output amount 500 USDC below minimum'));

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(swap).toHaveBeenCalledTimes(1); // not retried, not classified as 5xx
    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1 });
  });

  it('F2: an expired-blockhash failure IS retried (RPC rejected before acceptance — provably safe)', async () => {
    vi.useFakeTimers();
    const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)]);
    swap.mockResolvedValue(makeSignaturelessFailure('blockhash expired'));

    const run = manager.closeAllPositions('test', 'graceful');
    await vi.advanceTimersByTimeAsync(12_000);
    const summary = await run;

    expect(swap).toHaveBeenCalledTimes(GRACEFUL_MAX_RETRIES + 1);
    expect(summary).toMatchObject({ failed: 1 });
  });
});

// ---------------------------------------------------------------------------
// Hardening F3 — preflightClose cross-run double-sell guard (CloseManager
// contract). The engine's prepareCloseAttempt feeds this seam: persist the
// close attempt BEFORE the swap and refuse a position a DIFFERENT close run
// left non-confirmed. Same-run retries are allowed.
// ---------------------------------------------------------------------------

describe('CloseManager — preflightClose cross-run double-sell guard (F3)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('honors a preflight refusal — fail-closed: NO quote, NO swap, position reported failed (no re-sell)', async () => {
    const preflightClose = vi.fn(async () => 'refused: unconfirmed close from run old-run');
    const { manager, swap, quote, onPositionCloseFailed, preflightClose: wiredPreflight } =
      makeHarness([makePosition('BTC', '1', 0.5)], { preflightClose });

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(wiredPreflight).toBe(preflightClose);
    expect(preflightClose).toHaveBeenCalledTimes(1);
    expect(preflightClose).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'BTC', timeframe: '1' }),
      expect.any(String), // closeRunId
    );
    expect(quote).not.toHaveBeenCalled();
    expect(swap).not.toHaveBeenCalled(); // fail-closed: the swap never happens
    expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1 });
    expect(summary.failedSymbols).toEqual(['BTC:1']);
    expect(onPositionCloseFailed).toHaveBeenCalledWith(
      'BTC',
      '1',
      'refused: unconfirmed close from run old-run',
    );
  });

  it('allows same-run retries — preflight runs on EVERY attempt with the SAME closeRunId (a different run would be refused)', async () => {
    vi.useFakeTimers();
    const preflightClose = vi.fn(
      async (_position: PositionInfo, _closeRunId: string): Promise<string | undefined> => undefined,
    ); // same run → always proceeds
    const { manager, swap } = makeHarness([makePosition('BTC', '1', 0.5)], { preflightClose });
    swap.mockResolvedValue(makeSignaturelessFailure('429 rate limit'));

    const run = manager.closeAllPositions('test', 'graceful');
    await vi.advanceTimersByTimeAsync(12_000);
    const summary = await run;

    expect(swap).toHaveBeenCalledTimes(GRACEFUL_MAX_RETRIES + 1);
    // One preflight per attempt, all tagged with the same closeRunId — the
    // engine's prepareCloseAttempt matches runId and must never refuse its own run.
    expect(preflightClose).toHaveBeenCalledTimes(GRACEFUL_MAX_RETRIES + 1);
    const runIds = preflightClose.mock.calls.map((call) => call[1] as string);
    expect(new Set(runIds).size).toBe(1);
    expect(summary).toMatchObject({ failed: 1 });
  });
});

// ---------------------------------------------------------------------------
// Hardening F4 — once-per-run keypair (acquired ONCE, threaded down to every
// worker, disposed ONCE after Promise.allSettled). A per-worker acquire/dispose
// would null WalletManager's shared SensitiveData wrapper mid-quote.
// ---------------------------------------------------------------------------

describe('CloseManager — F4 once-per-run keypair', () => {
  afterEach(() => vi.clearAllMocks());

  it('acquires the keypair exactly ONCE and disposes exactly ONCE after all workers settle', async () => {
    const positions = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'].map((symbol, i) =>
      makePosition(symbol, '1', 1 + i),
    );
    expect(positions.length).toBeGreaterThan(MAX_PARALLEL_CLOSES);

    const sd = new SensitiveData<WalletKeypair>({
      publicKey: 'mock-public-key',
      privateKey: new Uint8Array(64),
    });
    const disposeSpy = vi.spyOn(sd, 'dispose');
    const getKeypair = vi.fn(async () => sd);

    const { manager, swap, getKeypair: wiredGetKeypair } = makeHarness(positions, { getKeypair });
    swap.mockResolvedValue(makeSwapResult({ signature: 'sig' }));

    const summary = await manager.closeAllPositions('test', 'graceful');

    expect(wiredGetKeypair).toBe(getKeypair);
    // ONE acquisition for the whole run — never per-worker.
    expect(getKeypair).toHaveBeenCalledTimes(1);
    // Disposed exactly once, after every worker finished using the bytes.
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ total: positions.length, closed: positions.length });

    // Every swap received the SAME shared privateKey bytes (single acquisition).
    const swapArgs = swap.mock.calls.map((call) => call[1] as Uint8Array);
    expect(swapArgs.length).toBe(positions.length);
    for (const args of swapArgs) {
      expect(args).toBe(swapArgs[0]);
    }
  });

  it('a run where keypair acquisition FAILS reports every position failed (never sold) WITHOUT throwing', async () => {
    const positions = [makePosition('BTC', '1', 0.5), makePosition('SOL', '1', 2)];
    const getKeypair = vi.fn().mockRejectedValue(new Error('wallet locked'));
    const { manager, swap, onPositionClosed } = makeHarness(positions, { getKeypair });

    const summary = await manager.closeAllPositions('test', 'graceful'); // resolves — never rejects

    expect(getKeypair).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ total: 2, closed: 0, failed: 2, timedOut: 0 });
    expect(summary.failedSymbols).toEqual(['BTC:1', 'SOL:1']);
    // Fail-closed: no keypair → no swap is possible for ANY position.
    expect(swap).not.toHaveBeenCalled();
    expect(onPositionClosed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LOW hardening — degenerate quantity input must fail early and permanently
// (a NaN/zero/fractional quantity would floor to 0 or throw inside BigInt and
// can never produce a valid on-chain close)
// ---------------------------------------------------------------------------

describe('CloseManager — degenerate quantity guard (LOW)', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([0, -1, NaN])(
    'refuses a degenerate quantity (%s) before any quote/swap — permanent failure, no retry',
    async (quantity) => {
      const { manager, swap, quote } = makeHarness([makePosition('BTC', '1', quantity)]);

      const summary = await manager.closeAllPositions('test', 'graceful');

      expect(quote).not.toHaveBeenCalled();
      expect(swap).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ total: 1, closed: 0, failed: 1, timedOut: 0 });
      expect(summary.failedSymbols).toEqual(['BTC:1']);
    },
  );
});
