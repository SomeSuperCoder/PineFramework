/**
 * CloseManager — orchestrates closing every open position when the bot stops.
 *
 * Design contract: openspec/changes/auto-close-positions-on-stop/design.md and
 * specs/stop-close-all/spec.md. This is Wave 2 of the auto-close-on-stop
 * change; BotEngine integration (stop paths, state machine, process signals)
 * is Wave 3.
 *
 * Chain-truth contract (design decision 5): a position is 'closed' ONLY when
 * the reverse swap has a confirmed on-chain signature. Simulated/engine state
 * is never close evidence — never write 'closed' without a signature.
 *
 * The module owns close orchestration + the observability seams; the engine
 * (Wave 3) wires the side-effect callbacks (state removal + persistence) and
 * the event emitter. The "optional telegram" DI from tasks.md 2.1 is realized
 * through the onEvent seam (Wave 3 maps close_failed → Telegram notifyWarning
 * + recordError, design decision 7) so this module stays free of Telegram
 * coupling and remains unit-testable.
 *
 * @module trading
 */

import type { DexAdapter, SwapResult, TxStatus } from './dex/dex-adapter.js';
import type { PositionInfo } from './live-strategy-executor.js';
import type { SensitiveData } from './wallet/sensitive-data.js';
import type { WalletKeypair } from './wallet/wallet-manager.js';
import type { PineLogger } from '../utils/logger/types.js';
import { USDC_MINT, getTokenInfo, isValidPairSymbol } from './token-registry.js';
import { randomUUID } from 'node:crypto';

// ---- Constants ----

/**
 * Max concurrent closes (design decision 3). Solana has no nonce sequencing;
 * serialized closes × 20s would exceed the ~60s blockhash window with >3
 * positions, and one failing close must not block siblings.
 */
export const MAX_PARALLEL_CLOSES = 4;

/** Per-close budget (design decision 3): one position gets 20s to produce a
 *  verdict, including its retries. A verdict is never allowed to hang. */
export const PER_CLOSE_TIMEOUT_MS = 20_000;

/** Global close deadline per mode (design decision 2): the stop ALWAYS
 *  completes within the bounded deadline — a wedged Jupiter cannot trap the
 *  bot in Stopping. Emergency = best-effort 30s; graceful = 60s. */
export const EMERGENCY_DEADLINE_MS = 30_000;
export const GRACEFUL_DEADLINE_MS = 60_000;

/** Retry caps per mode (design decision 2): emergency max 1 retry, graceful
 *  max 3, with 1s/2s/4s + jitter backoff. Retries are only ever attempted for
 *  provably-safe (retryable) errors. */
export const EMERGENCY_MAX_RETRIES = 1;
export const GRACEFUL_MAX_RETRIES = 3;

/** Base delay for retry backoff — 1s/2s/4s per retry index (decision 2). */
export const RETRY_BACKOFF_BASE_MS = 1_000;

/** Slippage for close swaps — matches the executor's proven sell path
 *  (live-strategy-executor.ts passes 50 bps, the adapter default). */
export const CLOSE_SLIPPAGE_BPS = 50;

/** Decimals of the close swap's OUTPUT token. A close is always base → USDC
 *  (USDC_MINT is the hardcoded outputMint in attemptClose), and USDC is a
 *  fixed 6-decimal token — the same assumption the executor and every DEX
 *  adapter make (live-strategy-executor.ts 660-661 "USDC has 6 decimals →
 *  × 1_000_000"; jupiter-swap-adapter getBalance: mint === USDC_MINT ? 6 : 9;
 *  solana-wallet default ?? 6). This is reliably determinable — the close
 *  path can never output a non-USDC token — so the exit price is derivable. */
export const CLOSE_OUTPUT_DECIMALS = 6;

// ---- Types ----

/** Close mode is a budget, not a mechanism (design decision 2). */
export type CloseMode = 'emergency' | 'graceful';

/** Per-position close outcome (design decision 5). ONLY 'closed' removes the
 *  position and mutates state — failed/timed_out leave it in place.
 *
 *  `exitPrice` (per base token, USDC) is the truthful close price derived from
 *  the confirmed swap output — present only when the swap produced a derivable
 *  output amount (never a guess). It feeds the force-close Telegram notice so
 *  a stop/emergency close notifies like a natural close (BUG 7). */
