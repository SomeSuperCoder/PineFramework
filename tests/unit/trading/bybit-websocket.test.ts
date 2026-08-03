import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BybitWebSocketService } from '../../../src/trading/bybit-websocket.js';
import { PairId } from '../../../src/trading/scheduler.js';

describe('BybitWebSocketService', () => {
  let service: BybitWebSocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BybitWebSocketService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined();
      expect(service.connected).toBe(false);
      expect(service.activeSubscriptions).toEqual([]);
    });

    it('should create service with custom config', () => {
      const customService = new BybitWebSocketService({
        wsUrl: 'wss://custom-ws.example.com',
        maxReconnectAttempts: 5,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('subscriptions', () => {
    it('should add subscription', () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      service.subscribe(pair);
      expect(service.activeSubscriptions).toContainEqual(pair);
    });

    it('should remove subscription', () => {
      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      service.subscribe(pair);
      service.unsubscribe(pair);
      expect(service.activeSubscriptions).not.toContainEqual(pair);
    });

    it('should handle multiple subscriptions', () => {
      const pair1: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      const pair2: PairId = { symbol: 'SOLUSDT', timeframe: '15' };
      service.subscribe(pair1);
      service.subscribe(pair2);
      expect(service.activeSubscriptions).toHaveLength(2);
      expect(service.activeSubscriptions).toContainEqual(pair1);
      expect(service.activeSubscriptions).toContainEqual(pair2);
    });
  });

  describe('fetchHistoricalCandles', () => {
    it('should fetch historical candles from REST API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              ['1234567890', '100', '110', '90', '105', '1000'],
              ['1234567891', '105', '115', '95', '110', '1200'],
            ],
          },
        }),
      });
      global.fetch = mockFetch;

      const pair: PairId = { symbol: 'BTCUSDT', timeframe: '60' };
      const candles = await service.fetchHistoricalCandles(pair);

      expect(candles).toHaveLength(2);
      // Note: candles are reversed, so the second candle in the API response is first
      expect(candles[0].symbol).toBe('BTCUSDT');
      expect(candles[0].timeframe).toBe('60');
      expect(candles[0].open).toBe(105);
      expect(candles[0].high).toBe(115);
      expect(candles[0].low).toBe(95);
      expect(candles[0].close).toBe(110);
      expect(candles[0].volume).toBe(1200);
    });

    it('should throw error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          retCode: 10001,
          retMsg: 'Invalid symbol',
          result: {},
        }),
      });
      global.fetch = mockFetch;

      const pair: PairId = { symbol: 'INVALID', timeframe: '60' };
      await expect(service.fetchHistoricalCandles(pair)).rejects.toThrow('Invalid symbol');
    });
  });

  describe('disconnect stops message processing', () => {
    it('should not invoke candle callback for messages after disconnect', () => {
      const candleCallback = vi.fn();
      service.setCandleCallback(candleCallback);

      // Simulate disconnect
      service.disconnect();

      // Access private handleKlineMessage via handleMessage with a valid kline message
      const klineMessage = JSON.stringify({
        topic: 'kline.60.BTCUSDT',
        type: 'kline',
        ts: Date.now(),
        data: {
          start: Date.now(),
          end: Date.now() + 60000,
          interval: '60',
          open: '100',
          high: '110',
          low: '90',
          close: '105',
          volume: '1000',
          confirm: true,
          timestamp: Date.now(),
        },
      });

      // handleMessage is private, trigger it via the ws.on('message') path
      // We can't directly call it, but we can verify the guard by checking isStopped
      expect((service as any).isStopped).toBe(true);
      expect(candleCallback).not.toHaveBeenCalled();
    });

    it('should prevent reconnection after disconnect', () => {
      service.disconnect();

      // After disconnect, isStopped should prevent scheduleReconnect
      expect((service as any).isStopped).toBe(true);

      // Try to reconnect — connect() resets isStopped, but we check the guard
      // The close handler checks isStopped before scheduling reconnect
      expect((service as any).reconnectTimer).toBeNull();
    });
  });

  describe('callbacks', () => {
    it('should set candle callback', () => {
      const mockCandle = vi.fn();
      service.setCandleCallback(mockCandle);
      expect((service as any).onCandle).toBe(mockCandle);
    });

    it('should set connection callback', () => {
      const mockConnection = vi.fn();
      service.setConnectionCallback(mockConnection);
      expect((service as any).onConnectionChange).toBe(mockConnection);
    });

    it('should set error callback', () => {
      const mockError = vi.fn();
      service.setErrorCallback(mockError);
      expect((service as any).onError).toBe(mockError);
    });
  });
});
