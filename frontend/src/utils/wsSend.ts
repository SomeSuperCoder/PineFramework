/**
 * Send a WS frame only when the socket is actually OPEN.
 *
 * Calling send() on a socket in CLOSING/CLOSED state throws `WebSocket is
 * already in CLOSING or CLOSED state` — an uncaught error there can surface
 * as a page error (e.g. a stale onopen callback firing on a socket the effect
 * cleanup already closed). A safe no-op otherwise: the throw is swallowed and
 * logged once, never propagated.
 */
export function wsSend(ws: WebSocket | null | undefined, payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.warn('[WS] send skipped (socket closing/closed):', err);
  }
}
