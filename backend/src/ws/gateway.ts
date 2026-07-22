import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Bar } from 'pine-framework';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import { ScriptSession } from '../session/ScriptSession.js';
import type { TelegramService } from '../telegram/TelegramService.js';
import { validateBybitUrl } from '../utils/security.js';
import { setBroadcastIndicatorRemoved } from './broadcast.js';

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

export function createWSGateway(
  server: Server,
  cache: OHLCVCache,
  telegramService?: TelegramService,
): void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<WebSocket, ClientSubscription>();
  let bybitWs: WebSocket | null = null;
  const topicCallbacks = new Map<string, Set<WebSocket>>();

  function connectToBybit(): void {
    if (bybitWs && bybitWs.readyState === WebSocket.OPEN) return;

    bybitWs = new WebSocket(BYBIT_WS_URL);

    bybitWs.on('open', () => {
      console.log('[WS] Connected to Bybit WebSocket');
      resubscribeAll();
    });

    bybitWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          topic?: string;
          type?: string;
          data?: { symbol?: string; interval?: string; open?: string; high?: string; low?: string; close?: string; volume?: string; timestamp?: string; start?: string };
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

          if (!timestamp || !isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
            return;
          }

          const bar: Bar = { timestamp, open, high, low, close, volume };
          const topicParts = msg.topic.split('.');
          const symbol = topicParts[2] || '';
          const interval = String(d.interval || topicParts[1] || '');
          if (symbol && interval) {
            cache.set(symbol, interval, [bar]);
          }

          broadcast(msg.topic, {
            type: 'kline',
            data: { symbol, interval, ...bar, confirmed },
          });

          reexecuteForTopic(msg.topic, bar, confirmed);
        }
      } catch {
        // ignore parse errors
      }
    });

    bybitWs.on('close', () => {
      console.log('[WS] Bybit WebSocket disconnected, reconnecting in 3s...');
      bybitWs = null;
      setTimeout(connectToBybit, 3000);
    });

    bybitWs.on('error', (err) => {
      console.error('[WS] Bybit WebSocket error:', err.message);
    });
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

  function reexecuteForTopic(topic: string, bar: Bar, confirmed?: boolean): void {
    const subscribers = topicCallbacks.get(topic);
    if (!subscribers) {
      console.log(`[WS] reexecuteForTopic: no subscribers for topic "${topic}"`);
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
          const outputs = session.appendOrUpdateBar(bar, confirmed);

          ws.send(JSON.stringify({
            type: 'execution_result',
            indicatorId,
            data: outputs,
          }));

          const tgActive = telegramService?.isActive() ?? false;
          const isConfirmed = outputs.isConfirmed ?? false;

          if (!isConfirmed) {
          } else if (tgActive && telegramService) {
            // Use ONLY the new triggers from the most recent confirmed bar,
            // not all accumulated historical triggers.  session.getPendingNewAlertTriggers()
            // returns the diff and clears them so they are sent only once.
            const triggers = session.getPendingNewAlertTriggers();
            if (triggers.length === 0) {
              console.log(`[WS] reexecuteForTopic: no new alert triggers for indicator ${indicatorId}`);
            }
            for (const trigger of triggers) {
              const condition = outputs.alertConditions?.find((c) => c.id === trigger.alertId);
              const message = condition?.message || `Alert triggered at ${new Date(trigger.timestamp).toISOString()}`;
              const title = condition?.title || trigger.alertId;
              const dedupKey = `${trigger.alertId}:${trigger.timestamp}:${topic}`;
              if (isDuplicateAlert(topic, dedupKey)) {
                console.log(`[WS] reexecuteForTopic: duplicate alert suppressed (${dedupKey})`);
                continue;
              }
              console.log(`[WS] reexecuteForTopic: sending Telegram alert: alertId=${trigger.alertId}, title="${title}", symbol=${symbol}, interval=${interval}`);
              telegramService.sendAlertToSubscribers(
                `*${title}*\n\n${message}`,
                trigger.alertId,
                symbol || undefined,
                interval || undefined,
              );
            }
          } else if (!tgActive) {
            console.log(`[WS] reexecuteForTopic: Telegram service is NOT active, skipping alert send`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Script re-execution failed';
          console.error(`[WS] Script re-execution error for indicator ${indicatorId}:`, message);
          ws.send(JSON.stringify({
            type: 'error',
            indicatorId,
            data: { message },
          }));
        }
      }
    }
  }

  function resubscribeAll(): void {
    const allTopics = new Set<string>();
    for (const sub of clients.values()) {
      for (const topic of sub.topics) {
        allTopics.add(topic);
      }
    }
    if (allTopics.size > 0 && bybitWs?.readyState === WebSocket.OPEN) {
      bybitWs.send(JSON.stringify({ op: 'subscribe', args: Array.from(allTopics) }));
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
    console.log('[WS] Client connected');
    const sub: ClientSubscription = { ws, topics: new Set(), sessions: new Map() };
    clients.set(ws, sub);

    ws.send(JSON.stringify({ type: 'connected', data: { connectionId: Math.random().toString(36).slice(2) } }));

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          topic?: string;
          indicatorId?: string;
          data?: { source?: string; symbol?: string; interval?: string; bars?: Bar[]; indicatorId?: string };
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

          if (bybitWs?.readyState === WebSocket.OPEN) {
            bybitWs.send(JSON.stringify({ op: 'subscribe', args: [msg.topic] }));
          }
        } else if (msg.type === 'unsubscribe' && msg.topic) {
          sub.topics.delete(msg.topic);
          topicCallbacks.get(msg.topic)?.delete(ws);
        } else if (msg.type === 'execute' && msg.data) {
          const { source, symbol, interval, bars, indicatorId } = msg.data;
          if (!source || !bars || bars.length === 0) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'Missing source or bars' } }));
            return;
          }

          const sessionIndicatorId = indicatorId || 'default';

          try {
            // Delete old session first to prevent reexecuteForTopic from
            // using a stale session during initialization.
            sub.sessions.delete(sessionIndicatorId);
            const session = new ScriptSession(
              source,
              symbol || '',
              interval || '',
              bars,
            );
            session.initialize();
            sub.sessions.set(sessionIndicatorId, session);
            ws.send(JSON.stringify({ type: 'session_ready', indicatorId: sessionIndicatorId }));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Script compilation or execution failed';
            console.error('[WS] Script execution error:', message);
            ws.send(JSON.stringify({ type: 'error', indicatorId: sessionIndicatorId, data: { message } }));
          }
        } else if (msg.type === 'stop_indicator') {
          const indicatorId = msg.indicatorId || msg.data?.indicatorId;
          if (indicatorId) {
            sub.sessions.delete(indicatorId);
            ws.send(JSON.stringify({ type: 'indicator_stopped', indicatorId }));
          }
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      for (const topic of sub.topics) {
        topicCallbacks.get(topic)?.delete(ws);
      }
      clients.delete(ws);
    });
  });

  // Expose broadcastToAll for cascade removals via shared module
  setBroadcastIndicatorRemoved((indicatorIds: string[]) => {
    broadcastToAll({ type: 'indicator_removed', data: { indicatorIds } });
  });

  connectToBybit();
}
