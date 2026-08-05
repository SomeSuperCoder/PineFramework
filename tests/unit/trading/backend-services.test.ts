import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeHistoryStore } from '../../../src/trading/trade-history-store.js';
import { DashboardWsService } from '../../../src/trading/dashboard-ws.js';
import { TradingTelegramBot } from '../../../src/trading/telegram-bot.js';
import type { TradeRecord, BotStatusSnapshot } from '../../../src/trading/types.js';
import { BotState } from '../../../src/trading/types.js';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---- TradeHistoryStore Tests ----

describe('TradeHistoryStore', () => {
  let tmpDir: string;
  let store: TradeHistoryStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'trading-test-'));
    store = new TradeHistoryStore({ baseDir: tmpDir, botId: 'test-bot' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create directories on init', () => {
    expect(existsSync(join(tmpDir, 'test-bot'))).toBe(true);
    expect(existsSync(join(tmpDir, 'test-bot', 'debug'))).toBe(true);
  });

  it('should record and retrieve trades', () => {
    const trade: TradeRecord = {
      id: 'trade-1',
      botId: 'test-bot',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 10,
      fees: 0.1,
      realizedPnl: 99.9,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    };

    store.recordTrade(trade);
    const trades = store.getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0]!.symbol).toBe('SOL/USDC');
    expect(trades[0]!.realizedPnl).toBe(99.9);
  });

  it('should filter trades by symbol', () => {
    store.recordTrade({
      id: '1',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 10,
      fees: 0,
      realizedPnl: 10,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });
    store.recordTrade({
      id: '2',
      botId: 'test',
      symbol: 'BTC/USDC',
      side: 'buy',
      entryPrice: 50000,
      exitPrice: 51000,
      size: 1,
      fees: 0,
      realizedPnl: 1000,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });

    const solTrades = store.getTrades({ symbol: 'SOL/USDC' });
    expect(solTrades).toHaveLength(1);

    const btcTrades = store.getTrades({ symbol: 'BTC/USDC' });
    expect(btcTrades).toHaveLength(1);
  });

  it('should limit results', () => {
    for (let i = 0; i < 10; i++) {
      store.recordTrade({
        id: `t${i}`,
        botId: 'test',
        symbol: 'SOL/USDC',
        side: 'buy',
        entryPrice: 100,
        exitPrice: 110,
        size: 1,
        fees: 0,
        realizedPnl: 10,
        dex: 'jupiter-swap',
        openedAt: 1000 + i,
        closedAt: 2000 + i,
      });
    }

    const limited = store.getTrades({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('should compute stats', () => {
    store.recordTrade({
      id: 'w1',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 1,
      fees: 1,
      realizedPnl: 9,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });
    store.recordTrade({
      id: 'l1',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 90,
      size: 1,
      fees: 1,
      realizedPnl: -11,
      dex: 'jupiter-swap',
      openedAt: 3000,
      closedAt: 4000,
    });

    const stats = store.getStats();
    expect(stats.totalTrades).toBe(2);
    expect(stats.winningTrades).toBe(1);
    expect(stats.losingTrades).toBe(1);
    expect(stats.winRate).toBe(0.5);
    expect(stats.totalPnl).toBe(-2);
    expect(stats.totalFees).toBe(2);
  });

  it('should persist trades to disk', () => {
    store.recordTrade({
      id: 'persist-1',
      botId: 'test-bot',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 1,
      fees: 0,
      realizedPnl: 10,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });

    // Create a new store instance pointing to the same dir
    const store2 = new TradeHistoryStore({ baseDir: tmpDir, botId: 'test-bot' });
    const trades = store2.getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0]!.id).toBe('persist-1');
  });

  it('should save debug snapshots', () => {
    const path = store.saveDebugSnapshot({
      timestamp: Date.now(),
      botState: 'Running',
      positions: [{ symbol: 'SOL/USDC', size: 10, entryPrice: 100 }],
      balance: 10000,
      errors: [],
      logs: [{ timestamp: Date.now(), level: 'info', message: 'test' }],
      recentTrades: [],
    });

    expect(existsSync(path)).toBe(true);
    const content = JSON.parse(readFileSync(path, 'utf-8'));
    expect(content.botState).toBe('Running');
  });
});