export type CloseResult =
  | { status: 'closed'; txSignature: string; exitPrice?: number }
  | { status: 'failed'; error: string }
  | { status: 'timed_out' };

/** Aggregate outcome of one close run (spec: Close results are observable). */
export interface CloseSummary {
  /** Unique id for this close run — tags every event/log. */
  closeRunId: string;
  /** Positions in the snapshot at run start. */
  total: number;
  /** Positions confirmed closed on-chain (signature obtained). */
  closed: number;
  /** Positions that failed without a confirmed signature. */
  failed: number;
  /** Positions still in flight when the deadline fired. */
  timedOut: number;
  /** Wall-clock duration of the run. */
  durationMs: number;
  /** Symbols (:timeframe) that did NOT confirm closed — what remains
   *  on-chain for the operator to reconcile (spec scenario: mixed outcomes).
   *  Includes BOTH hard failures and timed-out closes: a timed-out swap may
   *  have landed, so its position also remains on-chain and must be surfaced. */
  failedSymbols: string[];
  /** Symbols (:timeframe) that timed out at the close deadline — a subset
   *  reported distinctly so the operator can tell "error" from "still in
   *  flight" when reconciling what remains on-chain. */
  timedOutSymbols?: string[];
}

/** Structured observability events, each tagged closeRunId. Wave 3 wires
 *  these to Telegram / recordError / WS (design decision 7). */
export type CloseEvent =
  | { type: 'stop_started'; closeRunId: string; reason: string; mode: CloseMode; total: number }
  | {
      type: 'close_started';
      closeRunId: string;
      symbol: string;
      timeframe: string;
      attempt: number;
    }
  | {
      type: 'position_closed';
      closeRunId: string;
      symbol: string;
      timeframe: string;
      txSignature: string;
    }
  | {
      type: 'close_failed';
      closeRunId: string;
      symbol: string;
      timeframe: string;
      error: string;
      reason: 'failed' | 'timed_out';
    }
  | { type: 'stop_completed'; closeRunId: string; summary: CloseSummary };

/** Internal per-attempt outcome — adds the retryability signal consumed by
 *  the retry loop. Never part of the public CloseResult contract. */
type AttemptResult =
  | { status: 'closed'; txSignature: string; exitPrice?: number }
  | { status: 'failed'; error: string; retryable: boolean };

/** Constructor DI (tasks.md 2.1). Every dependency is a narrow seam so Wave 3
 *  can wire the engine without the module knowing BotEngine. */
export interface CloseManagerOptions {
  /** Concrete DEX adapter — JupiterSwapAdapter in production. Its
   *  getTransactionStatus is REAL (the ultra adapter stubs 'unknown' and is
   *  NOT a safe close path — design decision 6 risk note). */
  dex: DexAdapter;
  /** Keypair source — the engine's walletManager.getKeypair(). Returns a
   *  SensitiveData wrapper; dispose() must be called after use (mirrors the
   *  executor's pattern, live-strategy-executor.ts 672-675). */
  getKeypair: () => Promise<SensitiveData<WalletKeypair>>;
  /** Engine positions accessor — engine.getPositions() (confirmed-fill gated
   *  truth, design decision 5). */
  getPositions: () => PositionInfo[];
  /** Confirmed-close side effects — Wave 3 wires engine state removal +
   *  persistence. Only ever called with a confirmed signature (decision 5).
   *  The full PositionInfo + CloseResult are passed so the engine can build a
   *  truthful force-close Telegram notice (exitPrice from the swap output)
   *  without the CloseManager knowing anything about Telegram (BUG 7). */
  onPositionClosed: (position: PositionInfo, result: CloseResult) => void;
  /** Failed/timed-out side effects — Wave 3 wires close_failed delivery. The
   *  position stays in place (decision 5). */
  onPositionCloseFailed: (symbol: string, timeframe: string, error: string) => void;
  /** Cross-run double-sell guard (hardening F3) — engine-provided via the
   *  persisted close-attempt tombstones. Invoked before EVERY swap attempt:
   *  the engine records the attempt (persisting the marker BEFORE the swap)
   *  and returns a refusal reason when the position must NOT be re-sold (a
   *  prior close from a different run never confirmed — it may have landed
   *  on-chain but been misreported, so a re-sell after restart is a
   *  double-sell). Return undefined to proceed. Optional for tests; when
   *  absent the close always proceeds. Never throws. */
  preflightClose?: (position: PositionInfo, closeRunId: string) => Promise<string | undefined>;
  /** Observability seam — Wave 3 wires stop_started / close_started /
   *  position_closed / close_failed / stop_completed (spec: Close results are
   *  observable). Every event carries closeRunId. */
  onEvent?: (event: CloseEvent) => void;
  /** Logger — every close is logged with closeRunId. */
  logger: PineLogger;
}

