/**
 * Shared `bot:snapshot` payload builder (SSOT — design D2).
 *
 * Every snapshot broadcast site MUST build its payload through this function:
 * the gateway connect handler, the null-engine fallback, and the state-change
 * re-broadcast. That is what makes `chaosSignals` and truthful
 * `status.positions` impossible to omit again — the state-change re-broadcast
 * historically dropped `chaosSignals`, which wiped collected markers on every
 * Running transition.
 *
 * WHY engine accessors instead of the snapshot's own fields:
 *   - `getSnapshot().positions` is the legacy always-empty stub. The frontend
 *     reads `msg.data.status.positions`, so the builder overwrites it with the
 *     executor-derived truth from `engine.getPositions()` (dashboard-positions
 *     spec: "no positions" must be truthful, never a placeholder).
 *   - `pairs` (running pairs) and `feedState` are engine-only state not present
 *     on the snapshot at all. Carrying them in the connect-time snapshot means
 *     a fresh page load on a silent feed is not blind (bot-feed-telemetry
 *     spec, SHOULD-FIX #7).
 *
 * The hoisted fields (`chaosSignals`, `chaosHeartbeat`, `totalCandleErrors`,
 * `chaosMode`) are preserved at the top level to match the existing
 * useBotWebSocket convention — the hook reads those from `msg.data`, not from
 * `msg.data.status`.
 */
import { BotState, type BotEngine, type BotStatusSnapshot } from 'pine-framework';

/** Executor-derived open positions (PositionInfo[]). */
type Positions = ReturnType<BotEngine['getPositions']>;
/** Running pairs (PairId[]) — engine truth for the mini-chart pair source. */
type RunningPairs = ReturnType<BotEngine['getRunningPairs']>;
/** Live bar-feed telemetry (FeedStatus). */
type FeedState = ReturnType<BotEngine['getFeedStatus']>;
/** Recent chaos signal records (ChaosSignalRecord[]). */
type ChaosSignals = ReturnType<BotEngine['getChaosHistory']>;

/** The full `bot:snapshot` payload — the object broadcast under `msg.data`. */
export interface BotSnapshotPayload {
  /** Snapshot plus the fields the frontend reads that the snapshot itself
   *  cannot provide (positions truth, running pairs, feed telemetry). */
  status: Omit<BotStatusSnapshot, 'positions'> & {
    positions: Positions;
    pairs: RunningPairs;
    feedState: FeedState;
  };
  /** Full chaos marker history — always present so clients that replace their
   *  signal array on snapshot never lose collected markers. */
  chaosSignals: ChaosSignals;
  chaosHeartbeat: BotStatusSnapshot['chaosHeartbeat'];
  totalCandleErrors: BotStatusSnapshot['totalCandleErrors'];
  chaosMode: BotStatusSnapshot['chaosMode'];
}

/**
 * Default status when no engine is configured (the gateway's null-engine
 * branch). Mirrors the full snapshot shape so the null payload is
 * shape-identical to a live-engine payload — only values differ.
 */
const NULL_ENGINE_SNAPSHOT: BotStatusSnapshot = {
  state: BotState.Idle,
  strategyName: '(not configured)',
  dex: 'jupiter-swap',
  walletPublicKey: null,
  startedAt: null,
  uptimeMs: 0,
  balance: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  positions: [],
  exposure: 0,
  errors: [],
  lastTransition: null,
  chaosMode: { enabled: false, executionMode: 'live' },
  totalCandleErrors: 0,
  chaosHeartbeat: null,
  warmUpComplete: false,
};

/** Default feed telemetry when no engine is configured — disconnected, no
 *  subscriptions, no candles. */
const NULL_ENGINE_FEED_STATE: FeedState = {
  connected: false,
  subscriptions: [],
  lastCandleAt: null,
  candleCount: 0,
  // Truthful "no feed" defaults for the liveness fields added in 4c7c11e —
  // no engine means no kline messages, so no tick timestamp and zero ticks.
  lastTickAt: null,
  tickCount: 0,
};

/**
 * Build the complete `bot:snapshot` payload for a single shared contract.
 *
 * `engine === null` (or `snapshot === null`) yields the empty defaults — the
 * payload is still the same shape, so a client connecting before the engine
 * exists receives the same structure it would from a live engine.
 */
export function buildSnapshotPayload(
  snapshot: BotStatusSnapshot | null,
  engine: BotEngine | null,
): BotSnapshotPayload {
  if (!engine || !snapshot) {
    return {
      status: {
        ...NULL_ENGINE_SNAPSHOT,
        positions: [],
        pairs: [],
        feedState: NULL_ENGINE_FEED_STATE,
      },
      chaosSignals: [],
      chaosHeartbeat: null,
      totalCandleErrors: 0,
      chaosMode: NULL_ENGINE_SNAPSHOT.chaosMode,
    };
  }

  return {
    status: {
      ...snapshot,
      positions: engine.getPositions(),
      pairs: engine.getRunningPairs(),
      feedState: engine.getFeedStatus(),
    },
    chaosSignals: engine.getChaosHistory(),
    chaosHeartbeat: snapshot.chaosHeartbeat,
    totalCandleErrors: snapshot.totalCandleErrors,
    chaosMode: snapshot.chaosMode,
  };
}