// ---- DashboardWsService Tests ----

describe('DashboardWsService', () => {
  let ws: DashboardWsService;

  beforeEach(() => {
    ws = new DashboardWsService();
  });

  it('should start with no clients', () => {
    expect(ws.clientCount).toBe(0);
  });

  it('should register and unregister clients', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'client-1', send, close: vi.fn() });
    expect(ws.clientCount).toBe(1);

    ws.unregisterClient('client-1');
    expect(ws.clientCount).toBe(0);
  });

  it('should send snapshot to a specific client', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'client-1', send, close: vi.fn() });

    const snapshot = {
      state: BotState.Running,
      strategyName: 'test',
      dex: 'jupiter-swap' as const,
      walletPublicKey: 'abc',
      startedAt: Date.now(),
      uptimeMs: 1000,
      balance: 10000,
      realizedPnl: 100,
      unrealizedPnl: 50,
      positions: [],
      exposure: 0,
      errors: [],
      lastTransition: null,
    };

    ws.sendSnapshot('client-1', snapshot, {
      totalTrades: 5,
      winningTrades: 3,
      losingTrades: 2,
      winRate: 0.6,
      profitFactor: 1.5,
      totalPnl: 100,
      totalFees: 5,
      averageWin: 50,
      averageLoss: -25,
      maxDrawdown: 10,
      swapCount: 5,
      executionLatencyMs: 100,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const message = JSON.parse(send.mock.calls[0]![0]);
    expect(message.channel).toBe('bot:snapshot');
    expect(message.type).toBe('snapshot');
    expect(message.data.status.state).toBe(BotState.Running);
  });

  it('should broadcast state changes to all clients', () => {
    const send1 = vi.fn();
    const send2 = vi.fn();
    ws.registerClient({ id: 'c1', send: send1, close: vi.fn() });
    ws.registerClient({ id: 'c2', send: send2, close: vi.fn() });

    ws.broadcastStateChange(BotState.Idle, BotState.Running, 'test');

    expect(send1).toHaveBeenCalledTimes(1);
    expect(send2).toHaveBeenCalledTimes(1);

    const msg = JSON.parse(send1.mock.calls[0]![0]);
    expect(msg.channel).toBe('bot:state');
    expect(msg.data.previous).toBe(BotState.Idle);
    expect(msg.data.current).toBe(BotState.Running);
  });

  it('should broadcast metrics to all clients', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'c1', send, close: vi.fn() });

    ws.broadcastMetrics({ totalTrades: 10, totalPnl: 500 });

    const msg = JSON.parse(send.mock.calls[0]![0]);
    expect(msg.channel).toBe('bot:metrics');
    expect(msg.data.totalTrades).toBe(10);
  });

  it('should broadcast position updates', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'c1', send, close: vi.fn() });

    ws.broadcastPositionUpdate('opened', {
      symbol: 'SOL/USDC',
      side: 'long',
      size: 10,
      entryPrice: 100,
      currentPrice: 105,
      unrealizedPnl: 50,
      openedAt: Date.now(),
    });

    const msg = JSON.parse(send.mock.calls[0]![0]);
    expect(msg.channel).toBe('bot:position');
    expect(msg.data.type).toBe('opened');
    expect(msg.data.position.symbol).toBe('SOL/USDC');
  });

  it('should broadcast log entries', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'c1', send, close: vi.fn() });

    ws.broadcastLog({ timestamp: Date.now(), level: 'info', message: 'test log' });

    const msg = JSON.parse(send.mock.calls[0]![0]);
    expect(msg.channel).toBe('bot:log');
    expect(msg.data.message).toBe('test log');
  });

  it('should buffer logs for reconnecting clients', () => {
    ws.broadcastLog({ timestamp: 1, level: 'info', message: 'log1' });
    ws.broadcastLog({ timestamp: 2, level: 'warn', message: 'log2' });
    ws.broadcastLog({ timestamp: 3, level: 'error', message: 'log3' });

    const buffered = ws.getBufferedLogs(2);
    expect(buffered).toHaveLength(2);
    expect(buffered[0]!.message).toBe('log2');
    expect(buffered[1]!.message).toBe('log3');
  });

  it('should broadcast trades', () => {
    const send = vi.fn();
    ws.registerClient({ id: 'c1', send, close: vi.fn() });

    const trade: TradeRecord = {
      id: 't1',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 110,
      size: 1,
      fees: 0,
      realizedPnl: 10,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    };
    ws.broadcastTrade(trade);

    const msg = JSON.parse(send.mock.calls[0]![0]);
    expect(msg.channel).toBe('bot:trade');
    expect(msg.data.symbol).toBe('SOL/USDC');
  });
});

