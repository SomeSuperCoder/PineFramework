/**
 * Tests for TelegramBotFeature — the policy layer of the Telegram bot.
 *
 * Drives handlers with fabricated `FeatureCommandContext` objects (the
 * transport-agnostic design), asserting behavior through the i18n replies the
 * user sees, not implementation details. Uses a real TelegramConfigStore on a
 * tmpdir so the full store→feature round-trip is exercised.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore, NOTIFICATION_TYPES } from '../src/store/TelegramConfigStore.js';
import {
  TelegramBotFeature,
  type CallbackContext,
  type FeatureCommandContext,
} from '../src/telegram/TelegramBotFeature.js';
import { renderGlobalPnlCard } from '../src/telegram/report/renderCard.js';
import { escapeMarkdownV2 } from '../src/telegram/TelegramService.js';
import { t } from '../src/telegram/i18n.js';
import type { StatsService } from '../src/services/StatsService.js';
import type { SessionSummary } from '../src/services/StatsService.js';

// The report card renderer shells out to sharp (real 800x440 rasterization).
// Mock the module at the boundary so NO real render runs in tests — the
// deterministic fake Buffer is asserted through the injected onPhoto transport.
vi.mock('../src/telegram/report/renderCard.js', () => ({
  renderGlobalPnlCard: vi.fn(),
}));

// The module-level renderGlobalPnlCard mock is shared across every test in this
// FILE; its call history must be reset before each test or toHaveBeenCalledTimes
// assertions leak the previous tests' invocations.
beforeEach(() => {
  vi.clearAllMocks();
});

type Reply = ReturnType<typeof vi.fn>;

function tmpFile(): string {
  return path.join(os.tmpdir(), `feat-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/**
 * Replica of the REAL transport parse: `new RegExp('^' + prefix + '(?::(.+))?$')`
 * + `params = match?.[1] ?? ''` (TelegramService.attachCallback). Callback tests
 * derive `action`/`params` from the emitted callback_data via this — never by
 * fabricating `params` independently of `data` (same discipline as
 * telegram-inline-buttons.test.ts / telegram-button-params.test.ts).
 */
function transportParse(actionPrefix: string, data: string): { action: string; params: string } {
  const re = new RegExp(`^${actionPrefix}(?::(.+))?$`);
  const match = data.match(re);
  return { action: actionPrefix, params: match?.[1] ?? '' };
}

/** Builds a fabricated context whose reply is the SAME spy the harness asserts on. */
type CtxOverrides = Partial<FeatureCommandContext> & { reply?: Reply };

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  ctx: (overrides?: CtxOverrides) => FeatureCommandContext;
  /** Fabricated inline-button callback context (callback handlers). */
  cbCtx: (overrides?: Partial<CallbackContext>) => CallbackContext;
  /** Callback context with `action`/`params` derived from callback_data via the REAL transport parse. */
  cb: (prefix: string, data: string, overrides?: Partial<CallbackContext>) => CallbackContext;
}

function makeHarness(opts: {
  stats?: Partial<StatsService> | null;
  engine?: unknown;
  onPhoto?: (chatId: number, buffer: Buffer, caption?: string) => Promise<boolean>;
} = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats:
      // Harness stores a partial stub; TelegramBotFeature's contract wants the
      // full service, so the stored stub is asserted here.
      opts.stats !== undefined
        ? (opts.stats as StatsService)
        : ({
            getSessionSummary: vi.fn(() => ({
              totalTrades: 0,
              winRate: 0,
              netPnl: 0,
              totalFees: 0,
              profitFactor: 0,
              bestTrade: 0,
              worstTrade: 0,
              maxDrawdown: 0,
              recent: [],
            })),
            // The report path reads the per-asset grouping for the movers
            // breakdown; a null grouping means "no movers section".
            getGroupedStats: vi.fn(() => null),
          } as Partial<StatsService> as StatsService),
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
    onPhoto: opts.onPhoto,
  });
  const ctx = (overrides: CtxOverrides = {}): FeatureCommandContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
  });
  const cbCtx = (overrides: Partial<CallbackContext> = {}): CallbackContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
    callbackQueryId: overrides.callbackQueryId ?? 'cb-test-001',
    data: overrides.data ?? 'stop:confirm',
    action: overrides.action ?? 'stop',
    params: overrides.params ?? 'confirm',
    answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
    editMessage: overrides.editMessage ?? vi.fn().mockResolvedValue(undefined),
  });
  const cb = (
    prefix: string,
    data: string,
    overrides: Partial<CallbackContext> = {},
  ): CallbackContext => {
    const { action, params } = transportParse(prefix, data);
    return cbCtx({ data, action, params, ...overrides });
  };
  (feature as unknown as { __tk: string }).__tk = filePath;
  return { store, feature, reply, ctx, cbCtx, cb };
}

