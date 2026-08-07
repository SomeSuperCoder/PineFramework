/**
 * BUG-REPRO suite — telegram notification management (Bug Hunter wave).
 *
 * Proves the root causes of 6 user-reported bugs:
 *   1. No ability to toggle specific notification types from within the bot
 *   2. No back buttons in the inline button submenus
 *   3. Even after unsubscribing to notifications I'm shown a green checkbox
 *      next to each category
 *   4. The bot doesn't actually send trade notifications to subscribed users
 *   5. No different buttons for emergency and regular stop in the bot
 *   6. When doing /stop - a confirmation is requested, while when clicking an
 *      inline button - no!
 *
 * Every `it(...)` that names a bug asserts the CORRECT behavior and FAILS
 * (RED) against the current source. Tests named `control:` assert the seam
 * still works and PASS, isolating exactly which link is broken.
 *
 * Core hypothesis verified here: TelegramConfigStore.getMemberSubscription
 * (L346-352) defaults UNSET private-chat members to ALL types ON, and
 * memberUnsubscribe (L326-340) DELETES the key when nothing remains — so a
 * fully-unsubscribed member is indistinguishable from a never-subscribed one.
 * memberUnsubscribe (L331-332) also no-ops on an unset key, so the first
 * toggle-off click in a fresh private chat changes nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore, NOTIFICATION_TYPES } from '../../src/store/TelegramConfigStore.js';
import {
  TelegramBotFeature,
  type CallbackContext,
  type FeatureCommandContext,
} from '../../src/telegram/TelegramBotFeature.js';

type Reply = ReturnType<typeof vi.fn>;
type Edit = ReturnType<typeof vi.fn>;

function tmpFile(): string {
  return path.join(os.tmpdir(), `bugrepro-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** Replica of the REAL transport parse (TelegramService.attachCallback). */
function transportParse(actionPrefix: string, data: string): { action: string; params: string } {
  const re = new RegExp(`^${actionPrefix}(?::(.+))?$`);
  const match = data.match(re);
  return { action: actionPrefix, params: match?.[1] ?? '' };
}

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  edit: Edit;
  filePath: string;
  ctx: (overrides?: Partial<FeatureCommandContext>) => FeatureCommandContext;
  /** Callback context derived from callback_data via the REAL transport parse. */
  cb: (prefix: string, data: string, overrides?: Partial<CallbackContext>) => CallbackContext;
  /** Flatten the inline_keyboard of the LAST reply extra into callback_data strings. */
  repliedCallbacks: () => string[];
  /** Flatten the inline_keyboard of the LAST editMessage extra into callback_data strings. */
  editedCallbacks: () => string[];
}

function makeHarness(opts: { engine?: unknown } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const edit = vi.fn().mockResolvedValue(undefined);
  const feature = new TelegramBotFeature({
    store,
    stats: null,
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
  });

  const ctx = (overrides: Partial<FeatureCommandContext> = {}): FeatureCommandContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
  });

  const cb = (
    prefix: string,
    data: string,
    overrides: Partial<CallbackContext> = {},
  ): CallbackContext => {
    const { action, params } = transportParse(prefix, data);
    return {
      from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
      chat: overrides.chat ?? { id: 1000, type: 'private' },
      message: overrides.message ?? { text: '' },
      reply: overrides.reply ?? reply,
      callbackQueryId: overrides.callbackQueryId ?? 'cb-bugrepro',
      data: overrides.data ?? data,
      action: overrides.action ?? action,
      params: overrides.params ?? params,
      answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
      editMessage: overrides.editMessage ?? edit,
    };
  };

  const repliedCallbacks = (): string[] => {
    const last = reply.mock.calls[reply.mock.calls.length - 1]?.[1] as
      | { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } }
      | undefined;
    return (last?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);
  };

  const editedCallbacks = (): string[] => {
    const last = edit.mock.calls[edit.mock.calls.length - 1]?.[1] as
      | { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } }
      | undefined;
    return (last?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);
  };

  return { store, feature, reply, edit, filePath, ctx, cb, repliedCallbacks, editedCallbacks };
}

