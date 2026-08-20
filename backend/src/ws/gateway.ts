import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Bar } from 'pine-framework';
import { normalizeExecutionResultMessage } from 'pine-framework/contracts';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import { ScriptSession } from '../session/ScriptSession.js';
import type { TelegramService } from '../telegram/TelegramService.js';
import { validateBybitUrl } from '../utils/security.js';
import { setBroadcastIndicatorRemoved } from './broadcast.js';
import { formatCandleString, getBybitCategory, getBybitSymbol } from 'pine-framework';
import { createBackendLogger } from '../utils/logger.js';
import type { CancellationRegistry } from '../cancellation-registry.js';

const logger = createBackendLogger('backend', 'ws');

interface ClientSubscription {
  ws: WebSocket;
  topics: Set<string>;
  sessions: Map<string, ScriptSession>;
}

const BYBIT_WS_URL = (() => {
  const url = process.env.BYBIT_WS_URL || 'wss://stream.bybit.com/v5/public/linear';
  validateBybitUrl(url, 'BYBIT_WS_URL');
  return url;
})();

/** Spot WebSocket endpoint — used for the 3 mapped spot instruments
 *  (GOLDUSDC/TSLAXUSDC/AAPLXUSDC). Fixed constant: BYBIT_WS_URL is the legacy
 *  linear endpoint override; Bybit's spot public endpoint has no override. */
const BYBIT_SPOT_WS_URL = 'wss://stream.bybit.com/v5/public/spot';

/** Track the most recent confirmed bar per topic for price-reasonability checks. */
const lastConfirmedBarByTopic = new Map<string, Bar>();

/** Cached frontend loggers by subcategory — one logger per subcategory writes to its own file. */
const frontendLoggers = new Map<string, ReturnType<typeof createBackendLogger>>();

function getOrCreateFrontendLogger(subcategory: string) {
  if (!frontendLoggers.has(subcategory)) {
    frontendLoggers.set(subcategory, createBackendLogger('frontend', subcategory));
  }
  return frontendLoggers.get(subcategory)!;
}

/**
 * Reject a bar if its prices are clearly unreasonable.
 * Returns a rejected-reason string or null if the bar passes.
 */
export function rejectIfUnreasonable(bar: Bar, prevBar?: Bar): string | null {
  if (!isFinite(bar.open) || !isFinite(bar.high) || !isFinite(bar.low) || !isFinite(bar.close)) {
    return 'non-finite price';
  }
  if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
    return 'zero or negative price';
  }
  if (bar.high < bar.low) {
    return 'high < low';
  }
  if (bar.open < bar.low || bar.open > bar.high) {
    return 'open outside high-low range';
  }
  if (bar.close < bar.low || bar.close > bar.high) {
    return 'close outside high-low range';
  }
  if (prevBar && prevBar.close > 0) {
    const changeRatio = Math.abs(bar.close - prevBar.close) / prevBar.close;
    if (changeRatio > 0.5) {
      return `close Δ ${(changeRatio * 100).toFixed(0)}% from previous close (${prevBar.close} → ${bar.close})`;
    }
  }
  return null;
}