function cleanHarness(h: Harness): void {
  const tk = (h.feature as unknown as { __tk?: string }).__tk;
  if (tk) { try { fs.unlinkSync(tk); } catch { /* ignore */ } }
}

describe('TelegramBotFeature auth gate', () => {
  it('M1: the report is member-visible — a non-controller CAN request it', async () => {
    // The report (merged stats surface) is member-facing, NOT operator-gated:
    // the old /stats operator gate is gone along with handleStats. A plain
    // member gets the full report text (no photo transport → text-only
    // fallback with the image-error note).
    const h = makeHarness();
    await h.feature.handleReport(h.ctx({ from: { id: 500, username: 'nobody' } }));
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.reply).not.toHaveBeenCalledWith(expect.stringContaining('Only an authorized operator'));
    const [text, extra] = h.reply.mock.calls[0]!;
    expect(text).toContain('📊 *Global PnL Report*');
    expect(extra).toEqual({ parse_mode: 'MarkdownV2' });
    cleanHarness(h);
  });

  it('allows the admin through (report is member-visible, admin included)', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'admin');
    await h.feature.handleReport(h.ctx({ from: { id: 1, username: 'admin' } }));
    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text] = h.reply.mock.calls[0]!;
    expect(text).toContain('📊 *Global PnL Report*');
    cleanHarness(h);
  });

  it('allows an approved controller through (report is member-visible, controller included)', async () => {
    const h = makeHarness();
    h.store.addController(777, 'oper', 1);
    await h.feature.handleReport(h.ctx({ from: { id: 777, username: 'oper' } }));
    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text] = h.reply.mock.calls[0]!;
    expect(text).toContain('📊 *Global PnL Report*');
    cleanHarness(h);
  });
});

describe('TelegramBotFeature request (dashboard button request:go)', () => {
  it('request:go submits a request and persists it', async () => {
    const h = makeHarness();
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleRequestCallback(h.cb('request', 'request:go', {
      from: { id: 50, username: 'newbie', first_name: 'New' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('submitted'), expect.anything());
    expect(h.store.getRequests()).toHaveLength(1);
    expect(h.store.getRequests()[0]!.username).toBe('newbie');
    cleanHarness(h);
  });

  it('request:go rejects a duplicate pending request', async () => {
    const h = makeHarness();
    h.store.addRequest(50, 'newbie', 'New');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleRequestCallback(h.cb('request', 'request:go', {
      from: { id: 50, username: 'newbie' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('pending'), expect.anything());
    expect(h.store.getRequests()).toHaveLength(1);
    cleanHarness(h);
  });

  it('request:go tells existing controllers/admin they are already granted', async () => {
    const h = makeHarness();
    h.store.addController(50, 'c', 1);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleRequestCallback(h.cb('request', 'request:go', {
      from: { id: 50, username: 'c' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('already granted access') as string, expect.anything());
    expect(h.store.getRequests()).toHaveLength(0);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature subscribe/unsubscribe (button-only toggles)', () => {
  it('sub:<type> subscribes a group member by member id (not chat id)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:error', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      editMessage,
    }));
    const chat = h.store.getChat(7000)!;
    expect(chat.type).toBe('group');
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    cleanHarness(h);
  });

  it('M1: sub:<type> on a fresh private chat TOGGLES the type OFF (ALL default is authoritative)', async () => {
    // A fresh private chat defaults to ALL types. The button path is a TOGGLE:
    // tapping sub:trading on an already-subscribed private chat REMOVES it — it
    // never claims a fake success (the old /subscribe failure case is gone).
    const h = makeHarness();
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', { editMessage }));
    expect(h.store.getMemberSubscription(1000, 1000)).not.toContain('trading');
    // The refreshed toggle keyboard reflects the change.
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('M1: unsub:<type> on a group member with no explicit subscription TOGGLES it ON', async () => {
    // Group members default to [] — the button path toggles: tapping
    // unsub:trading ADDS the type rather than reporting an unsubscribe failure.
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'm' },
      editMessage,
    }));
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['trading']);
    cleanHarness(h);
  });

  it('unsub:<type> removes a type and drops the key when empty (group)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading']);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'm' },
      editMessage,
    }));
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual([]);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature lang (button-only picker)', () => {
  it('lang:menu shows the picker with the back-to-dashboard row', async () => {
    const h = makeHarness();
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLangCallback(h.cb('lang', 'lang:menu', { editMessage }));
    const data = (editMessage.mock.calls[0]![1] as {
      reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
    }).reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    expect(data).toContain('lang:en');
    expect(data).toContain('lang:es');
    expect(data).toContain('lang:ru');
    expect(data).toContain('start:menu');
    cleanHarness(h);
  });

  it('lang:es sets a valid language and edits the message', async () => {
    const h = makeHarness();
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLangCallback(h.cb('lang', 'lang:es', { editMessage }));
    expect(h.store.getChatLanguage(1000)).toBe('es');
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('es'), expect.anything());
    cleanHarness(h);
  });

  it('lang:de is answered with an invalid-language toast and leaves the language unchanged', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLangCallback(h.cb('lang', 'lang:de', { answerCallback }));
    expect(answerCallback).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
    expect(h.store.getChatLanguage(1000)).toBe('en');
    cleanHarness(h);
  });
});

