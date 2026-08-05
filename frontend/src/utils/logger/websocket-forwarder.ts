import { RingBuffer } from './ring-buffer.js';
import type { FrontendLogEntry } from './types.js';

const WS_PATH = '/ws';
const CHANNEL = 'frontend:log';
const RECONNECT_DELAY_MS = 3000;

function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${WS_PATH}`;
}

class WebSocketForwarder {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: FrontendLogEntry[] = [];
  private connected = false;
  private destroyed = false;
  private readonly ringBuffer: RingBuffer<FrontendLogEntry>;

  constructor(ringBuffer: RingBuffer<FrontendLogEntry>) {
    this.ringBuffer = ringBuffer;
  }

  connect(): void {
    if (this.destroyed) return;
    if (typeof WebSocket === 'undefined') return;

    try {
      const url = getWsUrl();
      if (!url) return;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this.drainPending();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private drainPending(): void {
    while (this.pending.length > 0 && this.connected && this.ws?.readyState === WebSocket.OPEN) {
      const entry = this.pending[0];
      try {
        this.ws.send(JSON.stringify({ channel: CHANNEL, data: entry }));
        this.pending.shift();
      } catch {
        break;
      }
    }
  }

  forward(entry: FrontendLogEntry): void {
    this.ringBuffer.push(entry);

    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ channel: CHANNEL, data: entry }));
      } catch {
        this.pending.push(entry);
      }
    } else {
      this.pending.push(entry);
      if (!this.reconnectTimer) {
        this.connect();
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.pending.length = 0;
  }
}

let forwarder: WebSocketForwarder | null = null;

export function getForwarder(ringBuffer: RingBuffer<FrontendLogEntry>): WebSocketForwarder {
  if (!forwarder) {
    forwarder = new WebSocketForwarder(ringBuffer);
  }
  return forwarder;
}
