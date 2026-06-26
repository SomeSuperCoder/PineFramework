import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Bar } from 'pine-framework';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import { ScriptSession } from '../session/ScriptSession.js';

interface ClientSubscription {
  ws: WebSocket;
  topics: Set<string>;
  session: ScriptSession | null;
}

const BYBIT_WS_URL = process.env.BYBIT_WS_URL || 'wss://stream.bybit.com/v5/public/linear';

export function createWSGateway(server: Server, cache: OHLCVCache): void {
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
            data: { symbol, interval, ...bar },
          });

          reexecuteForTopic(msg.topic, bar);
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

  function reexecuteForTopic(topic: string, bar: Bar): void {
    const subscribers = topicCallbacks.get(topic);
    if (!subscribers) return;

    for (const ws of subscribers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const sub = clients.get(ws);
      if (!sub || !sub.session) continue;

      try {
        const outputs = sub.session.appendOrUpdateBar(bar);
        ws.send(JSON.stringify({
          type: 'execution_result',
          data: outputs,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Script re-execution failed';
        console.error('[WS] Script re-execution error:', message);
        ws.send(JSON.stringify({
          type: 'error',
          data: { message },
        }));
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

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WS] Client connected');
    const sub: ClientSubscription = { ws, topics: new Set(), session: null };
    clients.set(ws, sub);

    ws.send(JSON.stringify({ type: 'connected', data: { connectionId: Math.random().toString(36).slice(2) } }));

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          topic?: string;
          data?: { source?: string; symbol?: string; interval?: string; bars?: Bar[] };
        };

        if (msg.type === 'subscribe' && msg.topic) {
          sub.topics.add(msg.topic);
          if (!topicCallbacks.has(msg.topic)) {
            topicCallbacks.set(msg.topic, new Set());
          }
          topicCallbacks.get(msg.topic)!.add(ws);

          if (bybitWs?.readyState === WebSocket.OPEN) {
            bybitWs.send(JSON.stringify({ op: 'subscribe', args: [msg.topic] }));
          }
        } else if (msg.type === 'unsubscribe' && msg.topic) {
          sub.topics.delete(msg.topic);
          topicCallbacks.get(msg.topic)?.delete(ws);
        } else if (msg.type === 'execute' && msg.data) {
          const { source, symbol, interval, bars } = msg.data;
          if (!source || !bars || bars.length === 0) {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'Missing source or bars' } }));
            return;
          }

          try {
            const session = new ScriptSession(
              source,
              symbol || '',
              interval || '',
              bars,
            );
            const outputs = session.initialize();
            sub.session = session;
            ws.send(JSON.stringify({ type: 'execution_result', data: outputs }));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Script compilation or execution failed';
            console.error('[WS] Script execution error:', message);
            ws.send(JSON.stringify({ type: 'error', data: { message } }));
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

  connectToBybit();
}
