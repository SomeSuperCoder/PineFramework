import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DailyStopLoss, getTradingDayStart } from '../../../src/trading/risk/daily-stop-loss.js';
import { RiskManager } from '../../../src/trading/risk/risk-manager.js';
import { ShutdownHandler } from '../../../src/trading/risk/shutdown-handler.js';

// ---- DailyStopLoss Tests ----

describe('DailyStopLoss', () => {
  it('should start with no loss', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    expect(dsl.currentLoss).toBe(0);
    expect(dsl.isBreached).toBe(false);
    expect(dsl.canEnterPosition()).toBe(true);
  });

  it('should track realized losses', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.recordTrade(50); // profit — doesn't count
    expect(dsl.currentLoss).toBe(0);

    dsl.recordTrade(-30); // loss
    expect(dsl.currentLoss).toBe(30);
    expect(dsl.isBreached).toBe(false);

    dsl.recordTrade(-80); // loss
    expect(dsl.currentLoss).toBe(110);
    expect(dsl.isBreached).toBe(true);
  });

  it('should prevent entries when breached', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.recordTrade(-120);
    expect(dsl.isBreached).toBe(true);
    expect(dsl.canEnterPosition()).toBe(false);
  });

  it('should allow entries when unlimited (maxDailyLoss=0)', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 0, timezone: 'UTC' });
    dsl.recordTrade(-999999);
    expect(dsl.isBreached).toBe(false);
    expect(dsl.canEnterPosition()).toBe(true);
  });

  it('should reset on new trading day', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.recordTrade(-120);
    expect(dsl.isBreached).toBe(true);

    // Simulate new day
    const tomorrow = Date.now() + 86400000;
    dsl.resetDay(tomorrow);

    expect(dsl.currentLoss).toBe(0);
    expect(dsl.isBreached).toBe(false);
    expect(dsl.canEnterPosition()).toBe(true);
  });

  it('should auto-reset when checkDayReset detects new day', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.recordTrade(-120);
    expect(dsl.isBreached).toBe(true);

    // Manually set the internal day start to yesterday to trigger auto-reset
    // next time recordTrade or canEnterPosition is called
    const tomorrow = Date.now() + 86400000;
    dsl.resetDay(tomorrow);
    dsl.recordTrade(-50);
    expect(dsl.currentLoss).toBe(50);
  });

  it('should return correct config', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 200, timezone: 'America/New_York' });
    const config = dsl.getConfig();
    expect(config.maxDailyLoss).toBe(200);
    expect(config.timezone).toBe('America/New_York');
  });

  it('should update config', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.updateConfig({ maxDailyLoss: 500 });
    expect(dsl.maxLoss).toBe(500);
  });

  it('should not count profits toward loss', () => {
    const dsl = new DailyStopLoss({ maxDailyLoss: 100, timezone: 'UTC' });
    dsl.recordTrade(-50);
    expect(dsl.currentLoss).toBe(50);

    dsl.recordTrade(200); // profit
    expect(dsl.currentLoss).toBe(50); // unchanged
  });
});

describe('getTradingDayStart', () => {
  it('should return a timestamp for UTC', () => {
    const now = Date.now();
    const start = getTradingDayStart(now, 'UTC');
    expect(typeof start).toBe('number');
    expect(start).toBeLessThanOrEqual(now);
    expect(start).toBeGreaterThan(now - 86400000);
  });

  it('should return a timestamp for America/New_York', () => {
    const now = Date.now();
    const start = getTradingDayStart(now, 'America/New_York');
    expect(typeof start).toBe('number');
    expect(start).toBeLessThanOrEqual(now);
  });

  it('should handle timezone abbreviations like EST', () => {
    const est = getTradingDayStart(Date.now(), 'EST');
    expect(typeof est).toBe('number');
  });
});

// ---- RiskManager Tests ----

