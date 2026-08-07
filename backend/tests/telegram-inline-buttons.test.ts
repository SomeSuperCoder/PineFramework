/**
 * Tests for TelegramBotFeature inline button callback handlers:
 *   handleLangCallback, handleSubscribeCallback, handleUnsubscribeCallback,
 *   handleEmergencyCallback, handleStart (dashboard).
 *
 * Uses a real TelegramConfigStore on a tmpdir and fabricated CallbackContext
 * objects (transport-agnostic, same pattern as telegram-feature.test.ts).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramBotFeature, type CallbackContext } from '../src/telegram/TelegramBotFeature.js';

type Reply = ReturnType<typeof vi.fn>;

function tmpFile(): string {
  return path.join(os.tmpdir(), `cb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  cbCtx: (overrides?: Partial<CallbackContext>) => CallbackContext;
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

  const cbCtx = (overrides: Partial<CallbackContext> = {}): CallbackContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
    callbackQueryId: overrides.callbackQueryId ?? 'cb-test-001',
    data: overrides.data ?? 'lang:set:en',
    action: overrides.action ?? 'lang',
    params: overrides.params ?? 'en',
    answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
    editMessage: overrides.editMessage ?? vi.fn().mockResolvedValue(undefined),
  });

  (feature as unknown as { __tk: string }).__tk = filePath;
  return { store, feature, reply, cbCtx };
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

    await h.feature.handleLangCallback(h.cbCtx({
      params: 'es',
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

    await h.feature.handleLangCallback(h.cbCtx({
      params: 'de',
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

    await h.feature.handleLangCallback(h.cbCtx({
      params: 'menu',
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    // The keyboard should contain callback_data for each language
    const markup = editMessage.mock.calls[0]![1] as { reply_markup: { inline_keyboard: unknown[][] } };
    const allCallbackData = markup.reply_markup.inline_keyboard.flat().map(
      (b: { callback_data: string }) => b.callback_data,
    );
    expect(allCallbackData).toContain('lang:set:en');
    expect(allCallbackData).toContain('lang:set:es');
    expect(allCallbackData).toContain('lang:set:ru');
    cleanHarness(h);
  });

  it('answers with langInvalid when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without an `id` property → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleLangCallback(h.cbCtx({
      chat: { type: 'private' } as never,
      params: 'en',
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

    await h.feature.handleLangCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      params: 'ru',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      params: 'trading',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      params: 'trading',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      params: 'bogus',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      params: 'menu',
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const markup = editMessage.mock.calls[0]![1] as { reply_markup: { inline_keyboard: unknown[][] } };
    const allCallbackData = markup.reply_markup.inline_keyboard.flat().map(
      (b: { callback_data: string }) => b.callback_data,
    );
    expect(allCallbackData.some((d: string) => d.startsWith('sub:toggle:'))).toBe(true);
    cleanHarness(h);
  });

  it('answers and returns early when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without `id` → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleSubscribeCallback(h.cbCtx({
      chat: { type: 'private' } as never,
      params: 'trading',
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
    await h.feature.handleSubscribeCallback(h.cbCtx({
      from: { username: 'tester' } as never,
      params: 'trading',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      from: { id: 55, username: 'alice' },
      params: 'error',
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

    await h.feature.handleSubscribeCallback(h.cbCtx({
      chat: { id: 9000, type: 'private' },
      from: { id: 55, username: 'alice' },
      params: 'daily',
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

    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      params: 'trading',
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

    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      params: 'trading',
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

    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      params: 'bogus',
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

    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      params: 'menu',
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    const markup = editMessage.mock.calls[0]![1] as { reply_markup: { inline_keyboard: unknown[][] } };
    const allCallbackData = markup.reply_markup.inline_keyboard.flat().map(
      (b: { callback_data: string }) => b.callback_data,
    );
    expect(allCallbackData.some((d: string) => d.startsWith('unsub:toggle:'))).toBe(true);
    cleanHarness(h);
  });

  it('answers and returns early when chatId is missing', async () => {
    const h = makeHarness();
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    // chat without `id` → ctx.chat?.id is undefined → !chatId is true
    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      chat: { type: 'private' } as never,
      params: 'trading',
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
    await h.feature.handleUnsubscribeCallback(h.cbCtx({
      from: { username: 'tester' } as never,
      params: 'trading',
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

    await h.feature.handleEmergencyCallback(h.cbCtx({
      params: 'confirm',
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

    await h.feature.handleEmergencyCallback(h.cbCtx({
      params: 'confirm',
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    // Should still answer and edit even on failure
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('confirm: shows engine-not-initialized when engine is null', async () => {
    const h = makeHarness(); // no engine
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cbCtx({
      params: 'confirm',
      answerCallback,
      editMessage,
    }));

    expect(answerCallback).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    expect(editMessage).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    cleanHarness(h);
  });

  it('cancel: does not call engine and edits with cancellation message', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], emergencyStop, stop: vi.fn() } });
    const answerCallback = vi.fn().mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);

    await h.feature.handleEmergencyCallback(h.cbCtx({
      params: 'cancel',
      answerCallback,
      editMessage,
    }));

    expect(emergencyStop).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledTimes(1);
    expect(editMessage).toHaveBeenCalledWith('↩️ Emergency cancelled.');
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