describe('TelegramBotFeature report (dashboard button report:show → global PnL + image)', () => {
  it('explains when no stats service is attached', async () => {
    const h = makeHarness({ stats: null });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    cleanHarness(h);
  });

  it('renders a zeroed report when there are no trades (empty state still renders + image)', async () => {
    const buf = Buffer.from('fake-png');
    const onPhoto = vi.fn().mockResolvedValue(true);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({
      stats: ({
        getSessionSummary: vi.fn(() => ({
          totalTrades: 0,
          winRate: 0,
          netPnl: 0,
          totalFees: 0,
          profitFactor: 0,
          bestTrade: 0,
          worstTrade: 0,
          maxDrawdown: 0,
          recent: [],
        })),
        getGroupedStats: vi.fn(() => null),
      } as Partial<StatsService> as StatsService),
      onPhoto,
    });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    // The empty report still renders the card (reportEmpty short-circuit REMOVED).
    expect(renderGlobalPnlCard).toHaveBeenCalledTimes(1);
    // Short report → the full text rides on the photo as its caption.
    expect(onPhoto).toHaveBeenCalledTimes(1);
    const [chatId, photoBuf, caption] = onPhoto.mock.calls[0]!;
    expect(chatId).toBe(1000);
    expect(photoBuf).toBe(buf);
    expect(caption).toContain('📊 *Global PnL Report*');
    expect(caption).toContain('💰 *Total: $0.00*');
    expect(caption).toContain('⚙️ Engine:');
    expect((caption as string).length).toBeLessThanOrEqual(1000);
    // The photo path is the delivery — no separate text reply.
    expect(h.reply).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('renders a report with trade rows (emojified format on the photo caption)', async () => {
    const buf = Buffer.from('fake-png');
    const onPhoto = vi.fn().mockResolvedValue(true);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({
      stats: ({
        getSessionSummary: vi.fn(() => ({
          totalTrades: 2,
          winRate: 0.5,
          netPnl: 10,
          totalFees: 0,
          profitFactor: 2,
          bestTrade: 10,
          worstTrade: -5,
          maxDrawdown: 5,
          recent: [
            { symbol: 'BTCUSDC', side: 'buy', realizedPnl: 10.5 },
            { symbol: 'ETHUSDC', side: 'sell', realizedPnl: -2 },
          ],
        } as unknown as SessionSummary)),
        getGroupedStats: vi.fn(() => ({
          BTCUSDC: { netPnl: 10.5 } as never,
          ETHUSDC: { netPnl: -2 } as never,
        })),
      } as Partial<StatsService> as StatsService),
      onPhoto,
    });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    const [, , caption] = onPhoto.mock.calls[0]!;
    // New emojified format: headline, total, split, metrics, movers, engine, generated.
    expect(caption).toContain('📊 *Global PnL Report*');
    expect(caption).toContain('💰 *Total:');
    expect(caption).toContain('🟢 Realized:');
    expect(caption).toContain('🧾 2 trades');
    expect(caption).toContain('🏆 Top movers:');
    expect(caption).toContain('• BTCUSDC');
    expect(caption).toContain('• ETHUSDC');
    expect(caption).toContain('⚙️ Engine:');
    expect(caption).toContain('⏱ Generated');
    cleanHarness(h);
  });

  it('image attach happy path: photo sent with chatId, buffer and the full text caption (≤1000 chars)', async () => {
    const buf = Buffer.from('png-bytes');
    const onPhoto = vi.fn().mockResolvedValue(true);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({ onPhoto });
    await h.feature.handleReport(h.ctx());
    expect(renderGlobalPnlCard).toHaveBeenCalledTimes(1);
    expect(onPhoto).toHaveBeenCalledTimes(1);
    const [chatId, buffer, caption] = onPhoto.mock.calls[0]!;
    expect(chatId).toBe(1000);
    expect(buffer).toBe(buf);
    expect(caption).toContain('📊 *Global PnL Report*');
    expect((caption as string).length).toBeLessThanOrEqual(1000);
    // Photo delivered → no fallback text reply.
    expect(h.reply).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('image fail path: renderGlobalPnlCard throws → text-only reply (escaped + MarkdownV2)', async () => {
    vi.mocked(renderGlobalPnlCard).mockRejectedValue(new Error('sharp unavailable'));
    const h = makeHarness();
    await h.feature.handleReport(h.ctx());
    expect(renderGlobalPnlCard).toHaveBeenCalledTimes(1);
    // The full text IS the delivery; never silent.
    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = h.reply.mock.calls[0]!;
    expect(text).toContain('📊 *Global PnL Report*');
    expect(text).toContain(escapeMarkdownV2('💰 *Total: $0.00*'));
    expect(extra).toEqual({ parse_mode: 'MarkdownV2' });
    cleanHarness(h);
  });

  it('sendPhoto returns false → text-only reply carrying the image-error note (escaped + MarkdownV2)', async () => {
    const buf = Buffer.from('png-bytes');
    const onPhoto = vi.fn().mockResolvedValue(false);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({ onPhoto });
    await h.feature.handleReport(h.ctx());
    expect(onPhoto).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = h.reply.mock.calls[0]!;
    // The image-error note is appended to the full text, then escaped together.
    expect(text).toContain('📊 *Global PnL Report*');
    expect(text).toContain(escapeMarkdownV2('🖼️ Image unavailable — text report above.'));
    expect(extra).toEqual({ parse_mode: 'MarkdownV2' });
    cleanHarness(h);
  });

  it('long report (>1000 chars): full text first, then photo with the short header caption', async () => {
    const recent = Array.from({ length: 80 }, (_, i) => ({
      symbol: `SYM${String(i).padStart(2, '0')}`,
      side: i % 2 === 0 ? 'buy' : 'sell',
      realizedPnl: i % 2 === 0 ? 10.5 : -2.25,
    }));
    const buf = Buffer.from('png-bytes');
    const onPhoto = vi.fn().mockResolvedValue(true);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({
      stats: ({
        getSessionSummary: vi.fn(() => ({
          totalTrades: recent.length,
          winRate: 0.684,
          netPnl: 10,
          totalFees: 0,
          profitFactor: 2.5,
          bestTrade: 10,
          worstTrade: -5,
          maxDrawdown: 5,
          recent,
        } as unknown as SessionSummary)),
        getGroupedStats: vi.fn(() => null),
      } as Partial<StatsService> as StatsService),
      onPhoto,
    });
    await h.feature.handleReport(h.ctx());
    // The long path sends the FULL escaped text as a message first...
    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = h.reply.mock.calls[0]!;
    expect(text).toContain('📊 *Global PnL Report*');
    expect((text as string).length).toBeGreaterThan(1000);
    expect(extra).toEqual({ parse_mode: 'MarkdownV2' });
    // ...then the photo with ONLY the bare header as its caption.
    expect(onPhoto).toHaveBeenCalledTimes(1);
    const [chatId, buffer, caption] = onPhoto.mock.calls[0]!;
    expect(chatId).toBe(1000);
    expect(buffer).toBe(buf);
    expect(caption).toBe('📊 *Global PnL Report*');
    cleanHarness(h);
  });

  it('stats merged: engine state + pairs + open positions render in the report', async () => {
    const buf = Buffer.from('png-bytes');
    const onPhoto = vi.fn().mockResolvedValue(true);
    vi.mocked(renderGlobalPnlCard).mockResolvedValue(buf);
    const h = makeHarness({
      engine: {
        state: 'Running',
        config: { pairs: [{ symbol: 'BTCUSDC' }, { symbol: 'ETHUSDC' }] },
        positions: [{ symbol: 'BTCUSDC', unrealizedPnl: 2.5 }],
        stop: vi.fn(),
        emergencyStop: vi.fn(),
      },
      onPhoto,
    });
    await h.feature.handleReport(h.ctx());
    const [, , caption] = onPhoto.mock.calls[0]!;
    // The merged report line carries engine state + pairs + open positions.
    expect(caption).toContain('⚙️ Engine: 🟢 running · 👀 2 pairs · 📌 1 open positions');
    // The open position's unrealized PnL feeds the split line.
    expect(caption).toContain('🔵 Unrealized: +$2.50');
    cleanHarness(h);
  });
});

describe('TelegramBotFeature stop/emergency (button-only two-step flow)', () => {
  it('M1: stop:ask does NOT stop immediately — it asks for confirmation', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ p: 1 }] }, positions: [{ p: 1 }], stop, emergencyStop: vi.fn() } });
    h.store.addController(2, 'op', 1);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:ask', {
      from: { id: 2, username: 'op' },
      editMessage,
    }));
    // Two-step: the ask must NOT stop the engine.
    expect(stop).not.toHaveBeenCalled();
    // The ask edits the message to the stop-continue keyboard.
    expect(editMessage).toHaveBeenCalledWith(
      expect.stringContaining('Confirm engine stop'),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
    cleanHarness(h);
  });

  it('M1: stop:ask → stop:confirm runs engine.stop() and reports success', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ p: 1 }] }, positions: [{ p: 1 }], stop, emergencyStop: vi.fn() } });
    h.store.addController(2, 'op', 1);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:ask', { from: { id: 2, username: 'op' } }));
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', { from: { id: 2, username: 'op' } }));
    expect(stop).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('M1: stop:confirm with a missing engine reports stop cancelled (engine untouched)', async () => {
    const h = makeHarness(); // no engine
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', {
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('cancelled'), expect.anything());
    cleanHarness(h);
  });

  it('stop denies a non-operator even on the confirm button', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', {
      from: { id: 500, username: 'nobody' },
      answerCallback,
      editMessage,
    }));
    expect(stop).not.toHaveBeenCalled();
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized'));
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('emergency:ask asks the operator to confirm before stopping', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({ engine: { state: 'Error', config: {}, positions: [], stop: vi.fn(), emergencyStop } });
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:ask', {
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    // Two-step confirm: the ask must NOT stop the engine until confirm is pressed.
    expect(emergencyStop).not.toHaveBeenCalled();
    expect(editMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }),
    );
    cleanHarness(h);
  });

  it('M1: confirmation replies cancelled when engine.stop() throws', async () => {
    const stop = vi.fn().mockRejectedValue(new Error('boom'));
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:ask', { from: { id: 1 }, editMessage }));
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', { from: { id: 1 }, editMessage }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenLastCalledWith(expect.stringContaining('cancelled'), expect.anything());
    cleanHarness(h);
  });
});