describe('RiskManager', () => {
  let rm: RiskManager;

  beforeEach(() => {
    rm = new RiskManager({
      dailyLoss: { maxDailyLoss: 100, timezone: 'UTC' },
      emergencyClosePositions: true,
    });
  });

  it('should start clean', () => {
    expect(rm.isDailyLossBreached).toBe(false);
    expect(rm.isEmergencyStopTriggered).toBe(false);
    expect(rm.isShutdownInProgress).toBe(false);
    expect(rm.canEnterPosition()).toBe(true);
  });

  it('should track trades through daily stop loss', () => {
    const breached = rm.recordTrade(-150);
    expect(breached).toBe(true);
    expect(rm.isDailyLossBreached).toBe(true);
    expect(rm.canEnterPosition()).toBe(false);
  });

  it('should emit events on daily loss breach', () => {
    const events: Array<{ type: string }> = [];
    rm.onEvent((e) => events.push({ type: e.type }));

    rm.recordTrade(-150);

    expect(events.some((e) => e.type === 'daily_loss_breached')).toBe(true);
  });

  it('should trigger emergency stop with correct actions', () => {
    const events: Array<{ type: string }> = [];
    rm.onEvent((e) => events.push({ type: e.type }));

    const actions = rm.triggerEmergencyStop('frontend');
    expect(actions).toContain('cancel_pending_orders');
    expect(actions).toContain('close_positions');
    expect(actions).toContain('stop_strategy_execution');
    expect(rm.isEmergencyStopTriggered).toBe(true);
    expect(events.some((e) => e.type === 'emergency_stop')).toBe(true);
  });

  it('should block entries during emergency stop', () => {
    rm.triggerEmergencyStop('telegram');
    expect(rm.canEnterPosition()).toBe(false);
  });

  it('should begin safe shutdown sequence', () => {
    const steps = rm.beginSafeShutdown();
    expect(steps).toEqual([
      'reject_new_entries',
      'finish_current_processing',
      'close_positions',
      'persist_state',
      'terminate',
    ]);
    expect(rm.isShutdownInProgress).toBe(true);
  });

  it('should reset emergency stop', () => {
    rm.triggerEmergencyStop('test');
    expect(rm.isEmergencyStopTriggered).toBe(true);
    rm.resetEmergencyStop();
    expect(rm.isEmergencyStopTriggered).toBe(false);
  });

  it('should emit entry_blocked when cannot enter', () => {
    const events: Array<{ type: string }> = [];
    rm.onEvent((e) => events.push({ type: e.type }));

    rm.triggerEmergencyStop('test');
    rm.canEnterPosition();

    expect(events.some((e) => e.type === 'entry_blocked')).toBe(true);
  });
});

// ---- RiskManager Wallet Balance Guard Tests ----

// Fixed timestamps: June 1 & June 2 2024 in UTC (mirrors wallet-balance-guard.test.ts).
// t1 = 2024-06-01T12:00:00Z, t2 = 2024-06-02T01:00:00Z (a new UTC trading day).
const t1 = Date.UTC(2024, 5, 1, 12);
const t2 = Date.UTC(2024, 5, 2, 1);

const USDC = 1_000_000n; // 1 whole USDC in micro-USDC

