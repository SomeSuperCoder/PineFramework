/**
 * Smoke tests for renderNotification — the pure per-language live-trading
 * renderer. It consumes the core package's `escapeMarkdown` (reused as the
 * single escaping source), so these assert content composition, i18n key
 * resolution, and escaping through the real function in all three languages.
 */

import { describe, it, expect } from 'vitest';
import { renderNotification } from '../src/telegram/notification-renderer.js';
import type { TradingNotificationData } from 'pine-framework/trading/telegram-bot';
import { BotState } from 'pine-framework';

const CONFIG = {
  strategySource: '//@version=5',
  dex: 'jupiter-swap' as const,
  pairs: [{ symbol: 'SOL/USDC', timeframe: '1m' }],
  risk: { maxDailyLoss: 100, dailyLossTimezone: 'UTC', closeOnLoss: false },
};

const TRADE = {
  id: 't1',
  botId: 'b1',
  symbol: 'SOL/USDC',
  side: 'buy' as const,
  entryPrice: 100,
  exitPrice: 110,
  size: 10,
  fees: 0.1,
  realizedPnl: 10.5,
  dex: 'jupiter-swap' as const,
  openedAt: 1000,
  closedAt: 2000,
};

const CASES: Array<{ kind: Parameters<typeof renderNotification>[0]; data: TradingNotificationData; probe: string }> = [
  { kind: 'bot_started', data: { kind: 'bot_started', config: CONFIG }, probe: 'PineFramework' },
  { kind: 'bot_stopped', data: { kind: 'bot_stopped', runtimeMs: 3600000, tradeCount: 5, pnl: 50.5 }, probe: 'Trades' },
  { kind: 'position_open', data: { kind: 'position_open', trade: TRADE }, probe: 'SOL/USDC' },
  { kind: 'position_close', data: { kind: 'position_close', trade: TRADE }, probe: 'SOL/USDC' },
  { kind: 'emergency_stop', data: { kind: 'emergency_stop', source: 'frontend' }, probe: 'frontend' },
  { kind: 'daily_loss', data: { kind: 'daily_loss', loss: 100, maxLoss: 50 }, probe: 'Loss' },
  { kind: 'error', data: { kind: 'error', code: 'ERR', message: 'Something broke [x]' }, probe: 'ERR' },
  { kind: 'warning', data: { kind: 'warning', message: 'Low balance' }, probe: 'Low' },
  { kind: 'state_change', data: { kind: 'state_change', from: BotState.Running, to: BotState.Error, reason: 'volatility' }, probe: 'Error' },
];

describe('renderNotification', () => {
  it.each(CASES)('renders a non-blank $kind message in en', ({ kind, data, probe }) => {
    const out = renderNotification(kind, 'en', data);
    expect(out.length).toBeGreaterThan(0);
    if (probe) expect(out).toContain(probe);
  });

  it('resolves every kind for every supported language', () => {
    for (const lang of ['en', 'es', 'ru'] as const) {
      for (const c of CASES) {
        const out = renderNotification(c.kind, lang, c.data);
        expect(out.length).toBeGreaterThan(0);
      }
    }
  });

  it('escapes MarkdownV2 metacharacters in dynamic values', () => {
    const out = renderNotification('error', 'en', {
      kind: 'error',
      code: 'A_B',
      message: 'ticker *BTC* [x]',
    });
    // The escaped message must not contain a raw unescaped `*`.
    expect(out).toContain('\\*BTC\\*');
    expect(out).toContain('\\[x\\]');
  });

  it('truncates over-long error messages at 200 chars', () => {
    const long = 'x'.repeat(300);
    const out = renderNotification('error', 'en', { kind: 'error', code: 'E', message: long });
    // Only 200 of the 300 x's survive (the rest is "...") — the full 300-char
    // payload must not appear verbatim.
    expect(out).toContain('x'.repeat(200));
    expect(out).not.toContain('x'.repeat(201));
    // The truncation marker is present (each dot escaped to `\.`).
    expect(out).toContain('\\.');
  });

  it('formats daily loss with the escaped USD helper', () => {
    const out = renderNotification('daily_loss', 'en', { kind: 'daily_loss', loss: -123.4, maxLoss: 50 });
    expect(out).toContain('123\\.40'); // escaped decimal
  });
});