describe('TelegramBotFeature stop/emergency gating (operator-only controls)', () => {
  /** All buttons on the keyboard of the FIRST reply call. */
  function dashboardButtons(reply: Reply): Array<{ text: string; callback_data: string }> {
    const extra = reply.mock.calls[0]?.[1] as
      | { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } }
      | undefined;
    expect(extra, 'reply must carry reply_markup extras').toBeDefined();
    return extra!.reply_markup.inline_keyboard.flat();
  }

  it('A: /start hides the operator row (Stop/Emergency) from a non-operator', async () => {
    const h = makeHarness();
    // Known non-controller, non-admin user.
    await h.feature.handleStart(h.ctx({ from: { id: 500, username: 'nobody' } }));
    const buttons = dashboardButtons(h.reply);
    expect(buttons.some((b) => b.callback_data.startsWith('stop:'))).toBe(false);
    expect(buttons.some((b) => b.callback_data.startsWith('emergency:'))).toBe(false);
    expect(buttons.some((b) => b.callback_data === 'stats:show')).toBe(false);
    expect(buttons.some((b) => b.callback_data === 'notif:menu')).toBe(true);
    cleanHarness(h);
  });

  it('B: /start shows the operator row (Stop + Emergency) for the admin/controller', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    await h.feature.handleStart(h.ctx({ from: { id: 1, username: 'boss' } }));
    const buttons = dashboardButtons(h.reply);
    // The dashboard Stop emits stop:ask (two-step confirm), not stop:confirm.
    expect(buttons.some((b) => b.callback_data === 'stop:ask')).toBe(true);
    expect(buttons.some((b) => b.callback_data === 'emergency:ask')).toBe(true);
    // The ⚙️ Stats dashboard button is GONE — its surface merged into Report.
    expect(buttons.some((b) => b.callback_data === 'stats:show')).toBe(false);
    // The link/unlink callbacks are GONE: the operator row exposes NO link or
    // unlink buttons (auto-link on /start replaced the manual flows).
    expect(buttons.some((b) => b.callback_data.startsWith('link'))).toBe(false);
    expect(buttons.some((b) => b.callback_data.startsWith('unlink'))).toBe(false);
    cleanHarness(h);
  });

  it('the Backtest button (bt:start) is on the dashboard for EVERY user — not operator-gated', async () => {
    // Non-operator: backtest is part of the shared surface, like /backtest itself.
    const h = makeHarness();
    await h.feature.handleStart(h.ctx({ from: { id: 500, username: 'nobody' } }));
    let buttons = dashboardButtons(h.reply);
    expect(buttons.some((b) => b.callback_data === 'bt:start')).toBe(true);
    expect(buttons.find((b) => b.callback_data === 'bt:start')?.text).toBe(t('en', 'dashBtnBacktest'));
    cleanHarness(h);

    // Operator: same row present, not hidden behind the operator-gated controls.
    const h2 = makeHarness();
    h2.store.setAdmin(1, 'boss');
    await h2.feature.handleStart(h2.ctx({ from: { id: 1, username: 'boss' } }));
    buttons = dashboardButtons(h2.reply);
    expect(buttons.some((b) => b.callback_data === 'bt:start')).toBe(true);
    expect(buttons.find((b) => b.callback_data === 'bt:start')?.text).toBe(t('en', 'dashBtnBacktest'));
    cleanHarness(h2);
  });

  it.each(['stop:done', 'stop:confirm'])(
    'C: a non-operator pressing %s is denied — engine.stop() is NOT called',
    async (data) => {
      const stop = vi.fn();
      const h = makeHarness({
        engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() },
      });
      const answerCallback = vi.fn().mockResolvedValue(undefined);
      const editMessage = vi.fn().mockResolvedValue(undefined);
      await h.feature.handleStopCallback(
        h.cb('stop', data, { from: { id: 500, username: 'nobody' }, answerCallback, editMessage }),
      );
      expect(stop).not.toHaveBeenCalled();
      expect(answerCallback).toHaveBeenCalledTimes(1); // spinner dismissed so the denial reads
      expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized operator'));
      expect(editMessage).not.toHaveBeenCalled();
      cleanHarness(h);
    },
  );

  it('D: the operator CAN stop via the stop:confirm callback', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() },
    });
    h.store.addController(42, 'op', 1);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(
      h.cb('stop', 'stop:confirm', { from: { id: 42, username: 'op' }, answerCallback, editMessage }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    // Dismiss the spinner twice: once for the query, once for the success toast.
    expect(answerCallback).toHaveBeenCalledTimes(2);
    cleanHarness(h);
  });

  it('D2: the unhandled "done" stop param does NOT stop the engine (contract: only confirm stops)', async () => {
    const stop = vi.fn();
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() },
    });
    h.store.addController(42, 'op', 1);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(
      h.cb('stop', 'stop:done', { from: { id: 42, username: 'op' }, answerCallback }),
    );
    // An operator pressing an UNKNOWN stop param gets the spinner answered but
    // the engine is NOT halted — only `stop:confirm` halts it.
    expect(stop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('E: a non-operator pressing emergency:confirm cannot trigger emergencyStop()', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() },
    });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleEmergencyCallback(
      h.cb('emergency', 'emergency:confirm', {
        from: { id: 500, username: 'nobody' },
        answerCallback,
        editMessage,
      }),
    );
    expect(emergencyStop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized operator'));
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });
});