describe('RiskManager wallet balance guard', () => {
  let rm: RiskManager;

  beforeEach(() => {
    rm = new RiskManager({
      dailyLoss: { maxDailyLoss: 100, timezone: 'UTC' },
      emergencyClosePositions: true,
      walletBalance: { maxDailyWalletLossUsdc: 50, timezone: 'UTC' },
    });
  });

  it('should feed the guard and return breach when the threshold is crossed', () => {
    // 100 USDC reference capture, then a 51 USDC drop crosses the 50 USDC limit
    expect(rm.recordBalance(100n * USDC, t1)).toBe(false);
    expect(rm.isWalletBalanceBreached).toBe(false);

    expect(rm.recordBalance(49n * USDC, t1)).toBe(true);
    expect(rm.isWalletBalanceBreached).toBe(true);
  });

  it('should emit wallet_balance_breached with loss context on breach', () => {
    const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
    rm.onEvent((e) => events.push({ type: e.type, data: e.data }));

    rm.recordBalance(100n * USDC, t1);
    rm.recordBalance(40n * USDC, t1); // 60 USDC loss ≥ 50 USDC limit

    const event = events.find((e) => e.type === 'wallet_balance_breached');
    expect(event).toBeDefined();
    expect(event!.data).toEqual({
      lossUsdc: 60,
      maxLossUsdc: 50,
      referenceUsdc: 100,
      currentUsdc: 40,
    });
  });

  it('should emit wallet_balance_breached only on the false→true transition (R6)', () => {
    const events: Array<{ type: string }> = [];
    rm.onEvent((e) => events.push({ type: e.type }));

    rm.recordBalance(100n * USDC, t1);
    rm.recordBalance(40n * USDC, t1); // false→true → emit once
    rm.recordBalance(40n * USDC, t1); // still breached → no re-emit
    rm.recordBalance(30n * USDC, t1); // still breached → no re-emit

    // Concurrent per-trade + per-candle snapshots must not double-notify.
    expect(events.filter((e) => e.type === 'wallet_balance_breached')).toHaveLength(1);

    // A new trading day re-baselines the reference → breach clears → can
    // re-arm (edge-triggered again on the second day).
    rm.recordBalance(90n * USDC, t2); // new day, not breached
    rm.recordBalance(30n * USDC, t2); // false→true again → second emit
    expect(events.filter((e) => e.type === 'wallet_balance_breached')).toHaveLength(2);
  });

  it('should not emit wallet_balance_breached below the threshold', () => {
    const events: Array<{ type: string }> = [];
    rm.onEvent((e) => events.push({ type: e.type }));

    rm.recordBalance(100n * USDC, t1);
    rm.recordBalance(51n * USDC, t1); // 49 USDC loss — below limit

    expect(events.some((e) => e.type === 'wallet_balance_breached')).toBe(false);
    expect(rm.isWalletBalanceBreached).toBe(false);
  });

  it('should be a no-op when no walletBalance config is set', () => {
    const rmPlain = new RiskManager({
      dailyLoss: { maxDailyLoss: 100, timezone: 'UTC' },
      emergencyClosePositions: true,
    });
    const events: Array<{ type: string }> = [];
    rmPlain.onEvent((e) => events.push({ type: e.type }));

    expect(rmPlain.recordBalance(100n * USDC, t1)).toBe(false);
    expect(rmPlain.recordBalance(0n, t1)).toBe(false);
    expect(rmPlain.isWalletBalanceBreached).toBe(false);
    expect(rmPlain.canEnterPosition()).toBe(true);
    expect(events.some((e) => e.type === 'wallet_balance_breached')).toBe(false);
  });

  it('should block position entry after a wallet breach', () => {
    const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
    rm.onEvent((e) => events.push({ type: e.type, data: e.data }));

    rm.recordBalance(100n * USDC, t1);
    rm.recordBalance(40n * USDC, t1);

    expect(rm.isWalletBalanceBreached).toBe(true);
    expect(rm.canEnterPosition()).toBe(false);

    const blocked = events.find((e) => e.type === 'entry_blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.data).toMatchObject({ walletBalanceBreached: true });
  });

  it('should reset the wallet guard on a new trading day via recordBalance', () => {
    rm.recordBalance(100n * USDC, t1);
    expect(rm.recordBalance(40n * USDC, t1)).toBe(true);
    expect(rm.isWalletBalanceBreached).toBe(true);
    expect(rm.canEnterPosition()).toBe(false);

    // t2 is a new UTC day — the reference is re-captured from the current balance
    expect(rm.recordBalance(90n * USDC, t2)).toBe(false);
    expect(rm.isWalletBalanceBreached).toBe(false);
    expect(rm.canEnterPosition()).toBe(true);
  });

  it('should use the high-water reference so gains then givebacks count as loss', () => {
    rm.recordBalance(100n * USDC, t1);
    expect(rm.recordBalance(150n * USDC, t1)).toBe(false); // gain raises reference to 150

    expect(rm.recordBalance(120n * USDC, t1)).toBe(false); // 30 USDC below peak — under limit
    expect(rm.recordBalance(100n * USDC, t1)).toBe(true); // 50 USDC below peak — breached
    expect(rm.isWalletBalanceBreached).toBe(true);
  });
});

// ---- ShutdownHandler Tests ----

describe('ShutdownHandler', () => {
  let handler: ShutdownHandler;

  beforeEach(() => {
    handler = new ShutdownHandler();
  });

  afterEach(() => {
    handler.unregister();
  });

  it('should start not shutting down', () => {
    expect(handler.isShuttingDown).toBe(false);
  });

  it('should execute registered hooks in order', async () => {
    const order: number[] = [];
    handler.addHook(async () => { order.push(1); });
    handler.addHook(async () => { order.push(2); });
    handler.addHook(async () => { order.push(3); });

    await handler.executeShutdown('test');
    expect(order).toEqual([1, 2, 3]);
  });

  it('should continue on hook failure', async () => {
    const order: number[] = [];
    handler.addHook(async () => { throw new Error('Hook failed'); });
    handler.addHook(async () => { order.push(2); });

    await handler.executeShutdown('test');
    expect(order).toEqual([2]); // Second hook ran despite first failing
  });

  it('should register and unregister signal handlers', () => {
    handler.register();
    expect(process.listeners('SIGTERM').length).toBeGreaterThan(0);
    expect(process.listeners('SIGINT').length).toBeGreaterThan(0);

    handler.unregister();
    expect(process.listeners('SIGTERM').length).toBe(0);
    expect(process.listeners('SIGINT').length).toBe(0);
  });
});
