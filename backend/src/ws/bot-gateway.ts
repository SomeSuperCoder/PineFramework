/**
 * Bot WebSocket gateway — provides real-time dashboard data to the frontend.
 *
 * Connected by useBotWebSocket hook at ws://host/ws/bot.
 *
 * Message channels:
 *   bot:snapshot   — Full status snapshot (sent on connect)
 *   bot:state      — State transition event
 *   bot:log        — New log entry
 *   bot:position   — Position opened/closed/updated
 *   bot:metrics    — Periodic metrics update (via status emit)
 *   bot:feedStatus — Live bar-feed telemetry (connected/silent/silentSince)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { BotEngine } from 'pine-framework';
import { buildSnapshotPayload } from './snapshot-payload.js';

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
  // Use noServer mode to avoid conflicts with the main /ws gateway
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /ws/bot path
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/bot') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Let other handlers (like /ws gateway) handle their own paths
  });

  wss.on('connection', (ws: WebSocket) => {
    // Send full snapshot immediately on connect
    sendSnapshot(ws, getEngine());

    ws.on('close', () => {
      /* no-op */
    });
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
    // SSOT (design D2): the null-engine fallback and the live-engine path both
    // go through the shared builder, so every broadcast site produces an
    // identical payload shape (chaosSignals + truthful status.positions always
    // present). A null engine yields the empty defaults — same shape, no
    // engine data.
    ws.send(
      JSON.stringify({
        channel: 'bot:snapshot',
        type: 'snapshot',
        data: buildSnapshotPayload(engine?.getSnapshot() ?? null, engine),
      }),
    );
  }
}