describe('TelegramBotFeature auto-link on /start (link/unlink callbacks removed)', () => {
  it('AUTO-LINK: /start in a GROUP links it, recording the starter as linkedBy', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 55, username: 'alice', first_name: 'Alice' },
    }));
    expect(h.store.isLinked(7000)).toBe(true);
    expect(h.store.getChat(7000)!.linkedBy).toBe(55);
    cleanHarness(h);
  });

  it('AUTO-LINK: a store-created group (no /start) stays UNLINKED until started', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    expect(h.store.isLinked(7000)).toBe(false);
    // The first /start in the group is what links it — no operator button needed.
    await h.feature.handleStart(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 55, username: 'alice', first_name: 'Alice' },
    }));
    expect(h.store.isLinked(7000)).toBe(true);
    expect(h.store.getChat(7000)!.linkedBy).toBe(55);
    cleanHarness(h);
  });

  it('AUTO-LINK (regression): private chats are still linked on creation', async () => {
    const h = makeHarness();
    h.store.addChat(9000, 'private');
    expect(h.store.isLinked(9000)).toBe(true);
    cleanHarness(h);
  });

  it('AUTO-LINK: /start in a group without a from.id still links (linkedBy falls back to 0)', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.ctx({
      chat: { id: 7001, type: 'group' },
      from: { username: 'anonymous' } as never,
    }));
    expect(h.store.isLinked(7001)).toBe(true);
    expect(h.store.getChat(7001)!.linkedBy).toBe(0);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature button-only: no text control seam', () => {
  it('a stray "yes" text cannot stop the engine — the fallback only replies unknownCommand', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    h.store.setAdmin(1, 'boss');
    // The text seam is GONE: install() registers no text handler and there is
    // no pendingStops 'yes' path. The only public text fallback (handleUnknown)
    // answers with the unknown-command message and never touches the engine.
    await h.feature.handleUnknown(h.ctx({ from: { id: 1, username: 'boss' }, message: { text: 'yes' } }));
    expect(stop).not.toHaveBeenCalled();
    // The rewritten unknownCommand copy no longer contains the literal phrase
    // "Unknown command" — assert the stable i18n text instead.
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('I do not understand'));
    cleanHarness(h);
  });
});

