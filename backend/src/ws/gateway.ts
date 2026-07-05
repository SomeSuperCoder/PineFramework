import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Bar } from 'pine-framework';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import { ScriptSession } from '../session/ScriptSession.js';
import type { TelegramService } from '../telegram/TelegramService.js';
import type { ScriptStore } from '../store/ScriptStore.js';
import type { RunningIndicatorsStore } from '../store/RunningIndicatorsStore.js';

interface ClientSubscription {
  ws: WebSocket;
  topics: Set<string>;
  sessions: Map<string, ScriptSession>;
}

const BYBIT_WS_URL = process.env.BYBIT_WS_URL || 'wss://stream.bybit.com/v5/public/linear';

export function createWSGateway(
  server: Server,
  cache: OHLCVCache,
  telegramService?: TelegramService,
  _scriptStore?: ScriptStore,
  _indicatorsStore?: RunningIndicatorsStore,
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
          console.log(`[WS] Bybit kline: confirm=${JSON.stringify(d.confirm)} parsed=${confirmed}`);

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

  const recentAlertKeys = new Set<string>();

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

    console.log(`[WS] reexecuteForTopic: ${subscribers.size} subscriber(s) for topic "${topic}"`);

    const topicParts = topic.split('.');
    const symbol = topicParts[2] || '';
    const interval = topicParts[1] || '';

    for (const ws of subscribers) {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log(`[WS] reexecuteForTopic: skipping non-open WS connection`);
        continue;
      }
      const sub = clients.get(ws);
      if (!sub) {
        console.log(`[WS] reexecuteForTopic: subscriber not found in clients map`);
        continue;
      }
      if (sub.sessions.size === 0) {
        console.log(`[WS] reexecuteForTopic: subscriber has NO sessions! Chart updates work but scripts won't re-execute.`);
        continue;
      }

      for (const [indicatorId, session] of sub.sessions) {
        try {
          console.log(`[WS] reexecuteForTopic: calling appendOrUpdateBar for ${symbol} ${interval} indicatorId=${indicatorId}`);
          const outputs = session.appendOrUpdateBar(bar, confirmed);
          console.log(`[WS] reexecuteForTopic: appendOrUpdateBar done, indicatorId=${indicatorId}, alertTriggers=${outputs.alertTriggers?.length}, alertConditions=${outputs.alertConditions?.length}, isConfirmed=${outputs.isConfirmed}, confirmed=${confirmed}`);

          ws.send(JSON.stringify({
            type: 'execution_result',
            indicatorId,
            data: outputs,
          }));

          const tgActive = telegramService?.isActive() ?? false;
          const triggers = outputs.alertTriggers;
          const hasTriggers = triggers !== undefined && triggers.length > 0;
          const isConfirmed = outputs.isConfirmed ?? false;
          console.log(`[WS] reexecuteForTopic: telegramService.isActive()=${tgActive}, hasTriggers=${hasTriggers}, isConfirmed=${isConfirmed}`);

          if (!isConfirmed) {
            console.log(`[WS] reexecuteForTopic: forming candle (isConfirmed=false), suppressing alert dispatch`);
          } else if (tgActive && hasTriggers && telegramService) {
            for (const trigger of triggers) {
              const condition = outputs.alertConditions?.find((c) => c.id === trigger.alertId);
              const message = condition?.message || `Alert triggered at ${new Date(trigger.timestamp).toISOString()}`;
              const title = condition?.title || trigger.alertId;
              const dedupKey = `${trigger.alertId}:${trigger.timestamp}:${topic}`;
              if (recentAlertKeys.has(dedupKey)) {
                console.log(`[WS] reexecuteForTopic: duplicate alert suppressed (${dedupKey})`);
                continue;
              }
              recentAlertKeys.add(dedupKey);
              if (recentAlertKeys.size > 100) {
                const first = recentAlertKeys.values().next().value;
                if (first) recentAlertKeys.delete(first);
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
          } else if (!hasTriggers) {
            console.log(`[WS] reexecuteForTopic: no alert triggers in output, nothing to send`);
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
            const session = new ScriptSession(
              source,
              symbol || '',
              interval || '',
              bars,
            );
            const initResult = session.initialize();
            sub.sessions.set(sessionIndicatorId, session);
            ws.send(JSON.stringify({ type: 'session_ready', indicatorId: sessionIndicatorId }));
            ws.send(JSON.stringify({ type: 'execution_result', indicatorId: sessionIndicatorId, data: initResult }));
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

  // Expose broadcastToAll for cascade removals
  (globalThis as Record<string, unknown>).__wsBroadcastIndicatorRemoved = (indicatorIds: string[]) => {
    broadcastToAll({ type: 'indicator_removed', data: { indicatorIds } });
  };

  connectToBybit();
}
