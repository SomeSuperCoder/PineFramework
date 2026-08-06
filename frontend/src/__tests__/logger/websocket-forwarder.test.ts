import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingBuffer } from '../../utils/logger/ring-buffer.js';
import { getForwarder } from '../../utils/logger/websocket-forwarder.js';
import type { FrontendLogEntry } from '../../utils/logger/types.js';

describe('WebSocketForwarder (via getForwarder)', () => {
  let ringBuffer: RingBuffer<FrontendLogEntry>;
  let forwarder: ReturnType<typeof getForwarder>;

  const mockSend = vi.fn();
  const mockClose = vi.fn();
  let mockWsInstance: {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onopen: (() => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
  };

  const OPEN = 1;
  const CLOSED = 3;

  beforeEach(async () => {
    // getForwarder is a module-level singleton whose destroy()/connect() calls
    // mutate state permanently. Reset the module registry so every test starts
    // with a fresh forwarder — otherwise destroyed/ws/connected state leaks
    // across tests and connect() becomes a silent no-op.
    vi.resetModules();
    ringBuffer = new RingBuffer(500);
    mockSend.mockClear();
    mockClose.mockClear();

    mockWsInstance = {
      readyState: OPEN,
      send: mockSend,
      close: mockClose,
      onopen: null,
      onclose: null,
      onerror: null,
    };

    vi.stubGlobal('WebSocket', Object.assign(vi.fn(() => mockWsInstance), { OPEN, CLOSED }));
    vi.stubGlobal('window', {
      location: { protocol: 'http:', host: 'localhost:3000' },
    } as unknown as Window & typeof globalThis);

    const { getForwarder: getFreshForwarder } = await import('../../utils/logger/websocket-forwarder.js');
    forwarder = getFreshForwarder(ringBuffer);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('connect', () => {
    it('creates a WebSocket to the correct URL', () => {
      forwarder.connect();
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:3000/ws');
    });

    it('uses wss:// when page is served over HTTPS', () => {
      vi.stubGlobal('window', {
        location: { protocol: 'https:', host: 'localhost:3000' },
      } as unknown as Window & typeof globalThis);

      forwarder.connect();
      expect(WebSocket).toHaveBeenCalledWith('wss://localhost:3000/ws');
    });

    it('does nothing when destroyed', () => {
      forwarder.destroy();
      forwarder.connect();
      expect(WebSocket).not.toHaveBeenCalled();
    });
  });

  describe('forward', () => {
    it('queues entry in pending when not connected', () => {
      forwarder.connect();
      mockWsInstance.readyState = CLOSED;
      const entry: FrontendLogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'test',
        category: 'frontend',
        subcategory: 'ui',
      };
      forwarder.forward(entry);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends { channel, data } on an OPEN socket (live-forward path)', () => {
      forwarder.connect();
      mockWsInstance.onopen?.(); // socket opens → connected = true

      const entry: FrontendLogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'live',
        category: 'frontend',
        subcategory: 'ws',
      };
      forwarder.forward(entry);

      expect(mockSend).toHaveBeenCalledWith(
        JSON.stringify({ channel: 'frontend:log', data: entry }),
      );
    });

    it('drains entries queued while disconnected once the socket opens', () => {
      forwarder.connect();
      mockWsInstance.readyState = CLOSED;
      const entry: FrontendLogEntry = {
        timestamp: Date.now(),
        level: 'warn',
        message: 'queued',
        category: 'frontend',
        subcategory: 'ui',
      };
      forwarder.forward(entry);
      expect(mockSend).not.toHaveBeenCalled();

      mockWsInstance.readyState = OPEN;
      mockWsInstance.onopen?.();
      expect(mockSend).toHaveBeenCalledWith(
        JSON.stringify({ channel: 'frontend:log', data: entry }),
      );
    });
  });

  describe('destroy', () => {
    it('allows double destroy without error', () => {
      forwarder.destroy();
      expect(() => forwarder.destroy()).not.toThrow();
    });

    it('sets destroyed flag so connect is a no-op', () => {
      forwarder.destroy();
      forwarder.connect();
      expect(WebSocket).not.toHaveBeenCalled();
    });
  });

  describe('getForwarder (singleton)', () => {
    it('returns the same forwarder instance on repeated calls', () => {
      const f1 = getForwarder(ringBuffer);
      const f2 = getForwarder(ringBuffer);
      expect(f1).toBe(f2);
    });
  });
});
