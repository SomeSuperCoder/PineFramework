import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingBuffer } from '../../utils/logger/ring-buffer.js';
import { getForwarder } from '../../utils/logger/websocket-forwarder.js';

describe('WebSocketForwarder (via getForwarder)', () => {
  let ringBuffer: RingBuffer<{ timestamp: number; level: string; message: string }>;
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

  beforeEach(() => {
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

    vi.stubGlobal('WebSocket', vi.fn(() => mockWsInstance));
    vi.stubGlobal('window', {
      location: { protocol: 'http:', host: 'localhost:3000' },
    } as unknown as Window & typeof globalThis);

    forwarder = getForwarder(ringBuffer);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
      const entry = { timestamp: Date.now(), level: 'info', message: 'test' };
      forwarder.forward(entry);

      expect(mockSend).not.toHaveBeenCalled();
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