function cleanHarness(h: Harness): void {
  try { fs.unlinkSync(h.filePath); } catch { /* ignore */ }
}

describe('BUG 1 — toggling a specific notification type off in a private chat', () => {
  let h: Harness;
  beforeEach(() => { h = makeHarness(); });
  afterEach(() => cleanHarness(h));

  it('clicking a subscribed category (✅) must turn it OFF for a fresh private chat', async () => {
    // Fresh private chat: default effective subscription = ALL types (all ✅).
    // User clicks "sub:trading" to toggle trading OFF.
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading'));

    const effective = h.store.getMemberSubscription(1000, 1000);
    // CORRECT: trading was toggled off.
    expect(effective).not.toContain('trading');
  });
});

describe('BUG 3 — full unsubscribe must not resurrect green checkboxes', () => {
  let h: Harness;
  beforeEach(() => { h = makeHarness(); });
  afterEach(() => cleanHarness(h));

  it('after unsubscribing from EVERY category, effective subscription must be empty', async () => {
    // Give the private chat an explicit key first (mirrors any earlier /subscribe
    // interaction), then toggle OFF every category one click at a time.
    h.store.memberSubscribe(1000, 1000, [...NOTIFICATION_TYPES]);
    for (const type of NOTIFICATION_TYPES) {
      await h.feature.handleSubscribeCallback(h.cb('sub', `sub:${type}`));
    }
    const effective = h.store.getMemberSubscription(1000, 1000);
    // CORRECT: nothing left to send → empty list, and the last keyboard must
    // show ZERO ✅ buttons.
    expect(effective).toEqual([]);
    expect(h.editedCallbacks().filter((d) => d.startsWith('sub:'))).toHaveLength(
      NOTIFICATION_TYPES.length,
    );
    const lastKeyboard = (
      h.edit.mock.calls[h.edit.mock.calls.length - 1]?.[1] as {
        reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> };
      }
    )?.reply_markup?.inline_keyboard?.flat().map((b) => b.text) ?? [];
    expect(lastKeyboard.filter((t) => t.startsWith('✅'))).toEqual([]);
  });
});

describe('BUG 4a — deliver must NOT reach a fully-unsubscribed private member', () => {
  let h: Harness;
  let onMessage: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    h = makeHarness();
  });
  afterEach(() => cleanHarness(h));

  it('control: deliver DOES reach a subscribed private chat', async () => {
    const filePath = tmpFile();
    const store = new TelegramConfigStore(filePath);
    onMessage = vi.fn().mockResolvedValue(true);
    const feature = new TelegramBotFeature({ store, stats: null, getEngine: () => null, onMessage });
    store.addChat(9000, 'private');
    store.memberSubscribe(9000, 9000, ['trading']);
    const n = await feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledWith(9000, 'msg[en]');
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('deliver must NOT reach a member who unsubscribed from the type', async () => {
    const filePath = tmpFile();
    const store = new TelegramConfigStore(filePath);
    onMessage = vi.fn().mockResolvedValue(true);
    const feature = new TelegramBotFeature({ store, stats: null, getEngine: () => null, onMessage });
    store.addChat(9000, 'private');
    store.memberSubscribe(9000, 9000, ['trading']);
    // User unsubscribes from trading (the only type they were subscribed to).
    store.memberUnsubscribe(9000, 9000, ['trading']);
    // CORRECT: no longer subscribed → no delivery.
    const n = await feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });
});

