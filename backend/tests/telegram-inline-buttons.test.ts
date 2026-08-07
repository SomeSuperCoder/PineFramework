/**
 * Tests for TelegramBotFeature inline button callback handlers:
 *   handleLangCallback, handleSubscribeCallback, handleUnsubscribeCallback,
 *   handleEmergencyCallback, handleStart (dashboard).
 *
 * Uses a real TelegramConfigStore on a tmpdir and fabricated CallbackContext
 * objects (transport-agnostic, same pattern as telegram-feature.test.ts).
 *
 * IMPORTANT (post-fix): `action` and `params` are DERIVED from the `data`
 * callback_data via the REAL transport regex (`^{prefix}(?::(.+))?$`), exactly
 * like TelegramService.attachCallback — tests never fabricate `params`
 * independently of `data`, so the multi-segment-params class of bug cannot be
 * re-hidden (see telegram-button-params.test.ts).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramBotFeature, type CallbackContext } from '../src/telegram/TelegramBotFeature.js';

type Reply = ReturnType<typeof vi.fn>;

/**
 * Replica of the REAL transport parse: `new RegExp('^' + prefix + '(?::(.+))?$')`
 * + `params = match?.[1] ?? ''` (TelegramService.attachCallback).
 */
function transportParse(actionPrefix: string, data: string): { action: string; params: string } {
  const re = new RegExp(`^${actionPrefix}(?::(.+))?$`);
  const match = data.match(re);
  return { action: actionPrefix, params: match?.[1] ?? '' };
}

/**
 * The extras object the feature passes as the 2nd arg of `ctx.editMessage(...)`.
 * Contract (post-fix): EVERY in-place edit carries `reply_markup.inline_keyboard`
 * so Telegram does not remove the inline buttons when the message is edited.
 */
interface EditExtras {
  reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
}

/** The extras of the first `editMessage` call captured by the mock. */
function editExtras(editMessage: Reply): EditExtras {
  const extras = editMessage.mock.calls[0]?.[1] as EditExtras | undefined;
  expect(extras, 'editMessage must be called with an extras (2nd) argument').toBeDefined();
  return extras!;
}

/**
 * CORE REGRESSION ASSERTION: an in-place edit MUST carry a non-empty inline
 * keyboard. Returns the extras so callers can inspect the buttons further.
 */
function assertEditKeepsKeyboard(editMessage: Reply): EditExtras {
  const extras = editExtras(editMessage);
  expect(extras.reply_markup, 'edit extras must carry reply_markup').toBeDefined();
  const kb = extras.reply_markup.inline_keyboard;
  expect(kb, 'reply_markup must carry inline_keyboard').toBeDefined();
  expect(kb.length, 'inline_keyboard must not be empty').toBeGreaterThan(0);
  const buttons = kb.flat();
  expect(buttons.length, 'inline_keyboard must contain buttons').toBeGreaterThan(0);
  for (const b of buttons) {
    expect(typeof b.text).toBe('string');
    expect(typeof b.callback_data).toBe('string');
  }
  return extras;
}

/** callback_data values on the keyboard of the first `editMessage` call. */
function editCallbackData(editMessage: Reply): string[] {
  return assertEditKeepsKeyboard(editMessage).reply_markup.inline_keyboard.flat().map(
    (b) => b.callback_data,
  );
}