describe('B2 — install() transport seam (button-only)', () => {
  it('registers EXACTLY /start as the only command on the transport', async () => {
    const h = makeHarness();
    const registered: string[] = [];
    const registerBotCommand = vi.fn((cmd: string) => { registered.push(cmd); });
    h.feature.install({ registerBotCommand });
    // /start is the ONLY dashboard command — every other control is button-only
    // (the 11 text commands were removed). The telegram-backtest-flow change
    // intentionally adds exactly one more: /backtest.
    expect(registered).toEqual(['start', 'backtest']);
    expect(registerBotCommand).toHaveBeenCalledTimes(2);
    cleanHarness(h);
  });

  it('registers every emitted inline-button callback prefix (no dead buttons)', async () => {
    const h = makeHarness();
    const registerBotCallback = vi.fn();
    h.feature.install({ registerBotCommand: vi.fn(), registerBotCallback });
    const prefixes = registerBotCallback.mock.calls.map((c) => c[0]);
    // 9 emitted prefixes: the 'stats' entry was REMOVED (surface merged into
    // the report button).
    for (const p of ['sub', 'unsub', 'lang', 'report', 'stop', 'emergency', 'notif', 'start', 'request']) {
      expect(prefixes).toContain(p);
    }
    expect(prefixes).not.toContain('stats');
    cleanHarness(h);
  });

  it('does NOT wire any text seam — control is button-only', async () => {
    const h = makeHarness();
    const registerBotText = vi.fn();
    // The transport contract no longer offers a text seam; if one is passed
    // anyway, install() must NOT consume it (the pendingStops 'yes' path is gone).
    const transport = { registerBotCommand: vi.fn(), registerBotText };
    h.feature.install(transport);
    expect(registerBotText).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('still works on a command-only transport (no callback seam)', async () => {
    const h = makeHarness();
    const registerBotCommand = vi.fn();
    h.feature.install({ registerBotCommand });
    expect(registerBotCommand).toHaveBeenCalledTimes(2);
    expect(registerBotCommand).toHaveBeenCalledWith('start', expect.any(Function));
    expect(registerBotCommand).toHaveBeenCalledWith('backtest', expect.any(Function));
    cleanHarness(h);
  });
});

describe('TelegramBotFeature.deliver routing', () => {
  let filePath: string;
  let store: TelegramConfigStore;
  let feature: TelegramBotFeature;
  let onMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filePath = tmpFile();
    store = new TelegramConfigStore(filePath);
    onMessage = vi.fn().mockResolvedValue(true);
    feature = new TelegramBotFeature({ store, stats: null, getEngine: () => null, onMessage });
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('delivers to a private subscribed chat', async () => {
    store.addChat(9000, 'private');
    const n = await feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledWith(9000, 'msg[en]');
  });

  it('does NOT deliver when a chat is not subscribed to the type', async () => {
    // A linked group with NO member subscriptions defaults to [] — nothing
    // subscribed ⇒ no delivery.
    store.addChat(7000, 'group');
    store.linkChat(7000, 1);
    const n = await feature.deliver('trading', () => 'x');
    expect(n).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('does NOT deliver to a private chat that unsubscribed from EVERY type', async () => {
    // Private chats default to ALL — but an explicit full unsubscribe must
    // stick: an explicit [] is authoritative, so deliver returns 0 for that
    // member (no ALL-default resurrection).
    store.addChat(9000, 'private');
    store.memberUnsubscribe(9000, 9000, [...NOTIFICATION_TYPES]);
    const n = await feature.deliver('trading', () => 'x');
    expect(n).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('delivers to a group only when it is linked', async () => {
    store.addChat(7000, 'group');
    store.memberSubscribe(7000, 55, ['trading']);
    // unlinked
    await feature.deliver('trading', () => 'x');
    expect(onMessage).not.toHaveBeenCalled();

    // linked
    store.linkChat(7000, 1);
    const n = await feature.deliver('trading', (l) => `g[${l}]`);
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledWith(7000, 'g[en]');
  });

  it('routes a single chat when chatId is given', async () => {
    store.addChat(9000, 'private');
    store.addChat(9001, 'private');
    const n = await feature.deliver('error', () => 'e', { chatId: 9001 });
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(9001, 'e');
  });

  it('passes each chat its own per-chat language', async () => {
    store.addChat(9000, 'private');
    store.addChat(9001, 'private');
    store.setChatLanguage(9000, 'es');
    store.setChatLanguage(9001, 'ru');
    const langs: string[] = [];
    const n = await feature.deliver('trading', (lang) => { langs.push(lang); return lang; });
    expect(n).toBe(2);
    expect(langs.sort()).toEqual(['es', 'ru']);
  });

  it('dedupes a group to a single delivery even with multiple subscribed members', async () => {
    store.addChat(7000, 'group');
    store.linkChat(7000, 1);
    store.memberSubscribe(7000, 10, ['trading']);
    store.memberSubscribe(7000, 20, ['trading']);
    const n = await feature.deliver('trading', () => 'x');
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('returns 0 and calls nothing when onMessage is absent', async () => {
    const noTransport = new TelegramBotFeature({ store, stats: null, getEngine: () => null });
    const n = await noTransport.deliver('trading', () => 'x');
    expect(n).toBe(0);
  });
});