describe('BUG 4b — production engine must invoke position-open/close notifications', () => {
  it('control: TradingTelegramBot routes position notifications via deliver when called', async () => {
    const { TradingTelegramBot } = await import('pine-framework/trading/telegram-bot');
    const deliver = vi.fn().mockResolvedValue(undefined);
    const bot = new TradingTelegramBot(
      { sendMessage: async () => true, getSubscribers: () => [] },
      { includeTxLinks: true, routing: { deliver } },
    );
    await bot.notifyPositionOpened({
      kind: 'position_open',
      symbol: 'X',
      side: 'buy',
      size: 1,
      entryPrice: 1,
      dex: 'x',
    } as never);
    expect(deliver).toHaveBeenCalledWith('position_open', expect.anything(), undefined);
  });

  // NOTE: the previous source-regex assertion ("bot-engine.ts must call
  // notifyPositionOpened / notifyPositionClosed (currently never)") was REMOVED
  // as stale — the regex matched the long-existing natural-close chaos path
  // (bot-engine.ts:1465-1473), and the force-close gap it tracked is now
  // asserted behaviorally by the canonical repro
  // backend/tests/bug-repro/force-close-notification.test.ts (BUG 7). A
  // source-regex test added no behavioral value over those two suites.
});

describe('BUG 2 — inline submenus must have a back button', () => {
  let h: Harness;
  beforeEach(() => { h = makeHarness(); });
  afterEach(() => cleanHarness(h));

  it('sub:menu keyboard must include a way back to the main menu', async () => {
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:menu'));
    const callbacks = h.editedCallbacks();
    // CORRECT: a navigation/back button leads the user home without re-typing /start.
    expect(callbacks.some((d) => d === 'start:menu' || d === 'start' || d.startsWith('back:'))).toBe(true);
  });

  it('lang:menu keyboard must include a way back to the main menu', async () => {
    await h.feature.handleLangCallback(h.cb('lang', 'lang:menu'));
    const callbacks = h.editedCallbacks();
    expect(callbacks.some((d) => d === 'start:menu' || d === 'start' || d.startsWith('back:'))).toBe(true);
  });
});

describe('BUG 5 — operator dashboard must distinguish emergency and regular stop', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
    h.store.setAdmin(1, 'admin');
  });
  afterEach(() => cleanHarness(h));

  it('operator /start dashboard must include Stop (ask) and Emergency buttons', async () => {
    await h.feature.handleStart(h.ctx({ from: { id: 1, username: 'admin' } }));
    const callbacks = h.repliedCallbacks();
    // CORRECT (post-fix): the dashboard Stop asks for confirmation first
    // (stop:ask, bug 6) and a distinct Emergency button exists (emergency:ask,
    // bug 5) — both are two-step, neither acts on the first click.
    expect(callbacks).toContain('stop:ask');
    expect(callbacks).toContain('emergency:ask');
  });
});

describe('BUG 6 — inline Stop must ask for confirmation like /stop does', () => {
  let h: Harness;
  let stop: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    stop = vi.fn().mockResolvedValue(undefined);
    h = makeHarness({ engine: { state: 'Running', stop, emergencyStop: vi.fn(), positions: [], config: { pairs: [] } } });
    h.store.setAdmin(1, 'admin');
  });
  afterEach(() => cleanHarness(h));

  it('control: /stop asks for confirmation and does NOT stop yet', async () => {
    await h.feature.handleStop(h.ctx({ from: { id: 1, username: 'admin' } }));
    expect(h.repliedCallbacks()).toContain('stop:confirm');
    expect(stop).not.toHaveBeenCalled();
  });

  it('dashboard stop:ask click must request confirmation BEFORE stopping', async () => {
    await h.feature.handleStopCallback(h.cb('stop', 'stop:ask', { from: { id: 1, username: 'admin' } }));
    // CORRECT (post-fix): the dashboard Stop emits stop:ask, which presents the
    // STOP_CONFIRM_KEYBOARD and does NOT stop the engine — the same two-step
    // semantics as /stop (bug 6). The confirmation buttons are on the edit.
    expect(h.editedCallbacks()).toContain('stop:confirm');
    expect(h.editedCallbacks()).toContain('stop:cancel');
    expect(stop).not.toHaveBeenCalled();
  });

  it('dashboard stop:ask → stop:confirm stops the engine (operator)', async () => {
    await h.feature.handleStopCallback(h.cb('stop', 'stop:ask', { from: { id: 1, username: 'admin' } }));
    expect(stop).not.toHaveBeenCalled();
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', { from: { id: 1, username: 'admin' } }));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