// ---- Helpers ----

/**
 * Reject a promise if it does not settle within `ms`.
 * The timer is cleared on settle so a fast path never holds the process open
 * (critical on the SIGTERM close path — design decision 8).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- CloseManager ----

export class CloseManager {
  private readonly dex: DexAdapter;
  private readonly getKeypair: CloseManagerOptions['getKeypair'];
  private readonly getPositions: CloseManagerOptions['getPositions'];
  private readonly onPositionClosed: CloseManagerOptions['onPositionClosed'];
  private readonly onPositionCloseFailed: CloseManagerOptions['onPositionCloseFailed'];
  private readonly preflightClose: CloseManagerOptions['preflightClose'];
  private readonly onEvent: CloseManagerOptions['onEvent'];
  private readonly logger: PineLogger;

  constructor(options: CloseManagerOptions) {
    this.dex = options.dex;
    this.getKeypair = options.getKeypair;
    this.getPositions = options.getPositions;
    this.onPositionClosed = options.onPositionClosed;
    this.onPositionCloseFailed = options.onPositionCloseFailed;
    this.preflightClose = options.preflightClose;
    this.onEvent = options.onEvent;
    this.logger = options.logger;
  }

  /**
   * Close every open position (snapshot) via confirmed reverse swaps.
   *
   * - Snapshot `getPositions()` once — the close set never changes mid-run and
   *   quantity is the full snapshot quantity, never re-derived from wallet
   *   balance (design decision 5, anti-sim-divergence).
   * - Parallel closes capped at MAX_PARALLEL_CLOSES, each bounded by
   *   PER_CLOSE_TIMEOUT_MS, aggregated with allSettled semantics — one
   *   position's failure never rejects the run.
   * - A global deadline (30s emergency / 60s graceful) guarantees the run
   *   resolves; positions still in flight are reported timed_out.
   *
   * @returns aggregate CloseSummary — the stop ALWAYS completes (decision 2).
   */
  async closeAllPositions(reason: string, mode: CloseMode): Promise<CloseSummary> {
    const closeRunId = randomUUID();
    const startedAt = Date.now();
    const deadlineMs = mode === 'emergency' ? EMERGENCY_DEADLINE_MS : GRACEFUL_DEADLINE_MS;
    const maxRetries = mode === 'emergency' ? EMERGENCY_MAX_RETRIES : GRACEFUL_MAX_RETRIES;

    const positions = this.getPositions();

    this.logger.info('[CloseManager] stop_started', {
      closeRunId,
      reason,
      mode,
      total: positions.length,
      deadlineMs,
    });
    this.emit({ type: 'stop_started', closeRunId, reason, mode, total: positions.length });

    const results = new Map<string, CloseResult>();

    // F4 (security): acquire the keypair ONCE per close run and share the
    // captured private key bytes (Uint8Array) with every worker. WalletManager
    // caches ONE SensitiveData wrapper and returns it to every caller; a
    // per-worker dispose() nulls that shared instance and the other workers
    // hit "SensitiveData has been disposed" mid-quote. Acquiring once and
    // disposing once after Promise.allSettled keeps all MAX_PARALLEL_CLOSES
    // workers safe.
    let keypairData: SensitiveData<WalletKeypair> | undefined;
    try {
      keypairData = await this.getKeypair();
      const privateKey = keypairData.value.privateKey;
      await this.runCloses(positions, results, closeRunId, maxRetries, deadlineMs, privateKey);
    } catch (err) {
      // Fail-closed: no keypair → no swap is possible for ANY position, and
      // no signature exists, so nothing may be re-sold later. Report every
      // position as failed (never sold) so the operator reconciles them.
      const message = `Close run aborted before any swap: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error('[CloseManager] close run aborted before any swap', {
        closeRunId,
        error: message,
      });
      for (const position of positions) {
        if (!results.has(this.positionKey(position))) {
          results.set(this.positionKey(position), { status: 'failed', error: message });
        }
      }
    } finally {
      // Dispose exactly once, after every worker has finished using the bytes.
      keypairData?.dispose();
    }

    const summary = this.aggregate(positions, results, closeRunId, startedAt);

    this.logger.info('[CloseManager] stop_completed', {
      closeRunId,
      total: summary.total,
      closed: summary.closed,
      failed: summary.failed,
      timedOut: summary.timedOut,
      durationMs: summary.durationMs,
      failedSymbols: summary.failedSymbols,
    });
    this.emit({ type: 'stop_completed', closeRunId, summary });

    return summary;
  }

  /**
   * Run the per-position closes with a concurrency cap and the global
   * deadline. A deadline hit stops workers from PULLING new positions (spec:
   * "the bot stops attempting new closes") but in-flight swaps are allowed to
   * finish — a later confirmation still fires position_closed (chain truth),
   * matching the accepted "deadline hits while a swap later confirms" risk
   * (design decision 6).
   */
  private async runCloses(
    positions: PositionInfo[],
    results: Map<string, CloseResult>,
    closeRunId: string,
    maxRetries: number,
    deadlineMs: number,
    privateKey: Uint8Array,
  ): Promise<void> {
    let deadlineReached = false;

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(MAX_PARALLEL_CLOSES, positions.length) },
      async () => {
        while (cursor < positions.length && !deadlineReached) {
          const position = positions[cursor++];
          await this.runClose(position, results, closeRunId, maxRetries, privateKey);
        }
      },
    );

    let deadlineTimer: NodeJS.Timeout | undefined;
    const deadline = new Promise<'deadline'>((resolve) => {
      deadlineTimer = setTimeout(() => {
        deadlineReached = true;
        resolve('deadline');
      }, deadlineMs);
    });

    try {
      // allSettled (not all) per design decision 3: a failing close must not
      // reject the run — workers never reject (each runClose catches), so this
      // is the belt-and-braces guarantee.
      const winner = await Promise.race([Promise.allSettled(workers), deadline]);
      if (winner === 'deadline') {
        this.logger.warn(
          '[CloseManager] close deadline reached — remaining positions marked timed_out',
          {
            closeRunId,
            deadlineMs,
          },
        );
      }
    } finally {
      // Clear the timer so a fast run never holds the process open.
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }

  /**
   * Close one position with the per-close timeout (design decision 3) and
   * own the side-effect dedupe. The worker always records a verdict; a
   * withTimeout rejection means the swap was still in flight (send may have
   * landed, no signature to check → no retry) → timed_out.
   */
  private async runClose(
    position: PositionInfo,
    results: Map<string, CloseResult>,
    closeRunId: string,
    maxRetries: number,
    privateKey: Uint8Array,
  ): Promise<void> {
    let verdictFired = false;

    // Side-effect dedupe: a later confirmed close ALWAYS upgrades an earlier
    // timed_out verdict (the signature IS the truth — design decision 6 — and
    // position_closed is the tx trail the operator verifies); the same status
    // never double-fires (no duplicate close_failed warnings).
    const fireVerdict = (result: CloseResult): void => {
      const isClosedUpgrade = result.status === 'closed' && verdictFired;
      if (verdictFired && !isClosedUpgrade) return;
      verdictFired = true;
      this.applyCloseSideEffects(position, closeRunId, result);
    };

    try {
      const result = await withTimeout(
        this.closePosition(position, closeRunId, maxRetries, fireVerdict, privateKey),
        PER_CLOSE_TIMEOUT_MS,
      );
      results.set(this.positionKey(position), result);
    } catch {
      results.set(this.positionKey(position), { status: 'timed_out' });
      fireVerdict({ status: 'timed_out' });
    }
  }

  /**
   * Single-position close with the retry policy (design decision 6). Always
   * resolves to a CloseResult — never rejects — so one position cannot reject
   * the run. Fire-and-forget side effects run through fireVerdict so a
   * late-confirming background close still surfaces its signature.
   */
  private async closePosition(
    position: PositionInfo,
    closeRunId: string,
    maxRetries: number,
    fireVerdict: (result: CloseResult) => void,
    privateKey: Uint8Array,
  ): Promise<CloseResult> {
    const startedAt = Date.now();
    let lastError = 'Close failed after exhausting retries';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Per-close budget re-checked at the TOP of every attempt: once
      // exhausted the loop MUST NOT start another sell. A timed-out close may
      // still be in flight, so a fresh attempt could double-sell — the budget
      // check is the retry-blocker; withTimeout is the hard guard.
      if (Date.now() - startedAt >= PER_CLOSE_TIMEOUT_MS) {
        const result: CloseResult = { status: 'timed_out' };
        fireVerdict(result);
        return result;
      }

      // Double-sell guard (design decision 6): never attempt a position the
      // engine no longer reports open. No signature exists → never 'closed';
      // report failed with the guard reason.
      if (!this.isPositionOpen(position)) {
        const result: CloseResult = {
          status: 'failed',
          error: 'Position no longer open in engine — close skipped to prevent double-sell',
        };
        fireVerdict(result);
        return result;
      }

      this.logger.info('[CloseManager] close_started', {
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
      });
      this.emit({
        type: 'close_started',
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        attempt: attempt + 1,
      });

      const attemptResult = await this.attemptClose(position, closeRunId, privateKey);

      if (attemptResult.status === 'closed') {
        // Propagate the truthful exit price from the confirmed swap output —
        // without it, handlePositionClosed's exitPrice destructure is undefined
        // and confirmed force-closes notify PnL-less (CloseManagerOptions JSDoc).
        const result: CloseResult = {
          status: 'closed',
          txSignature: attemptResult.txSignature,
          exitPrice: attemptResult.exitPrice,
        };
        fireVerdict(result);
        return result;
      }

      lastError = attemptResult.error;

      // Non-retryable failure (including ambiguous confirm — design decision
      // 6: anything but a confirmed signature is failed, NO retry).
      if (attemptResult.status === 'failed' && !attemptResult.retryable) {
        const result: CloseResult = { status: 'failed', error: attemptResult.error };
        fireVerdict(result);
        return result;
      }

      // Retries exhausted for this mode (emergency 1 / graceful 3, decision 2).
      if (attempt === maxRetries) {
        const result: CloseResult = { status: 'failed', error: lastError };
        fireVerdict(result);
        return result;
      }

      // Retryable failure: backoff (1s/2s/4s + jitter) bounded by the remaining
      // per-close budget so the 20s cap still holds.
      const elapsed = Date.now() - startedAt;
      const waitMs = Math.min(
        this.backoffDelayMs(attempt),
        Math.max(0, PER_CLOSE_TIMEOUT_MS - elapsed),
      );
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    // Unreachable — every iteration returns; kept to satisfy noImplicitReturns.
    return { status: 'failed', error: lastError };
  }

  /**
   * One close attempt: full snapshot quantity → reverse swap (base → USDC)
   * via the PROVEN Jupiter path (design decision 1), mirroring the executor's
   * sell semantics (live-strategy-executor.ts 627-651): inputMint = base mint,
   * outputMint = USDC_MINT, amount = BigInt(Math.floor(quantity * 10**decimals)).
   *
   * F4 (security): the keypair bytes arrive pre-acquired for the whole run and
   * are NEVER acquired or disposed here — a per-attempt acquire would touch
   * WalletManager's shared cached wrapper, and a per-worker dispose() would
   * null it for the other workers mid-quote. Disposal is the run's single
   * finally in closeAllPositions().
   */
  private async attemptClose(
    position: PositionInfo,
    closeRunId: string,
    privateKey: Uint8Array,
  ): Promise<AttemptResult> {
    try {
      // F3 cross-run double-sell guard: mark the attempt (persisted BEFORE the
      // swap) and honor a refusal from a prior non-confirmed close. Called on
      // every attempt; the engine allows same-run retries (matching runId) but
      // refuses a position a DIFFERENT close run left non-confirmed.
      const preflight = this.preflightClose;
      if (preflight) {
        const refused = await preflight(position, closeRunId);
        if (refused) {
          return { status: 'failed', error: refused, retryable: false };
        }
      }

      // LOW (hardening): degenerate quantity input must fail early and
      // permanently — a NaN/zero/fractional quantity would floor to 0 or throw
      // inside BigInt and can never produce a valid on-chain close.
      if (!Number.isFinite(position.quantity) || position.quantity <= 0) {
        return {
          status: 'failed',
          error: `Cannot close position with degenerate quantity ${position.quantity} — no close attempted`,
          retryable: false,
        };
      }

      const tokenInfo = this.resolveTokenInfoForSymbol(position.symbol);
      const amount = BigInt(Math.floor(position.quantity * 10 ** tokenInfo.decimals));

      const quote = await this.dex.quote(tokenInfo.mint, USDC_MINT, amount, CLOSE_SLIPPAGE_BPS);
      const swapResult = await this.dex.swap(quote, privateKey);

      if (swapResult.success && swapResult.signature) {
        return {
          status: 'closed',
          txSignature: swapResult.signature,
          // Truthful exit price from the confirmed swap output — undefined
          // when the output cannot be derived (never-guess PnL rule). The
          // engine's force-close notice uses it to notify like a natural close.
          exitPrice: this.deriveCloseExitPrice(swapResult, position),
        };
      }

      if (swapResult.success && !swapResult.signature) {
        // Anti-sim-divergence (design decision 5): no signature = no proof.
        // The swap may have executed — never retry (double-sell guard).
        return {
          status: 'failed',
          error: 'Swap reported success without a signature — closure unconfirmed, not retried',
          retryable: false,
        };
      }

      // Ambiguous confirm (Wave 1 enabler): the send landed but confirm raced —
      // the failure carries a signature. Verify on-chain BEFORE deciding; NO
      // retry either way (design decision 6).
      if (swapResult.signature) {
        return this.resolveAmbiguousOutcome(swapResult.signature, closeRunId);
      }

      // No signature. F2 (security): a send-phase transport loss (e.g.
      // connection.sendTransaction succeeded on-chain but the HTTP response was
      // lost) surfaces here as `socket hang up` / `fetch failed` with NO
      // signature — indistinguishable from a true pre-send failure by message
      // alone. Classify fail-closed: any network/transport error is treated as
      // AMBIGUOUS (the swap may have landed) and is never retried.
      const error = swapResult.error ?? 'Swap failed';
      return { status: 'failed', error, retryable: this.isRetryableError(error) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // quote()/swap() surface transport errors here after their internal
      // retries (jupiter-swap-adapter.ts) — classify so the close-level retry
      // policy can decide (design decision 6). resolveTokenInfoForSymbol
      // failures (MED fail-closed) land here as permanent (not retryable).
      return { status: 'failed', error: message, retryable: this.isRetryableError(message) };
    }
  }

  /**
   * Ambiguity rule (design decision 6): a failed swap that carries a signature
   * means the send landed but confirmation raced. Do a single read-only
   * getTransactionStatus check — 'confirmed' → closed (the signature IS the
   * truth); anything else → failed, NO retry (no double-sell). If the RPC is
   * unavailable, degrade to 'failed, no retry' (safe, less complete).
   */
  private async resolveAmbiguousOutcome(
    signature: string,
    closeRunId: string,
  ): Promise<AttemptResult> {
    this.logger.warn('[CloseManager] ambiguous swap outcome — verifying on-chain before deciding', {
      closeRunId,
      signature,
    });

    let status: TxStatus;
    try {
      status = await this.dex.getTransactionStatus(signature);
    } catch (err) {
      // RPC unavailable → degrade to 'failed, no retry' (safe, less complete —
      // design decision 6 risk note). Logged, not swallowed.
      this.logger.warn(
        '[CloseManager] getTransactionStatus failed — degrading ambiguous outcome to failed',
        {
          closeRunId,
          signature,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      status = 'unknown';
    }

    if (status === 'confirmed') {
      return { status: 'closed', txSignature: signature };
    }

    return {
      status: 'failed',
      error: `Ambiguous swap outcome — signature ${signature} is ${status} on-chain; not retried to prevent double-sell`,
      retryable: false,
    };
  }

  /**
   * Derive the truthful close exit price (USDC per base token) from a
   * confirmed swap output — undefined when it cannot be derived (never-guess
   * PnL rule; the engine then renders a PnL-less notice instead of inventing
   * $0.00).
   *
   * A close is always base → USDC (USDC_MINT hardcoded above), so the output
   * amount is micro-USDC and USDC has a fixed 6 decimals (CLOSE_OUTPUT_DECIMALS
   * — same assumption the executor and DEX adapters make). Exit price =
   * outputAmount / 10^6 / quantity.
   *
   * Guards: the output amount must parse to a finite positive number and the
   * quantity must be positive. The ambiguous-confirm path
   * (resolveAmbiguousOutcome) never reaches here — it has no output amount —
   * so its confirmed verdicts carry no exitPrice (undefined).
   */
  private deriveCloseExitPrice(swapResult: SwapResult, position: PositionInfo): number | undefined {
    if (!Number.isFinite(position.quantity) || position.quantity <= 0) return undefined;
    const outputAmount = swapResult.outputAmount;
    if (typeof outputAmount !== 'string' || outputAmount.trim() === '') return undefined;
    const output = Number(outputAmount);
    if (!Number.isFinite(output) || output <= 0) return undefined;
    return output / 10 ** CLOSE_OUTPUT_DECIMALS / position.quantity;
  }

  /**
   * Resolve mint + decimals for a position symbol — mirrors the executor's
   * fallback chain (live-strategy-executor.ts 1216-1230): full pair symbol →
   * base symbol → THROW for unknown symbols. Sell sizing uses the real token
   * decimals so fractional quantities convert to correct on-chain units.
   *
   * MED (fail-closed): a CLOSE must NEVER default an unknown symbol to USDC —
   * that would attempt a USDC→USDC no-op and silently strand the position.
   * Unknown symbol → throw (permanent, non-retryable) so the operator is told
   * the close could not be sized, and nothing is sold.
   */
  private resolveTokenInfoForSymbol(symbol: string): { mint: string; decimals: number } {
    if (isValidPairSymbol(symbol)) {
      const info = getTokenInfo(symbol);
      return { mint: info.mint, decimals: info.decimals };
    }
    const pairSymbol = `${symbol}USDT`;
    if (isValidPairSymbol(pairSymbol)) {
      const info = getTokenInfo(pairSymbol);
      return { mint: info.mint, decimals: info.decimals };
    }
    throw new Error(
      `Cannot close position for unknown symbol "${symbol}" — no mint/decimals in the token registry; no close attempted (fail-closed)`,
    );
  }

  /**
   * Retryability classification (design decision 6 + hardening F2/LOW): retry
   * ONLY errors that carry positive evidence the previous attempt did NOT
   * execute on-chain. Everything else is treated as AMBIGUOUS and is never
   * retried — a swap whose send may have landed must never be re-sent.
   *
   * Provably-safe signals: an expired blockhash (the RPC rejected the signed
   * transaction before acceptance — a fresh attempt rebuilds it) and 429 /
   * rate-limit (the RPC declined the request outright).
   *
   * Deliberately NOT retryable, even though they used to be:
   * - timeouts / `socket hang up` / `fetch failed` / connection errors (F2):
   *   `connection.sendTransaction()` may have landed on-chain while the HTTP
   *   response was lost — retrying is a second sell.
   * - 5xx statuses: the status-code regex previously matched ANY `\b5\d{2}\b`
   *   substring (e.g. an amount "500"), and a 5xx from /swap is ambiguous —
   *   the server may have broadcast before erroring (LOW + F2).
   */
  private isRetryableError(message: string): boolean {
    const m = message.toLowerCase();
    if (/429|rate limit/.test(m)) return true;
    if (/blockhash|expired/.test(m)) return true;
    return false;
  }

  /** Retry backoff (design decision 2): 1s/2s/4s + jitter. Equal jitter
   *  (cap/2 + random(0, cap/2), error-patterns skill) keeps a minimum delay
   *  while avoiding synchronized retry storms. */
  private backoffDelayMs(retryIndex: number): number {
    const cap = RETRY_BACKOFF_BASE_MS * 2 ** retryIndex;
    return Math.floor(cap / 2 + Math.random() * (cap / 2));
  }

  /** Never attempt a close for a position the engine no longer reports open
   *  (design decision 6). A throwing accessor (e.g. executor nulled
   *  mid-teardown) degrades to "not open" — the safe default is to NOT sell. */
  private isPositionOpen(position: PositionInfo): boolean {
    try {
      return this.getPositions().some(
        (p) => p.symbol === position.symbol && p.timeframe === position.timeframe,
      );
    } catch (err) {
      this.logger.warn(
        '[CloseManager] getPositions failed during close — treating position as not open',
        {
          symbol: position.symbol,
          timeframe: position.timeframe,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return false;
    }
  }

  /** Fire the per-position side effects + observability for a verdict. A
   *  callback throw must never abort the run nor roll back a confirmed close
   *  (design decision 5: signature is truth; persistence throwing mid-close is
   *  logged loudly, never rolled back). */
  private applyCloseSideEffects(
    position: PositionInfo,
    closeRunId: string,
    result: CloseResult,
  ): void {
    if (result.status === 'closed') {
      this.logger.info('[CloseManager] position_closed', {
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        txSignature: result.txSignature,
      });
      this.emit({
        type: 'position_closed',
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        txSignature: result.txSignature,
      });
      this.callSafely(
        () => this.onPositionClosed(position, result),
        'onPositionClosed',
        closeRunId,
      );
    } else {
      const error =
        result.status === 'failed' ? result.error : 'Close timed out before confirmation';
      this.logger.warn('[CloseManager] close_failed', {
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        error,
        reason: result.status,
      });
      this.emit({
        type: 'close_failed',
        closeRunId,
        symbol: position.symbol,
        timeframe: position.timeframe,
        error,
        reason: result.status,
      });
      this.callSafely(
        () => this.onPositionCloseFailed(position.symbol, position.timeframe, error),
        'onPositionCloseFailed',
        closeRunId,
      );
    }
  }

  /** Invoke a Wave-3 DI callback; a throw is logged loudly and swallowed. */
  private callSafely(fn: () => void, name: string, closeRunId: string): void {
    try {
      fn();
    } catch (err) {
      this.logger.error(`[CloseManager] ${name} callback threw`, {
        closeRunId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Emit a structured CloseEvent through the Wave-3 seam (if wired). */
  private emit(event: CloseEvent): void {
    const onEvent = this.onEvent;
    if (onEvent) {
      this.callSafely(() => onEvent(event), 'onEvent', event.closeRunId);
    }
  }

  /** Aggregate the run summary. A position with no recorded result was still
   *  in flight when the global deadline fired → timed_out (design decision 2:
   *  on deadline, remaining positions → timed_out). */
  private aggregate(
    positions: PositionInfo[],
    results: Map<string, CloseResult>,
    closeRunId: string,
    startedAt: number,
  ): CloseSummary {
    let closed = 0;
    let failed = 0;
    let timedOut = 0;
    const failedSymbols: string[] = [];
    const timedOutSymbols: string[] = [];

    for (const position of positions) {
      const result = results.get(this.positionKey(position)) ?? ({ status: 'timed_out' } as const);
      switch (result.status) {
        case 'closed':
          closed++;
          break;
        case 'failed':
          failed++;
          // failedSymbols = positions that did NOT confirm closed — what
          // remains on-chain for the operator to reconcile (spec: mixed
          // outcomes). timed_out symbols are also still on-chain (the swap may
          // have landed) and therefore ALSO belong in this set.
          failedSymbols.push(`${position.symbol}:${position.timeframe}`);
          break;
        case 'timed_out':
          timedOut++;
          // A timed-out close leaves the position on-chain — it belongs in
          // failedSymbols (so the operator knows what remains) and is also
          // reported distinctly in timedOutSymbols (error vs still-in-flight).
          failedSymbols.push(`${position.symbol}:${position.timeframe}`);
          timedOutSymbols.push(`${position.symbol}:${position.timeframe}`);
          break;
      }
    }

    return {
      closeRunId,
      total: positions.length,
      closed,
      failed,
      timedOut,
      durationMs: Date.now() - startedAt,
      failedSymbols,
      timedOutSymbols,
    };
  }

  private positionKey(position: PositionInfo): string {
    return `${position.symbol}:${position.timeframe}`;
  }
}