export function createWSGateway(
  server: Server,
  cache: OHLCVCache,
  telegramService?: TelegramService,
  registry?: CancellationRegistry,
): void {
  // Use noServer mode to avoid conflicts with the bot /ws/bot gateway
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientSubscription>();
  /** Per-category Bybit sockets — 'linear' opened at startup (as today),
   *  'spot' opened lazily on the first spot-instrument subscribe and closed
   *  when its last subscription drops. */
  const bybitSockets = new Map<'linear' | 'spot', WebSocket>();
  /** Bidirectional routing table: Bybit topic → original frontend topic.
   *  Bybit reports the BYBIT instrument symbol (e.g. 'kline.60.XAUTUSDT'),
   *  but clients subscribe/broadcast under the pair topic
   *  ('kline.60.GOLDUSDC'). Legacy pairs map identity — zero behavior change. */
  const bybitTopicToOriginal = new Map<
    string,
    { originalTopic: string; category: 'linear' | 'spot' }
  >();
  const topicCallbacks = new Map<string, Set<WebSocket>>();

  // Handle upgrade requests for /ws path (but NOT /ws/bot)
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Let other handlers (like /ws/bot gateway) handle their own paths
  });

  /** Translate a frontend topic ('kline.60.GOLDUSDC') into the Bybit topic +
   *  category ('kline.60.XAUTUSDT', 'spot'). Null for unparseable topics —
   *  callers fall back to forwarding the raw topic (legacy behavior). */
  function translateFrontendTopic(
    topic: string,
  ): { bybitTopic: string; category: 'linear' | 'spot' } | null {
    const parts = topic.split('.');
    if (parts.length < 3 || !parts[1] || !parts[2]) return null;
    return {
      bybitTopic: `kline.${parts[1]}.${getBybitSymbol(parts[2])}`,
      category: getBybitCategory(parts[2]),
    };
  }

  /** Get (or lazily create) the Bybit socket for a category. 'linear' is
   *  created at startup via connectToBybit(); 'spot' is created here on the
   *  first spot-instrument subscribe. */
  function ensureBybitSocket(category: 'linear' | 'spot'): WebSocket | null {
    const existing = bybitSockets.get(category);
    if (existing && existing.readyState === WebSocket.OPEN) return existing;

    const socket = new WebSocket(category === 'linear' ? BYBIT_WS_URL : BYBIT_SPOT_WS_URL);
    bybitSockets.set(category, socket);

    socket.on('open', () => {
      // Identity guard: a stale socket's delayed open must not resubscribe a
      // newer socket's subscriptions.
      if (bybitSockets.get(category) !== socket) return;
      logger.info('Connected to Bybit WebSocket', { category });
      resubscribeAll(category);
    });

    // B2: serialize live re-execution per Bybit socket. executeBars is now
    // async and yields, so a bare fire-and-forget would let two bars
    // interleave on the same session (out-of-order strategy state). Chaining
    // preserves the sync-handler ordering guarantee while staying
    // non-blocking between runs (the engine yields to the event loop).
    let reexecuteChain: Promise<void> = Promise.resolve();

    socket.on('message', (data: Buffer) => {
      if (bybitSockets.get(category) !== socket) return;
      try {
        const msg = JSON.parse(data.toString()) as {
          topic?: string;
          type?: string;
          data?: {
            symbol?: string;
            interval?: string;
            open?: string;
            high?: string;
            low?: string;
            close?: string;
            volume?: string;
            timestamp?: string;
            start?: string;
          };
        };

        if (msg.topic && msg.topic.startsWith('kline.') && msg.data) {
          const dataArr = Array.isArray(msg.data) ? msg.data : [msg.data];
          if (dataArr.length === 0) return;
          const d = dataArr[0]!;
          const timestamp = parseInt(String(d.start || d.timestamp || '0'), 10);
          const open = parseFloat(String(d.open || '0'));
          const high = parseFloat(String(d.high || '0'));
          const low = parseFloat(String(d.low || '0'));
          const close = parseFloat(String(d.close || '0'));
          const volume = parseFloat(String(d.volume || '0'));
          const confirmed = d.confirm === true || d.confirm === 'true';

          if (
            !timestamp ||
            !isFinite(open) ||
            !isFinite(high) ||
            !isFinite(low) ||
            !isFinite(close)
          ) {
            return;
          }

          const bar: Bar = { timestamp, open, high, low, close, volume };
          // Route under the ORIGINAL frontend topic — Bybit's topic carries
          // the BYBIT instrument symbol; the table maps it back to the pair
          // topic. Unmapped topics fall back to the raw split path (legacy).
          const mapped = bybitTopicToOriginal.get(msg.topic);
          const broadcastTopic = mapped?.originalTopic ?? msg.topic;
          const topicParts = broadcastTopic.split('.');
          const symbol = topicParts[2] || '';
          const interval = String(d.interval || topicParts[1] || '');
          if (!symbol || !interval) return;

          // Price sanity check — reject clearly invalid ticks
          {
            const topicKey = `${symbol}:${interval}`;
            const prevBar = lastConfirmedBarByTopic.get(topicKey);
            const rejectReason = rejectIfUnreasonable(bar, prevBar);
            if (rejectReason) {
              logger.warn('Rejected kline tick', {
                symbol,
                interval,
                reason: rejectReason,
                open,
                high,
                low,
                close,
                volume,
                timestamp,
              });
              return;
            }
            if (confirmed) {
              lastConfirmedBarByTopic.set(topicKey, bar);
            }
          }

          // Instrumentation: log price delta vs last confirmed bar
          {
            const topicKey = `${symbol}:${interval}`;
            const prevBar = lastConfirmedBarByTopic.get(topicKey);
            if (prevBar && prevBar.timestamp !== bar.timestamp) {
              const delta = (((bar.close - prevBar.close) / prevBar.close) * 100).toFixed(2);
              logger.debug('kline close', {
                symbol,
                interval,
                delta,
                prevClose: prevBar.close,
                currentClose: bar.close,
              });
            }
          }

          // Merge single-bar WS update into cache instead of replacing
          if (symbol && interval) {
            const existing = cache.get(symbol, interval);
            if (existing && existing.length > 0) {
              const idx = existing.findIndex((b) => b.timestamp === bar.timestamp);
              if (idx >= 0) {
                existing[idx] = bar;
              } else {
                existing.push(bar);
              }
              cache.set(symbol, interval, existing);
            } else {
              cache.set(symbol, interval, [bar]);
            }
          }

          // Diagnostic: log raw Bybit WS data and computed bar
          const rawBybit = {
            start: d.start,
            dtimestamp: d.timestamp,
            interval: d.interval,
            rawOpen: d.open,
            rawHigh: d.high,
            rawLow: d.low,
            rawClose: d.close,
            confirm: d.confirm,
          };
          logger.info('Bybit WS raw → broadcast', {
            topic: msg.topic,
            rawBybit,
            parsed: bar,
            confirmed,
          });

          broadcast(broadcastTopic, {
            type: 'kline',
            data: { symbol, interval, ...bar, confirmed },
          });

          reexecuteChain = reexecuteChain
            .then(() => reexecuteForTopic(broadcastTopic, bar, confirmed))
            .catch((err) => {
              logger.error('reexecuteForTopic failed', {
                message: err instanceof Error ? err.message : String(err),
              });
            });
        }
      } catch {
        // ignore parse errors
      }
    });

    socket.on('close', () => {
      if (bybitSockets.get(category) !== socket) return;
      logger.info('Bybit WebSocket disconnected, reconnecting in 3s', { category });
      bybitSockets.delete(category);
      setTimeout(() => ensureBybitSocket(category), 3000);
    });

    socket.on('error', (err) => {
      logger.error('Bybit WebSocket error', { category, message: err.message });
    });

    return socket;
  }

  function connectToBybit(): void {
    // Linear stays open as today — the 7 legacy pairs stream linear.
    ensureBybitSocket('linear');
  }

  // Per-topic alert dedup with TTL: Map<topic, Map<dedupKey, timestamp>>
  // Automatically evicts entries older than 5 minutes and caps at 100 per topic.
  const DEDUP_TTL_MS = 5 * 60 * 1000;
  const MAX_DEDUP_KEYS_PER_TOPIC = 100;
  const alertDedupByTopic = new Map<string, Map<string, number>>();

  function pruneDedupKeys(topic: string): Map<string, number> {
    let keys = alertDedupByTopic.get(topic);
    if (!keys) {
      keys = new Map();
      alertDedupByTopic.set(topic, keys);
    }
    const now = Date.now();
    // Prune expired entries
    for (const [key, ts] of keys) {
      if (now - ts > DEDUP_TTL_MS) {
        keys.delete(key);
      }
    }
    return keys;
  }

  function isDuplicateAlert(topic: string, dedupKey: string): boolean {
    const keys = pruneDedupKeys(topic);
    if (keys.has(dedupKey)) return true;
    // Evict oldest if over capacity
    if (keys.size >= MAX_DEDUP_KEYS_PER_TOPIC) {
      const oldest = keys.entries().next().value;
      if (oldest) keys.delete(oldest[0]);
    }
    keys.set(dedupKey, Date.now());
    return false;
  }

  // B2: reexecuteForTopic is ASYNC — ScriptSession.appendOrUpdateBar is async
  // now (its cold-start fallback awaits the batch initialize), and the live
  // tick path stays serialized per socket via the reexecute chain at the
  // Bybit message handler.
  async function reexecuteForTopic(topic: string, bar: Bar, confirmed?: boolean): Promise<void> {
    const subscribers = topicCallbacks.get(topic);
    if (!subscribers) {
      logger.info('reexecuteForTopic: no subscribers', { topic });
      return;
    }

    // Prune stale connections before iterating
    for (const cb of subscribers) {
      if (cb.readyState !== WebSocket.OPEN) subscribers.delete(cb);
    }

    const topicParts = topic.split('.');
    const symbol = topicParts[2] || '';
    const interval = topicParts[1] || '';

    for (const ws of subscribers) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      const sub = clients.get(ws);
      if (!sub) {
        continue;
      }
      if (sub.sessions.size === 0) {
        continue;
      }

      for (const [indicatorId, session] of sub.sessions) {
        try {
          const outputs = await session.appendOrUpdateBar(bar, confirmed);

          // WIRE EGRESS BACKSTOP (B2 — the third normalize call site):
          // the serializers normalize internally, but this is where the
          // payload actually leaves to the wire. Normalizing here is
          // idempotent (normalize∘normalize == same shape) and guarantees
          // the wire always carries a contract-complete message even if a
          // future producer path skips its own normalize.
          ws.send(
            JSON.stringify({
              type: 'execution_result',
              indicatorId,
              data: normalizeExecutionResultMessage(outputs),
            }),
          );

          const tgActive = telegramService?.isActive() ?? false;
          const isConfirmed = outputs.isConfirmed ?? false;

          if (!isConfirmed) {
          } else if (tgActive && telegramService) {
            // Use ONLY the new triggers from the most recent confirmed bar,
            // not all accumulated historical triggers.  session.getPendingNewAlertTriggers()
            // returns the diff and clears them so they are sent only once.
            const triggers = session.getPendingNewAlertTriggers();
            if (triggers.length === 0) {
              logger.info('reexecuteForTopic: no new alert triggers', { indicatorId });
            }
            for (const trigger of triggers) {
              const condition = outputs.alertConditions?.find((c) => c.id === trigger.alertId);
              const message =
                condition?.message ||
                `Alert triggered at ${new Date(trigger.timestamp).toISOString()}`;
              const title = condition?.title || trigger.alertId;
              const dedupKey = `${trigger.alertId}:${trigger.timestamp}:${topic}`;
              if (isDuplicateAlert(topic, dedupKey)) {
                logger.info('reexecuteForTopic: duplicate alert suppressed', { dedupKey });
                continue;
              }
              logger.info('reexecuteForTopic: sending Telegram alert', {
                alertId: trigger.alertId,
                title,
                symbol,
                interval,
              });
              const formattedMessage = formatCandleString(message, {
                ticker: symbol || undefined,
                interval: interval || undefined,
              });
              telegramService.sendAlertToSubscribers(
                `*${title}*\n\n${formattedMessage}`,
                trigger.alertId,
                symbol || undefined,
                interval || undefined,
              );
            }
          } else if (!tgActive) {
            logger.info('reexecuteForTopic: Telegram service is NOT active, skipping alert send');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Script re-execution failed';
          logger.error('Script re-execution error', { indicatorId, message });
          ws.send(
            JSON.stringify({
              type: 'error',
              indicatorId,
              data: { message },
            }),
          );
        }
      }
    }
  }

  function resubscribeAll(category: 'linear' | 'spot'): void {
    const socket = bybitSockets.get(category);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const allTopics = new Set<string>();
    for (const sub of clients.values()) {
      for (const topic of sub.topics) {
        allTopics.add(topic);
      }
    }
    // Translate every client topic to its Bybit topic, keep only this
    // category's instruments. Legacy pairs translate identity.
    const bybitTopics: string[] = [];
    for (const topic of allTopics) {
      const translated = translateFrontendTopic(topic);
      if (translated && translated.category === category) {
        bybitTopics.push(translated.bybitTopic);
      }
    }
    if (bybitTopics.length > 0) {
      socket.send(JSON.stringify({ op: 'subscribe', args: bybitTopics }));
    }
  }

  /** Unsubscribe a Bybit topic (and possibly close the lazy spot socket) once
   *  the LAST client drops an original topic. No-op while any client remains
   *  subscribed to the original topic. */
  function handleLastUnsubscribe(originalTopic: string): void {
    for (const sub of clients.values()) {
      if (sub.topics.has(originalTopic)) return; // still subscribed elsewhere
    }
    for (const [bybitTopic, mapped] of bybitTopicToOriginal) {
      if (mapped.originalTopic !== originalTopic) continue;
      const socket = bybitSockets.get(mapped.category);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ op: 'unsubscribe', args: [bybitTopic] }));
      }
      bybitTopicToOriginal.delete(bybitTopic);
    }
    // Close the lazily-opened spot socket when no spot topics remain; linear
    // stays open as today.
    const hasSpot = Array.from(bybitTopicToOriginal.values()).some((m) => m.category === 'spot');
    if (!hasSpot) {
      const spotSocket = bybitSockets.get('spot');
      if (spotSocket) {
        bybitSockets.delete('spot');
        spotSocket.close();
      }
    }
  }

  function broadcast(topic: string, message: object): void {
    const subscribers = topicCallbacks.get(topic);
    if (!subscribers) return;
    const payload = JSON.stringify(message);
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function broadcastToAll(message: object): void {
    const payload = JSON.stringify(message);
    for (const sub of clients.values()) {
      if (sub.ws.readyState === WebSocket.OPEN) {
        sub.ws.send(payload);
      }
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    logger.info('Client connected');
    const sub: ClientSubscription = { ws, topics: new Set(), sessions: new Map() };
    clients.set(ws, sub);

    ws.send(
      JSON.stringify({
        type: 'connected',
        data: { connectionId: Math.random().toString(36).slice(2) },
      }),
    );

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          channel?: string;
          topic?: string;
          indicatorId?: string;
          data?: {
            source?: string;
            symbol?: string;
            interval?: string;
            bars?: Bar[];
            indicatorId?: string;
          };
        };

        if (msg.type === 'subscribe' && msg.topic) {
          sub.topics.add(msg.topic);
          if (!topicCallbacks.has(msg.topic)) {
            topicCallbacks.set(msg.topic, new Set());
          }
          // Prune stale (closed) connections before adding new one
          const callbacks = topicCallbacks.get(msg.topic)!;
          for (const cb of callbacks) {
            if (cb.readyState !== WebSocket.OPEN) callbacks.delete(cb);
          }
          callbacks.add(ws);

          // Translate the frontend topic to the Bybit instrument topic and
          // route it to the category's socket (spot for the 3 mapped pairs).
          // The routing table is populated HERE so inbound Bybit messages can
          // be mapped back to the original topic; legacy pairs map identity.
          const translated = translateFrontendTopic(msg.topic);
          if (translated) {
            bybitTopicToOriginal.set(translated.bybitTopic, {
              originalTopic: msg.topic,
              category: translated.category,
            });
            const socket = ensureBybitSocket(translated.category);
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ op: 'subscribe', args: [translated.bybitTopic] }));
            }
          } else if (bybitSockets.get('linear')?.readyState === WebSocket.OPEN) {
            // Defensive fallback for unparseable topics: forward verbatim on
            // the linear socket (legacy behavior).
            bybitSockets
              .get('linear')!
              .send(JSON.stringify({ op: 'subscribe', args: [msg.topic] }));
          }
        } else if (msg.type === 'unsubscribe' && msg.topic) {
          sub.topics.delete(msg.topic);
          topicCallbacks.get(msg.topic)?.delete(ws);
          handleLastUnsubscribe(msg.topic);
        } else if (msg.type === 'execute' && msg.data) {
          const { source, symbol, interval, bars, indicatorId } = msg.data;
          if (!source || !bars || bars.length === 0) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'Missing source or bars' } }));
            return;
          }

          const sessionIndicatorId = indicatorId || 'default';

          // B2: a fresh token supersedes any in-flight run for this id (a
          // stale session's initialize stops at its next yield instead of
          // racing the new run). Registered for the batch initialize only —
          // the entry is removed once the session is live (per-bar ticks are
          // synchronous and need no batch cancellation).
          const token = registry?.create(sessionIndicatorId);
          try {
            // Delete old session first to prevent reexecuteForTopic from
            // using a stale session during initialization.
            sub.sessions.delete(sessionIndicatorId);
            const session = new ScriptSession(source, symbol || '', interval || '', bars);
            // initialize() runs the full executeBars() and computes ALL
            // historical outputs (labels, lines, plots) via
            // FormingCandleManager.toOutputs().  These must be delivered to
            // the client up-front: otherwise a cold-loaded indicator only
            // ever receives incremental per-tick DIFFs, so sparse labels
            // (e.g. HHLL pivot labels, which need rb=5 bars to confirm a
            // pivot) never appear until enough live bars accrue — leaving
            // labelCount at 0 on a fresh container (see e2e
            // chunk-boundary.spec.ts).  The WS path is the LIVE path used by
            // auto-loaded indicators, so this initial result is required to
            // match warm-start behavior.
            // B2: ASYNC — the engine yields between bar batches, so this no
            // longer blocks the gateway; the token makes a long
            // initialization cancellable via stop_indicator / DELETE.
            const initialOutputs = await session.initialize(token);
            // B2: drop the stale result — if this run was cancelled while
            // initializing (stop_indicator, DELETE, or a newer run for the
            // same id), do NOT register the session or announce session_ready;
            // the cancelling caller owns the id now.
            if (token?.isCancelled) return;
            sub.sessions.set(sessionIndicatorId, session);
            ws.send(JSON.stringify({ type: 'session_ready', indicatorId: sessionIndicatorId }));
            // Broadcast the full initial outputs for auto-loaded indicators
            // (indicatorId !== 'default').  The 'default' id is the manual
            // editor path, whose full result is already delivered via REST and
            // whose WS handler would mis-merge a full payload as a diff.
            if (sessionIndicatorId !== 'default') {
              ws.send(
                JSON.stringify({
                  type: 'execution_result',
                  indicatorId: sessionIndicatorId,
                  // WIRE EGRESS BACKSTOP (B2 — same rationale as reexecuteForTopic):
                  // idempotent contract guarantee at the wire boundary.
                  data: normalizeExecutionResultMessage(initialOutputs),
                }),
              );
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Script compilation or execution failed';
            logger.error('Script execution error', { message });
            ws.send(
              JSON.stringify({ type: 'error', indicatorId: sessionIndicatorId, data: { message } }),
            );
          } finally {
            // B2: no leaks — the token lives exactly as long as the batch
            // initialize. Live per-bar ticks need no batch cancellation.
            registry?.remove(sessionIndicatorId);
          }
        } else if (msg.type === 'stop_indicator') {
          const indicatorId = msg.indicatorId || msg.data?.indicatorId;
          if (indicatorId) {
            // B2: cancel any in-flight computation keyed by this indicator —
            // the WS live-tick initialize AND an in-flight REST /execute
            // (Wise Old Man decision: stop_indicator cancels REST compute).
            // Idempotent when nothing is computing.
            registry?.cancel(indicatorId);
            sub.sessions.delete(indicatorId);
            ws.send(JSON.stringify({ type: 'indicator_stopped', indicatorId }));
          }
        } else if (msg.channel === 'frontend:log' && msg.data) {
          // Frontend logger forwards browser log entries to the backend.
          // Write them to logs/frontend/{subcategory}.log in the same
          // NDJSON format as backend logs so AI agents can query them
          // via GET /api/logs.
          const data = msg.data as {
            level: string;
            message: string;
            category: string;
            subcategory: string;
            timestamp?: number;
            meta?: Record<string, unknown>;
          };
          const frontendLogger = getOrCreateFrontendLogger(data.subcategory);
          frontendLogger[data.level as keyof typeof frontendLogger]?.(data.message, data.meta);
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      logger.info('Client disconnected');
      // Detach BEFORE last-unsubscribe cleanup so this client's own topics no
      // longer count as subscribers.
      const topics = Array.from(sub.topics);
      clients.delete(ws);
      for (const topic of topics) {
        topicCallbacks.get(topic)?.delete(ws);
        handleLastUnsubscribe(topic);
      }
    });
  });

  // Expose broadcastToAll for cascade removals via shared module
  setBroadcastIndicatorRemoved((indicatorIds: string[]) => {
    broadcastToAll({ type: 'indicator_removed', data: { indicatorIds } });
  });

  connectToBybit();
}
