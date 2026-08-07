/**
 * PERMANENT REGRESSION SUITE — Telegram dashboard inline buttons, driven through
 * the REAL transport parse (the exact regex `^{prefix}(?::(.+))?$` with
 * `params = match[1] ?? ''` from TelegramService.attachCallback) instead of
 * fabricating `params` directly.
 *
 * ROOT CAUSE (now FIXED): the old inline keyboards emitted multi-segment
 * callback_data (`lang:set:en`, `sub:toggle:trading`) whose params the
 * transport derived as `set:en` / `toggle:trading`, which the handlers treated
 * as an invalid language / unknown type → dead buttons. The fix:
 *
 *   1. Emitters now use a flat `action:value` protocol:
 *        lang:en | lang:es | lang:ru          (language picker)
 *        sub:trading | unsub:daily | ...      (toggle keyboards)
 *        sub:menu / unsub:menu / lang:menu     (dashboard navigation)
 *        report:show / stats:show / stop:confirm / emergency:confirm
 *   2. Handlers parse values TOLERANTLY via `params.split(':').pop()`, so
 *      legacy multi-segment data (`lang:set:en`, `sub:toggle:trading`) STILL
 *      WORKS. Reserved exact matches (`menu`, `confirm`, `cancel`, `show`)
 *      dispatch first.
 *
 * This suite verifies BOTH the flat protocol and the legacy-tolerant path,
 * plus the dead-button regression (install() registers every emitted prefix)
 * and the SSOT registry validation (install() throws on a missing backing
 * action).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import type { StatsService } from '../src/services/StatsService.js';
import {
  TelegramBotFeature,
  type CallbackContext,
  type BotCommandTransport,
} from '../src/telegram/TelegramBotFeature.js';

// ---------------------------------------------------------------------------
// The REAL transport parse (TelegramService.attachCallback, TelegramService.ts:158-159)
// ---------------------------------------------------------------------------

/** Replica of `new RegExp('^' + actionPrefix + '(?::(.+))?$')` + `ctx.match?.[1] ?? ''`. */
function transportParse(actionPrefix: string, data: string): { action: string; params: string } {
  const re = new RegExp(`^${actionPrefix}(?::(.+))?$`);
  const match = data.match(re);
  return { action: actionPrefix, params: match?.[1] ?? '' };
}

// ---------------------------------------------------------------------------
// Harness — same pattern as backend/tests/telegram-inline-buttons.test.ts
// ---------------------------------------------------------------------------

type Reply = ReturnType<typeof vi.fn>;

