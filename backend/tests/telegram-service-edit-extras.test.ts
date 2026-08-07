/**
 * Transport-level regression for the Telegram inline-button fix.
 *
 * PROVEN root cause: the old transport wrapped the feature's full extras
 * object again —
 *     ctx.editMessageText(text, { reply_markup: markup })
 * — where `markup` was ALREADY `{ reply_markup: { inline_keyboard: [...] } }`.
 * Telegraf's JSON replacer dropped the nested undefined fields, so the wire
 * payload carried NO reply_markup and Telegram REMOVED the inline keyboard on
 * every in-place edit.
 *
 * The fix: the feature passes `{ reply_markup: ... }` and the transport now
 * forwards extras VERBATIM:
 *     editMessage: async (text, extra) => { await ctx.editMessageText(text, extra); }
 *
 * These tests lock that seam: `ctx.editMessageText` must receive the SAME
 * extras object the feature passed — no re-wrap, no drop.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramService } from '../src/telegram/TelegramService.js';

/**
 * Hoisted fake Telegraf. `TelegramService.start()` constructs it, attaches
 * command/action handlers, and launches; the test then drives the captured
 * action handler with a fabricated ctx to reach the editMessage seam.
 */
const { mockTelegraf, actionHandlers } = vi.hoisted(() => {
  const actionHandlers: Array<{ prefix: string; handler: (ctx: never) => Promise<void> }> = [];
  const mockTelegraf = {
    use: vi.fn(),
    command: vi.fn(),
    action: vi.fn((prefix: string, handler: (ctx: never) => Promise<void>) => {
      actionHandlers.push({ prefix: String(prefix), handler });
    }),
    // attachCallbackFallback() registers a catch-all callback_query listener.
    on: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
    },
  };
  return { mockTelegraf, actionHandlers };
});

vi.mock('telegraf', () => ({ Telegraf: vi.fn(() => mockTelegraf) }));

function tmpFile(): string {
  return path.join(os.tmpdir(), `tg-edit-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

interface FakeCtx {
  from: { id: number; username: string };
  chat: { id: number; type: string };
  message: { text: string };
  match: Array<string | undefined>;
  callbackQuery: { id: string; data: string };
  reply: ReturnType<typeof vi.fn>;
  answerCbQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
}

describe('TelegramService callback editMessage seam — verbatim extras forwarding', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;
  let service: TelegramService;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
    service = new TelegramService({ configStore });
    actionHandlers.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await service.stop();
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  /** The action handler the transport registered for `prefix` after start(). */
  function registeredAction(prefix: string): (ctx: never) => Promise<void> {
    const entry = actionHandlers.find((a) => a.prefix.includes(prefix));
    expect(entry, `no action handler registered for "${prefix}"`).toBeDefined();
    return entry!.handler;
  }

  function fakeCtx(editMessageText: ReturnType<typeof vi.fn>): FakeCtx {
    return {
      from: { id: 1000, username: 'tester' },
      chat: { id: 1000, type: 'private' },
      message: { text: '' },
      match: ['stop:confirm', 'confirm'],
      callbackQuery: { id: 'cb-1', data: 'stop:confirm' },
      reply: vi.fn(),
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText,
    };
  }

  it('forwards the full extras object verbatim (no re-wrap, no drop)', async () => {
    configStore.setBotToken('dummy:test-token');
    const handler = vi.fn();
    service.registerBotCallback('stop', handler);
    await service.start();

    // The feature passes the FULL extras object as the 2nd arg.
    const extras = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Yes, Stop', callback_data: 'stop:confirm' },
            { text: '❌ Cancel', callback_data: 'stop:cancel' },
          ],
        ],
      },
    };
    handler.mockImplementation(
      async (ctx: { editMessage: (text: string, extra?: unknown) => Promise<void> }) => {
        await ctx.editMessage('edited text', extras);
      },
    );

    const editMessageText = vi.fn().mockResolvedValue(undefined);
    await registeredAction('stop')(fakeCtx(editMessageText) as never);

    expect(editMessageText).toHaveBeenCalledTimes(1);
    // EXACT identity — the very same extras object, never re-wrapped into
    // `{ reply_markup: extras }` (the bug that dropped the keyboard).
    expect(editMessageText.mock.calls[0]![1]).toBe(extras);
    expect(editMessageText).toHaveBeenCalledWith('edited text', extras);
  });

  it('forwards a missing extras arg as-is (editMessageText(text, undefined))', async () => {
    configStore.setBotToken('dummy:test-token');
    const handler = vi.fn();
    service.registerBotCallback('lang', handler);
    await service.start();

    handler.mockImplementation(
      async (ctx: { editMessage: (text: string, extra?: unknown) => Promise<void> }) => {
        await ctx.editMessage('no markup');
      },
    );

    const editMessageText = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx(editMessageText);
    ctx.match = ['lang', undefined];
    ctx.callbackQuery = { id: 'cb-2', data: 'lang' };
    await registeredAction('lang')(ctx as never);

    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls[0]![0]).toBe('no markup');
    expect(editMessageText.mock.calls[0]![1]).toBeUndefined();
  });
});
