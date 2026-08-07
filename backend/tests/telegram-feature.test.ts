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
import type { StatsService } from '../src/services/StatsService.js';
import type { SessionSummary } from '../src/services/StatsService.js';

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

function makeHarness(opts: { stats?: Partial<StatsService> | null; engine?: unknown } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats:
      opts.stats !== undefined
        ? opts.stats
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
          } as Partial<StatsService> as StatsService),
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
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
  it('denies non-controller, non-admin with permDeniedControl', async () => {
    const h = makeHarness();
    await h.feature.handleStats(h.ctx({ from: { id: 500, username: 'nobody' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized operator'));
    cleanHarness(h);
  });

  it('allows the admin through the gate', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ symbol: 'X' }] }, positions: [], emergencyStop: vi.fn(), stop: vi.fn() } });
    h.store.setAdmin(1, 'admin');
    await h.feature.handleStats(h.ctx({ from: { id: 1, username: 'admin' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Engine state'));
    cleanHarness(h);
  });

  it('allows an approved controller through the gate', async () => {
    const h = makeHarness({ engine: { state: 'Stopped', config: {}, positions: [], stop: vi.fn(), emergencyStop: vi.fn() } });
    h.store.addController(777, 'oper', 1);
    await h.feature.handleStats(h.ctx({ from: { id: 777, username: 'oper' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Engine state'));
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

describe('TelegramBotFeature report (dashboard button report:show)', () => {
  it('explains when no stats service is attached', async () => {
    const h = makeHarness({ stats: null });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    cleanHarness(h);
  });

  it('reports empty summary when there are no trades', async () => {
    const h = makeHarness({
      stats: ({ getSessionSummary: vi.fn(() => ({ totalTrades: 0, recent: [] })) } as Partial<StatsService> as StatsService),
    });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('No trades'));
    cleanHarness(h);
  });

  it('renders a report with trade rows', async () => {
    const h = makeHarness({
      stats: ({
        getSessionSummary: vi.fn(() => ({
          totalTrades: 2,
          winRate: 50,
          netPnl: 10,
          totalFees: 0,
          profitFactor: 1,
          bestTrade: 10,
          worstTrade: -5,
          maxDrawdown: 5,
          recent: [
            { symbol: 'BTCUSDC', side: 'buy', realizedPnl: 10.5 },
            { symbol: 'ETHUSDC', side: 'sell', realizedPnl: -2 },
          ],
        } as unknown as SessionSummary)),
      } as Partial<StatsService> as StatsService),
    });
    await h.feature.handleReportCallback(h.cb('report', 'report:show'));
    const replyText = (h.reply.mock.calls[0]![0] as string);
    expect(replyText).toContain('BTCUSDC');
    expect(replyText).toContain('ETHUSDC');
    expect(replyText).toContain('10.50');
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

  it('A: /start hides the Stats/Stop row from a non-operator', async () => {
    const h = makeHarness();
    // Known non-controller, non-admin user.
    await h.feature.handleStart(h.ctx({ from: { id: 500, username: 'nobody' } }));
    const buttons = dashboardButtons(h.reply);
    expect(buttons.some((b) => b.callback_data.startsWith('stop:'))).toBe(false);
    expect(buttons.some((b) => b.callback_data === 'stats:show')).toBe(false);
    expect(buttons.some((b) => b.callback_data === 'notif:menu')).toBe(true);
    cleanHarness(h);
  });

  it('B: /start shows the Stats/Stop row for the admin/controller', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    await h.feature.handleStart(h.ctx({ from: { id: 1, username: 'boss' } }));
    const buttons = dashboardButtons(h.reply);
    // The dashboard Stop emits stop:ask (two-step confirm), not stop:confirm.
    expect(buttons.some((b) => b.callback_data === 'stop:ask')).toBe(true);
    expect(buttons.some((b) => b.callback_data === 'emergency:ask')).toBe(true);
    expect(buttons.some((b) => b.callback_data === 'stats:show')).toBe(true);
    cleanHarness(h);
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

describe('TelegramBotFeature link/unlink (button-only, operator-gated)', () => {
  it('link:ask presents the confirmation; link:confirm links a group for an operator', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLinkCallback(h.cb('link', 'link:ask', { from: { id: 1, username: 'boss' }, editMessage }));
    expect(editMessage).toHaveBeenCalledWith(
      expect.stringContaining('Link this group'),
      expect.objectContaining({ reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }),
    );
    await h.feature.handleLinkCallback(h.cb('link', 'link:confirm', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(h.store.isLinked(7000)).toBe(true);
    cleanHarness(h);
  });

  it('link:confirm is refused in a private chat', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLinkCallback(h.cb('link', 'link:confirm', {
      chat: { id: 1000, type: 'private' },
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('group chat'), expect.anything());
    expect(h.store.isLinked(1000)).toBe(false);
    cleanHarness(h);
  });

  it('link:ask is denied to a non-operator', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLinkCallback(h.cb('link', 'link:ask', {
      from: { id: 500, username: 'nobody' },
      answerCallback,
      editMessage,
    }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized'));
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('link:cancel leaves the group unchanged', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    h.store.addChat(7000, 'group');
    h.store.linkChat(7000, 1);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLinkCallback(h.cb('link', 'link:cancel', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('cancelled'), expect.anything());
    expect(h.store.isLinked(7000)).toBe(true);
    cleanHarness(h);
  });

  it('unlink:ask → unlink:confirm unlinks a group', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    h.store.addChat(7000, 'group');
    h.store.linkChat(7000, 1);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleUnlinkCallback(h.cb('unlink', 'unlink:ask', { from: { id: 1, username: 'boss' }, editMessage }));
    await h.feature.handleUnlinkCallback(h.cb('unlink', 'unlink:confirm', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(h.store.isLinked(7000)).toBe(false);
    cleanHarness(h);
  });

  it('unlink:confirm in a private chat is refused', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleUnlinkCallback(h.cb('unlink', 'unlink:confirm', {
      chat: { id: 1000, type: 'private' },
      from: { id: 1, username: 'boss' },
      editMessage,
    }));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('group chat'), expect.anything());
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
    // /start is the ONLY registered command — every other control is
    // button-only (the 11 text commands were removed).
    expect(registered).toEqual(['start']);
    expect(registerBotCommand).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('registers every emitted inline-button callback prefix (no dead buttons)', async () => {
    const h = makeHarness();
    const registerBotCallback = vi.fn();
    h.feature.install({ registerBotCommand: vi.fn(), registerBotCallback });
    const prefixes = registerBotCallback.mock.calls.map((c) => c[0]);
    for (const p of ['sub', 'unsub', 'lang', 'report', 'stats', 'stop', 'emergency', 'notif', 'start', 'link', 'unlink', 'request']) {
      expect(prefixes).toContain(p);
    }
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
    expect(registerBotCommand).toHaveBeenCalledTimes(1);
    expect(registerBotCommand).toHaveBeenCalledWith('start', expect.any(Function));
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