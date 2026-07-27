/**
 * Bot WebSocket gateway — provides real-time dashboard data to the frontend.
 *
 * Connected by useBotWebSocket hook at ws://host/ws/bot.
 *
 * Message channels:
 *   bot:snapshot  — Full status snapshot (sent on connect)
 *   bot:state     — State transition event
 *   bot:log       — New log entry
 *   bot:position  — Position opened/closed/updated
 *   bot:metrics   — Periodic metrics update (via status emit)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { BotEngine } from 'pine-framework';

export interface BotWSBroadcaster {
  /**
   * Broadcast a raw JSON-message to all connected bot WS clients.
   */
  broadcast(message: Record<string, unknown>): void;
}

export function createBotWSGateway(
  server: Server,
  getEngine: () => BotEngine | null,
): BotWSBroadcaster {
  const wss = new WebSocketServer({ server, path: '/ws/bot' });

  wss.on('connection', (ws: WebSocket) => {
    // Send full snapshot immediately on connect
    sendSnapshot(ws, getEngine());

    ws.on('close', () => { /* no-op */ });
    ws.on('error', () => ws.close());
  });

  return { broadcast };

  // ---- Internal ----

  function broadcast(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  function sendSnapshot(ws: WebSocket, engine: BotEngine | null): void {
    if (!engine) {
      ws.send(JSON.stringify({
        channel: 'bot:snapshot',
        data: {
          status: {
            state: 'Idle',
            initialized: false,
            positions: [],
            errors: [],
          },
        },
      }));
      return;
    }

    ws.send(JSON.stringify({
      channel: 'bot:snapshot',
      data: { status: engine.getSnapshot() },
    }));
  }
}