function tmpFile(): string {
  return path.join(os.tmpdir(), `btnparam-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** A valid /report session summary (SessionSummary shape). */
function makeSummary(): NonNullable<ReturnType<StatsService['getSessionSummary']>> {
  return {
    totalTrades: 1,
    winRate: 0.5,
    netPnl: 12.5,
    totalFees: 0.5,
    profitFactor: 2,
    bestTrade: 10,
    worstTrade: -2,
    maxDrawdown: 3,
    recent: [{ symbol: 'BTC', side: 'buy', realizedPnl: 4.2 }] as never,
  };
}

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  cbCtx: (overrides?: Partial<CallbackContext>) => CallbackContext;
}

function makeHarness(opts: { engine?: unknown; stats?: unknown } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats:
      opts.stats !== undefined
        ? (opts.stats as StatsService)
        : ({
            getSessionSummary: () => makeSummary(),
          } as Partial<StatsService> as StatsService),
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
  });

  const cbCtx = (overrides: Partial<CallbackContext> = {}): CallbackContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
    callbackQueryId: overrides.callbackQueryId ?? 'cb-test-001',
    data: overrides.data ?? 'lang:en',
    action: overrides.action ?? 'lang',
    params: overrides.params ?? '',
    answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
    editMessage: overrides.editMessage ?? vi.fn().mockResolvedValue(undefined),
  });

  (feature as unknown as { __tk: string }).__tk = filePath;
  return { store, feature, reply, cbCtx };
}

function cleanHarness(h: Harness): void {
  const tk = (h.feature as unknown as { __tk?: string }).__tk;
  if (tk) {
    try {
      fs.unlinkSync(tk);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Build a CallbackContext the way the REAL transport would: derive `action` and
 * `params` from the emitted callback_data via transportParse, exactly like
 * TelegramService.attachCallback does before invoking the feature handler.
 */
function parseCtx(
  h: Harness,
  prefix: string,
  data: string,
  overrides: Partial<CallbackContext> = {},
): CallbackContext {
  const parsed = transportParse(prefix, data);
  return h.cbCtx({ data, action: parsed.action, params: parsed.params, ...overrides });
}

/** Emitted callback_data values from a reply's inline_keyboard. */
function replyCallbackData(reply: Reply): string[] {
  const [, extra] = reply.mock.calls[0]! as [string, { reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } }];
  return extra.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
}

/** Emitted callback_data values from the first editMessage call's keyboard. */
function editCallbackData(editMessage: Reply): string[] {
  const { reply_markup } = editMessage.mock.calls[0]![1] as { reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } };
  return reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
}

// ---------------------------------------------------------------------------
// FIXED: Language buttons (flat AND legacy multi-segment tolerate)
// ---------------------------------------------------------------------------

describe('lo guard: language buttons (flat + legacy) set the language', () => {
  it('lang:en (flat) → chat language becomes en and the message is edited', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'lang', 'lang:en', { answerCallback, editMessage });
    expect(ctx.params).toBe('en');

    await h.feature.handleLangCallback(ctx);

    expect(h.store.getChatLanguage(1000)).toBe('en');
    expect(h.reply).not.toHaveBeenCalled(); // no toast
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('lang:es (flat) → switches the chat to Spanish and edits the message', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'lang', 'lang:es', { answerCallback, editMessage });
    expect(ctx.params).toBe('es');

    await h.feature.handleLangCallback(ctx);

    expect(h.store.getChatLanguage(1000)).toBe('es');
    expect(editMessage).toHaveBeenCalledTimes(1);
    // The edited message keeps the language picker keyboard (flat callbacks).
    const data = editCallbackData(editMessage);
    expect(data).toContain('lang:en');
    expect(data).toContain('lang:ru');

    cleanHarness(h);
  });

  it('LEGACY lang:set:es → STILL works (tolerant parse: params split on ":")', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'lang', 'lang:set:es', { answerCallback, editMessage });
    expect(ctx.params).toBe('set:es'); // the REAL transport parse

    await h.feature.handleLangCallback(ctx);

    // Tolerant: params "set:es" → split(':').pop() → "es" → language applied.
    expect(h.store.getChatLanguage(1000)).toBe('es');
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// FIXED — Subscribe / Unsubscribe toggle buttons (flat + legacy tolerate)
// ---------------------------------------------------------------------------

describe('FIXED: subscribe/unsubscribe toggle buttons subscribe/unsubscribe', () => {
  it('sub:trading (flat) → subscribes member to trading', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'sub', 'sub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });
    expect(ctx.params).toBe('trading');

    await h.feature.handleSubscribeCallback(ctx);

    expect(h.store.getMemberSubscription(7000, 1200)).toContain('trading');
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('LEGACY sub:toggle:trading → STILL toggles trading (tolerant parse)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);

    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'sub', 'sub:toggle:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });
    expect(ctx.params).toBe('toggle:trading');

    await h.feature.handleSubscribeCallback(ctx);

    // params.split(':').pop() → "trading" → toggles OFF (was subscribed).
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('LEGACY sub:toggle:error → toggles error ON (tolerant)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');

    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'sub', 'sub:toggle:error', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });

    await h.feature.handleSubscribeCallback(ctx);

    expect(h.store.getMemberSubscription(7000, 1200)).toContain('error');

    cleanHarness(h);
  });

  it('unsub:trading (flat) → unsubscribes member from trading', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });
    expect(ctx.params).toBe('trading');

    await h.feature.handleUnsubscribeCallback(ctx);

    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('LEGACY unsub:toggle:trading → STILL unsubscribes trading (tolerant)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'unsub', 'unsub:toggle:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });
    expect(ctx.params).toBe('toggle:trading');

    await h.feature.handleUnsubscribeCallback(ctx);

    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// FIXED — Menu navigation (dashboard buttons) show their picker/keyboard
// ---------------------------------------------------------------------------

describe('FIXED: menu callbacks from the /start dashboard', () => {
  it('lang:menu → shows the language picker', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'lang', 'lang:menu', { answerCallback, editMessage });
    expect(ctx.params).toBe('menu');

    await h.feature.handleLangCallback(ctx);

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const data = editCallbackData(editMessage);
    expect(data).toContain('lang:en');
    expect(data).toContain('lang:es');

    cleanHarness(h);
  });

  it('sub:menu → shows the subscribe toggle keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'sub', 'sub:menu', { answerCallback, editMessage });
    expect(ctx.params).toBe('menu');

    await h.feature.handleSubscribeCallback(ctx);

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    // Flat protocol: toggle buttons now emit `sub:<type>` (a sub:trading type).
    const data = editCallbackData(editMessage);
    expect(data.some((d) => d.startsWith('sub:trading') || d.startsWith('sub:position_open'))).toBe(true);

    cleanHarness(h);
  });

  it('unsub:menu → shows the unsubscribe toggle keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'unsub', 'unsub:menu', { answerCallback, editMessage });
    expect(ctx.params).toBe('menu');

    await h.feature.handleUnsubscribeCallback(ctx);

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const data = editCallbackData(editMessage);
    expect(data.some((d) => d.startsWith('unsub:trading') || d.startsWith('unsub:position_open'))).toBe(true);

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// FIXED — Report / Stats dashboard callbacks
// ---------------------------------------------------------------------------

describe('FIXED: report:show / stats:show callbacks', () => {
  it('report:show → answers the query and produces the report reply', async () => {
    const h = makeHarness({ stats: { getSessionSummary: () => makeSummary() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'report', 'report:show', { answerCallback });
    expect(ctx.params).toBe('show');

    await h.feature.handleReportCallback(ctx);

    // The /report flow replies with content (a non-empty session), and the
    // callback query is answered to dismiss the spinner.
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledTimes(1);
    const text = h.reply.mock.calls[0]![0] as string;
    expect(text.length).toBeGreaterThan(0);

    cleanHarness(h);
  });

  it('stats:show → controller-gated: non-controller is DENIED', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);

    // from.id 1000 is NOT admin and NOT a controller.
    const ctx = parseCtx(h, 'stats', 'stats:show', { answerCallback });
    await h.feature.handleStatsCallback(ctx);

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.reply.mock.calls[0]![0]).toContain('Only an authorized operator');

    cleanHarness(h);
  });

  it('stats:show → controller-gated: the admin IS allowed', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ symbol: 'X' }] }, positions: [], emergencyStop: vi.fn(), stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);

    h.store.setAdmin(1, 'boss');
    const ctx = parseCtx(h, 'stats', 'stats:show', { from: { id: 1, username: 'boss' }, answerCallback });
    expect(ctx.params).toBe('show');

    await h.feature.handleStatsCallback(ctx);

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledTimes(1);
    expect(h.reply.mock.calls[0]![0]).toContain('Engine state');

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// FIXED — Stop / Emergency confirm/cancel still work
// ---------------------------------------------------------------------------

describe('FIXED: stop/emergency confirm/cancel', () => {
  it('stop:confirm → engine.stop() runs', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop },
    });
    // Operator (from.id 1000): the Stop/Emergency callbacks are gated by assertController.
    h.store.setAdmin(1000, 'tester');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'stop', 'stop:confirm', { answerCallback, editMessage });
    expect(ctx.params).toBe('confirm');

    await h.feature.handleStopCallback(ctx);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(2); // top spinner dismiss + success answer
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('stop:cancel → engine.stop() is NOT called', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop },
    });
    // Operator (from.id 1000): the Stop/Emergency callbacks are gated by assertController.
    h.store.setAdmin(1000, 'tester');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'stop', 'stop:cancel', { answerCallback, editMessage });
    expect(ctx.params).toBe('cancel');

    await h.feature.handleStopCallback(ctx);

    expect(stop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(2); // top spinner dismiss + cancel answer
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('emergency:confirm → engine.emergencyStop() runs', async () => {
    const emergencyStop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() },
    });
    // Operator (from.id 1000): the Stop/Emergency callbacks are gated by assertController.
    h.store.setAdmin(1000, 'tester');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'emergency', 'emergency:confirm', { answerCallback, editMessage });
    expect(ctx.params).toBe('confirm');

    await h.feature.handleEmergencyCallback(ctx);

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(2); // top spinner dismiss + success answer
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });

  it('emergency:cancel → engine.emergencyStop() is NOT called', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({
      engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() },
    });
    // Operator (from.id 1000): the Stop/Emergency callbacks are gated by assertController.
    h.store.setAdmin(1000, 'tester');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'emergency', 'emergency:cancel', { answerCallback, editMessage });
    expect(ctx.params).toBe('cancel');

    await h.feature.handleEmergencyCallback(ctx);

    expect(emergencyStop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(2); // top spinner dismiss + cancel answer
    expect(editMessage).toHaveBeenCalledTimes(1);

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// FIXED — Unknown legacy junk is a graceful NO-OP (answer, no store change, no throw)
// ---------------------------------------------------------------------------

describe('FIXED: unknown legacy junk is a graceful no-op', () => {
  it('lang:set:xyz → answered, no language change, no throw', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'lang', 'lang:set:xyz', { answerCallback, editMessage });

    await expect(h.feature.handleLangCallback(ctx)).resolves.toBeUndefined();

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    expect(h.store.getChatLanguage(1000)).toBe('en'); // unchanged

    cleanHarness(h);
  });

  it('sub:toggle:bogus → answered, no subscription change, no throw', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'sub', 'sub:toggle:bogus', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    });

    await expect(h.feature.handleSubscribeCallback(ctx)).resolves.toBeUndefined();

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual([]);

    cleanHarness(h);
  });

  it('report:garbage → answered, no reply produced, no throw', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'report', 'report:garbage', { answerCallback });

    await expect(h.feature.handleReportCallback(ctx)).resolves.toBeUndefined();

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).not.toHaveBeenCalled();

    cleanHarness(h);
  });

  it('stats:garbage → answered, no-op produced (not even the gate applies), no throw', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);

    const ctx = parseCtx(h, 'stats', 'stats:garbage', { answerCallback });

    await expect(h.feature.handleStatsCallback(ctx)).resolves.toBeUndefined();

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(h.reply).not.toHaveBeenCalled();

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// DEAD-BUTTON REGRESSION — every emitted prefix is a registered callback action
// ---------------------------------------------------------------------------

/** Minimal fake transport capturing every registration the feature installs. */
function makeFakeTransport() {
  const commands: string[] = [];
  const callbacks: string[] = [];
  return {
    commands,
    callbacks,
    registerBotCommand: (c: string) => {
      commands.push(c);
    },
    registerBotCallback: (p: string) => {
      callbacks.push(p);
    },
  };
}

describe('DEAD-BUTTON REGRESSION: install() registers every emitted callback prefix', () => {
  it('registers callbacks for sub, unsub, lang, report, stats, stop, emergency', async () => {
    const h = makeHarness();
    const fake = makeFakeTransport();

    h.feature.install(fake as unknown as BotCommandTransport);

    // Every prefix the dashboard /start + the toggle/picker/confirm keyboards
    // emit must be registered. A missing one = a dead button (B3). The full set
    // now also covers the new link/unlink/request button flows.
    for (const p of ['sub', 'unsub', 'lang', 'report', 'stats', 'stop', 'emergency', 'notif', 'start', 'link', 'unlink', 'request']) {
      expect(fake.callbacks, `callback prefix "${p}" must be registered`).toContain(p);
    }

    cleanHarness(h);
  });

  it('dashboard callback_data (report:show / stats:show etc.) all match a registered prefix', async () => {
    const h = makeHarness();
    const fake = makeFakeTransport();
    h.feature.install(fake as unknown as BotCommandTransport);

    // Operator (from.id 1000): the dashboard includes the Stats/Stop row, which
    // is hidden for non-operators (handleStart gates on isAdminOrController).
    h.store.setAdmin(1000, 'tester');
    await h.feature.handleStart(h.cbCtx());
    const dashboardData = replyCallbackData(h.reply);

    // The exact dashboard buttons exist (post-fix: ONE Manage notifications
    // button replaces the old Sub/Unsub pair; Stop/Emergency emit ask, not
    // confirm — the two-step flow).
    expect(dashboardData).toContain('report:show');
    expect(dashboardData).toContain('stats:show');
    expect(dashboardData).toContain('notif:menu');
    expect(dashboardData).not.toContain('sub:menu');
    expect(dashboardData).not.toContain('unsub:menu');
    expect(dashboardData).toContain('lang:menu');
    expect(dashboardData).toContain('stop:ask');
    expect(dashboardData).toContain('emergency:ask');
    // Operator-only row also exposes the group link/unlink ask buttons.
    expect(dashboardData).toContain('link:ask');
    expect(dashboardData).toContain('unlink:ask');
    // Operators see no self-service request row (that row is non-operator only).
    expect(dashboardData).not.toContain('request:go');

    // Every emitted dashboard button matches a registered prefix:
    for (const data of dashboardData) {
      const prefix = data.split(':')[0]!;
      expect(fake.callbacks, `callback_data "${data}" must have registered prefix "${prefix}"`).toContain(prefix);
    }

    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// SSOT REGISTRY VALIDATION — install() fails fast on a missing backing action
// ---------------------------------------------------------------------------

interface BotActionLike {
  name: string;
  command?: string;
  callbackPrefix?: string;
}

describe('VALIDATION: install() throws when a registry action has no backing callback', () => {
  it('removing the "stats" action makes install() throw (fail-fast, not a dead button)', async () => {
    const h = makeHarness();
    const fake = makeFakeTransport();

    // Simulate a registry that drifts: drop the 'stats' action.
    const actions = (h.feature as unknown as { actions: BotActionLike[] }).actions;
    const filtered = actions.filter((a) => a.name !== 'stats');
    (h.feature as unknown as { actions: BotActionLike[] }).actions = filtered;

    // install() must throw because 'stats' is still emitted by keyboards but
    // has no backing action.
    expect(() => h.feature.install(fake as unknown as BotCommandTransport)).toThrow(/stats/);

    cleanHarness(h);
  });

  it('the existing referenced-prefix list all resolve (control: install() does NOT throw)', async () => {
    const h = makeHarness();
    const fake = makeFakeTransport();

    // With the full registry, all referenced prefixes have a backing action → no throw.
    expect(() => h.feature.install(fake as unknown as BotCommandTransport)).not.toThrow();

    cleanHarness(h);
  });
});