// ---- TradingTelegramBot Tests ----

describe('TradingTelegramBot', () => {
  let sender: { sendMessage: ReturnType<typeof vi.fn>; getSubscribers: ReturnType<typeof vi.fn> };
  let bot: TradingTelegramBot;

  beforeEach(() => {
    sender = {
      sendMessage: vi.fn().mockResolvedValue(true),
      getSubscribers: vi.fn().mockReturnValue([{ chatId: 123 }]),
    };
    bot = new TradingTelegramBot(sender, { includeTxLinks: false });
  });

  it('should notify bot started', async () => {
    await bot.notifyBotStarted({
      strategySource: 'test',
      dex: 'jupiter-swap',
      pairs: [{ symbol: 'SOL/USDC', timeframe: '1m' }],
      risk: { maxDailyLoss: 100, dailyLossTimezone: 'UTC', closeOnLoss: false },
    });

    expect(sender.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Bot Started'));
  });

  it('should notify bot stopped', async () => {
    await bot.notifyBotStopped(3600000, 5, 50.5);
    expect(sender.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Bot Stopped'));
  });

  it('should notify position opened', async () => {
    await bot.notifyPositionOpened({
      id: 't1',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 0,
      size: 10,
      fees: 0.1,
      realizedPnl: 0,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 0,
    });

    expect(sender.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Position Opened'),
    );
  });

  it('should notify position closed with PnL', async () => {
    await bot.notifyPositionClosed({
      id: 't2',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'sell',
      entryPrice: 100,
      exitPrice: 110,
      size: 10,
      fees: 1,
      realizedPnl: 99,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });

    expect(sender.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Position Closed'),
    );
  });

  it('should notify emergency stop', async () => {
    await bot.notifyEmergencyStop('frontend');
    expect(sender.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Emergency Stop'));
  });

  it('should notify daily loss triggered', async () => {
    await bot.notifyDailyLossTriggered(100, 100);
    expect(sender.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('ROLLING 24H LOSS LIMIT BREACHED'),
    );
  });

  it('should notify error', async () => {
    await bot.notifyError('ERR_001', 'Something went wrong');
    expect(sender.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Error'));
  });

  it('should notify warning', async () => {
    await bot.notifyWarning('Low balance');
    expect(sender.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Warning'));
  });

  it('should format negative PnL correctly', async () => {
    await bot.notifyPositionClosed({
      id: 't3',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 90,
      size: 1,
      fees: 0.5,
      realizedPnl: -10.5,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 2000,
    });

    const message = sender.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain('-');
    expect(message).toContain('10\\.50');
  });

  it('should include transaction link when configured', async () => {
    const linkBot = new TradingTelegramBot(sender, {
      includeTxLinks: true,
      explorerUrlTemplate: 'https://solscan.io/tx/{signature}',
    });

    await linkBot.notifyPositionOpened({
      id: 't4',
      botId: 'test',
      symbol: 'SOL/USDC',
      side: 'buy',
      entryPrice: 100,
      exitPrice: 0,
      size: 1,
      fees: 0,
      realizedPnl: 0,
      dex: 'jupiter-swap',
      openedAt: 1000,
      closedAt: 0,
      transactionSignature: 'abc123',
    });

    const message = sender.sendMessage.mock.calls[0]![1] as string;
    expect(message).toContain('solscan.io');
  });
});