function tmpFile(): string {
  return path.join(os.tmpdir(), `cb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  cbCtx: (overrides?: Partial<CallbackContext>) => CallbackContext;
  /** Build a callback context derived from emitted callback_data (real transport). */
  cb: (prefix: string, data: string, overrides?: Partial<CallbackContext>) => CallbackContext;
}

function makeHarness(opts: { engine?: unknown } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats: null,
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
  });

  /**
   * Build a callback context the way the REAL transport delivers it: derive
   * `action` and `params` from the emitted `data` via transportParse instead of
   * fabricating either. `prefix` is the registered action prefix (e.g. 'lang',
   * 'sub', 'stop'); `data` is the raw callback_data the keyboard emits.
   */
  const cb = (prefix: string, data: string, overrides: Partial<CallbackContext> = {}): CallbackContext => {
    const { action, params } = transportParse(prefix, data);
    return cbCtx({ data, action, params, ...overrides });
  };

  const cbCtx = (overrides: Partial<CallbackContext> = {}): CallbackContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
    callbackQueryId: overrides.callbackQueryId ?? 'cb-test-001',
    data: overrides.data ?? 'lang:en',
    action: overrides.action ?? 'lang',
    params: overrides.params ?? 'en',
    answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
    editMessage: overrides.editMessage ?? vi.fn().mockResolvedValue(undefined),
  });

  (feature as unknown as { __tk: string }).__tk = filePath;
  return { store, feature, reply, cbCtx, cb };
}

function cleanHarness(h: Harness): void {
  const tk = (h.feature as unknown as { __tk?: string }).__tk;
  if (tk) { try { fs.unlinkSync(tk); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------------------
// handleLangCallback
// ---------------------------------------------------------------------------

describe('handleLangCallback', () => {
  it('sets a valid language and edits the message', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleLangCallback(h.cb('lang', 'lang:es', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(h.store.getChatLanguage(1000)).toBe('es');
    cleanHarness(h);
  });

  it('rejects an invalid language with langInvalid toast', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleLangCallback(h.cb('lang', 'lang:de', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
    expect(editMessage).not.toHaveBeenCalled();
    expect(h.store.getChatLanguage(1000)).toBe('en'); // unchanged
    cleanHarness(h);
  });

  it('handles "menu" action — shows the language picker keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleLangCallback(h.cb('lang', 'lang:menu', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    // Regression: the in-place edit MUST carry the language picker keyboard,
    // otherwise Telegram removes the inline buttons when the message is edited.
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData).toContain('lang:en');
    expect(allCallbackData).toContain('lang:es');
    expect(allCallbackData).toContain('lang:ru');
    cleanHarness(h);
  });

  it('set:<lang>: keeps the language picker keyboard on the edited message (regression)', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleLangCallback(h.cb('lang', 'lang:es', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData).toContain('lang:en');
    expect(allCallbackData).toContain('lang:es');
    expect(allCallbackData).toContain('lang:ru');
    cleanHarness(h);
  });

  it('answers with langInvalid when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without an `id` property → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleLangCallback(h.cb('lang', 'lang:en', {
      chat: { type: 'private' } as never,
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('sets language for a group chat using chatId (not fromId)', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleLangCallback(h.cb('lang', 'lang:ru', {
      chat: { id: 7000, type: 'group' },
      answerCallback,
      editMessage,
    }));

    expect(h.store.getChatLanguage(7000)).toBe('ru');
    expect(answerCallback).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// handleSubscribeCallback
// ---------------------------------------------------------------------------

describe('handleSubscribeCallback', () => {
  it('toggles subscription ON when type is not currently subscribed', async () => {
    const h = makeHarness();
    // Group chat starts with no subscriptions for a member
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(h.store.getMemberSubscription(7000, 1200)).toContain('trading');
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('toggles subscription OFF when type is currently subscribed', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('ignores an invalid notification type', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:bogus', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('handles "menu" action — shows the toggle keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:menu', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    // Regression: the in-place edit MUST carry the toggle keyboard (flat `sub:`).
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData.some((d: string) => d.startsWith('sub:'))).toBe(true);
    cleanHarness(h);
  });

  it('toggle ON: keeps the subscribe toggle keyboard on the edited message (regression)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(editMessage).toHaveBeenCalledTimes(1);
    const kb = assertEditKeepsKeyboard(editMessage).reply_markup.inline_keyboard.flat();
    expect(kb.some((b) => b.callback_data.startsWith('sub:'))).toBe(true);
    // The just-subscribed type is reflected with ✅ on the surviving keyboard.
    expect(kb.find((b) => b.callback_data === 'sub:trading')?.text).toContain('✅');
    cleanHarness(h);
  });

  it('toggle OFF: keeps the subscribe toggle keyboard with the unsubscribed state', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(editMessage).toHaveBeenCalledTimes(1);
    const kb = assertEditKeepsKeyboard(editMessage).reply_markup.inline_keyboard.flat();
    expect(kb.find((b) => b.callback_data === 'sub:trading')?.text).toContain('⬜');
    cleanHarness(h);
  });

  it('answers and returns early when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without `id` → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      chat: { type: 'private' } as never,
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('answers and returns early when fromId is undefined', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // from without `id` → ctx.from?.id is undefined → fromId === undefined guard
    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:trading', {
      from: { username: 'tester' } as never,
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('uses fromId as memberId in group chats', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:error', {
      chat: { id: 7000, type: 'group' },
      from: { id: 55, username: 'alice' },
      answerCallback,
      editMessage,
    }));

    // Subscribed under the member's fromId (55), not the chatId (7000)
    expect(h.store.getMemberSubscription(7000, 55)).toContain('error');
    cleanHarness(h);
  });

  it('uses chatId as memberId in private chats', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleSubscribeCallback(h.cb('sub', 'sub:daily', {
      chat: { id: 9000, type: 'private' },
      from: { id: 55, username: 'alice' },
      answerCallback,
      editMessage,
    }));

    // Private chat: memberId = chatId (9000), not fromId (55)
    expect(h.store.getMemberSubscription(9000, 9000)).toContain('daily');
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// handleUnsubscribeCallback
// ---------------------------------------------------------------------------

describe('handleUnsubscribeCallback', () => {
  it('toggles subscription OFF when type is currently subscribed', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('toggles subscription ON when type is not currently subscribed', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(h.store.getMemberSubscription(7000, 1200)).toContain('trading');
    expect(answerCallback).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('ignores an invalid notification type', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:bogus', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('handles "menu" action — shows the unsubscribe toggle keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:menu', {
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    // Regression: the in-place edit MUST carry the toggle keyboard (flat `unsub:`).
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData.some((d: string) => d.startsWith('unsub:'))).toBe(true);
    cleanHarness(h);
  });

  it('toggle OFF: keeps the unsubscribe toggle keyboard on the edited message (regression)', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(editMessage).toHaveBeenCalledTimes(1);
    const kb = assertEditKeepsKeyboard(editMessage).reply_markup.inline_keyboard.flat();
    expect(kb.some((b) => b.callback_data.startsWith('unsub:'))).toBe(true);
    // The just-unsubscribed type is reflected with ⬜ on the surviving keyboard.
    expect(kb.find((b) => b.callback_data === 'unsub:trading')?.text).toContain('⬜');
    cleanHarness(h);
  });

  it('toggle ON: keeps the unsubscribe toggle keyboard with the subscribed state', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      answerCallback,
      editMessage,
    }));

    expect(editMessage).toHaveBeenCalledTimes(1);
    const kb = assertEditKeepsKeyboard(editMessage).reply_markup.inline_keyboard.flat();
    expect(kb.find((b) => b.callback_data === 'unsub:trading')?.text).toContain('✅');
    cleanHarness(h);
  });

  it('answers and returns early when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without `id` → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      chat: { type: 'private' } as never,
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('answers and returns early when fromId is undefined', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // from without `id` → ctx.from?.id is undefined → fromId === undefined guard
    await h.feature.handleUnsubscribeCallback(h.cb('unsub', 'unsub:trading', {
      from: { username: 'tester' } as never,
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).not.toHaveBeenCalled();
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// handleEmergencyCallback
// ---------------------------------------------------------------------------

describe('handleEmergencyCallback', () => {
  it('confirm: calls engine.emergencyStop() and edits message', async () => {
    const emergencyStop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('confirm: handles engine.emergencyStop() throwing gracefully', async () => {
    const emergencyStop = vi.fn().mockRejectedValue(new Error('boom'));
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    // Should still answer and edit even on failure
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('confirm: keeps the emergency-confirm keyboard on the edited message (regression)', async () => {
    const emergencyStop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData).toContain('emergency:confirm');
    expect(allCallbackData).toContain('emergency:cancel');
    cleanHarness(h);
  });

  it('confirm (emergencyStop throws): keeps the emergency-confirm keyboard', async () => {
    const emergencyStop = vi.fn().mockRejectedValue(new Error('boom'));
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });

  it('confirm: shows engine-not-initialized when engine is null', async () => {
    const h = makeHarness(); // no engine
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    // Regression: the no-engine edit still re-attaches the emergency keyboard.
    expect(editMessage).toHaveBeenCalledWith(
      expect.stringContaining('not initialized'),
      expect.objectContaining({ reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }),
    );
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });

  it('cancel: does not call engine and edits with cancellation message', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:cancel', {
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(1);
    // Regression: the cancel edit re-attaches the emergency keyboard.
    expect(editMessage).toHaveBeenCalledWith(
      '↩️ Emergency cancelled.',
      expect.objectContaining({ reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }),
    );
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// handleStart — dashboard with inline buttons
// ---------------------------------------------------------------------------

describe('handleStart', () => {
  it('sends the welcome message with inline keyboard buttons', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.cbCtx());

    expect(h.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = h.reply.mock.calls[0]!;
    expect(text).toContain('Welcome');
    // Inline keyboard should be present
    const markup = extra as { reply_markup: { inline_keyboard: unknown[][] } };
    expect(markup.reply_markup.inline_keyboard).toBeDefined();
    const allCallbackData = markup.reply_markup.inline_keyboard.flat().map(
      (b: { callback_data: string }) => b.callback_data,
    );
    expect(allCallbackData).toContain('sub:menu');
    expect(allCallbackData).toContain('unsub:menu');
    expect(allCallbackData).toContain('lang:menu');
    expect(allCallbackData).toContain('report:show');
    expect(allCallbackData).toContain('stats:show');
    expect(allCallbackData).toContain('stop:confirm');
    cleanHarness(h);
  });

  it('registers the chat as private when chat type is private', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.cbCtx({
      chat: { id: 8000, type: 'private' },
    }));

    const chat = h.store.getChat(8000);
    expect(chat).not.toBeNull();
    expect(chat!.type).toBe('private');
    cleanHarness(h);
  });

  it('registers the chat as group when chat type is group', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.cbCtx({
      chat: { id: 7500, type: 'group' },
    }));

    const chat = h.store.getChat(7500);
    expect(chat).not.toBeNull();
    expect(chat!.type).toBe('group');
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// handleStopCallback — every in-place edit must re-attach the stop keyboard
// ---------------------------------------------------------------------------

describe('handleStopCallback', () => {
  it('confirm (running): stops the engine and keeps the stop-confirm keyboard (regression)', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const allCallbackData = editCallbackData(editMessage);
    expect(allCallbackData).toContain('stop:confirm');
    expect(allCallbackData).toContain('stop:cancel');
    cleanHarness(h);
  });

  it('confirm (engine not running): keeps the stop-confirm keyboard', async () => {
    const h = makeHarness({ engine: { state: 'Stopped', config: {}, positions: [], emergencyStop: vi.fn(), stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });

  it('confirm (engine.stop throws): keeps the stop-confirm keyboard', async () => {
    const stop = vi.fn().mockRejectedValue(new Error('boom'));
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', {
      
      answerCallback,
      editMessage,
    }));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });

  it('cancel: keeps the stop-confirm keyboard', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleStopCallback(h.cb('stop', 'stop:cancel', {
      
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    assertEditKeepsKeyboard(editMessage);
    cleanHarness(h);
  });
});

// ---------------------------------------------------------------------------
// Regression core: the keyboard on EVERY in-place edit equals the keyboard the
// send path presented — same buttons, same callback_data. This is the Director's
// bug: inline keyboards vanished on button tap because terminal handlers edited
// the message WITHOUT re-attaching the keyboard the send path had used.
// ---------------------------------------------------------------------------

describe('inline keyboard survives in-place edits — send ⇄ edit equality', () => {
  function sendKeyboard(reply: Reply): EditExtras['reply_markup'] {
    const extra = reply.mock.calls[0]?.[1] as EditExtras | undefined;
    expect(extra, 'send path must pass extras').toBeDefined();
    expect(extra!.reply_markup, 'send extras must carry reply_markup').toBeDefined();
    return extra!.reply_markup;
  }

  it('lang set: the edited message carries the same keyboard /lang presented', async () => {
    const h = makeHarness();
    await h.feature.handleLang(h.cbCtx());
    const sent = sendKeyboard(h.reply);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleLangCallback(h.cb('lang', 'lang:es', { editMessage }));

    expect(assertEditKeepsKeyboard(editMessage).reply_markup).toEqual(sent);
    cleanHarness(h);
  });

  it('stop confirm: the edited message carries the same keyboard /stop presented', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) } });
    h.store.setAdmin(1000, 'tester');
    await h.feature.handleStop(h.cbCtx());
    const sent = sendKeyboard(h.reply);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleStopCallback(h.cb('stop', 'stop:confirm', { editMessage }));

    expect(assertEditKeepsKeyboard(editMessage).reply_markup).toEqual(sent);
    cleanHarness(h);
  });

  it('emergency confirm: the edited message carries the same keyboard /emergency presented', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop: vi.fn().mockResolvedValue(undefined), stop: vi.fn() } });
    h.store.setAdmin(1000, 'tester');
    await h.feature.handleEmergency(h.cbCtx());
    const sent = sendKeyboard(h.reply);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleEmergencyCallback(h.cb('emergency', 'emergency:confirm', { editMessage }));

    expect(assertEditKeepsKeyboard(editMessage).reply_markup).toEqual(sent);
    cleanHarness(h);
  });
});
