/**
 * Regression: `attachCallbackFallback` must not swallow callback queries for
 * prefixes registered AFTER `start()`.
 *
 * PROVEN root cause: Telegraf runs middleware in registration order. The
 * fallback (`bot.on('callback_query')`) is registered once in `start()` BEFORE
 * any handler that `registerBotCallback` attaches later. The old guard read
 * the live `registeredCallbacks` map and did `return` (no `next()`) for known
 * prefixes — so a LATE-registered prefix's event stopped at the fallback and
 * its specific handler never ran: a dead button + stuck spinner, exactly the
 * failure class the fallback exists to prevent.
 *
 * The fix: the fallback now accepts `(ctx, next)` and calls `next()` for known
 * prefixes so late-registered handlers still receive the event; unmatched
 * prefixes are still answered + logged and the chain stops.
 *
 * These tests simulate Telegraf's ordered middleware chain over a mock bot
 * (registration order preserved): the fallback is pushed when `start()`
 * registers it, and a late `registerBotCallback` pushes its action middleware
 * AFTER the fallback — reproducing the real-world ordering hole.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramService } from '../src/telegram/TelegramService.js';

/**
 * Hoisted fake Telegraf. Unlike the other transport tests, the mock keeps
 * middleware in REGISTRATION ORDER — `action()` (specific prefix handlers) and
 * `on('callback_query')` (the fallback) are pushed to one ordered list, exactly
 * like Telegraf's composer. `dispatchCallback` then walks that chain the way
 * Telegraf does: an action middleware consumes the event on a regex match
 * (no `next()`), otherwise passes through; the fallback decides for itself.
 */
const { mockTelegraf, middleware } = vi.hoisted(() => {
  type ActionMw = { kind: 'action'; regex: RegExp; handler: (ctx: never) => Promise<void> };
  type FallbackMw = {
    kind: 'fallback';
    handler: (ctx: never, next: () => Promise<void>) => Promise<void>;
  };
  const middleware: Array<ActionMw | FallbackMw> = [];
  const mockTelegraf = {
    use: vi.fn(),
    command: vi.fn(),
    action: vi.fn((regex: RegExp, handler: (ctx: never) => Promise<void>) => {
      middleware.push({ kind: 'action', regex, handler });
    }),
    // attachCallbackFallback() registers the catch-all callback_query listener.
    on: vi.fn(
      (_event: string, handler: (ctx: never, next: () => Promise<void>) => Promise<void>) => {
        middleware.push({ kind: 'fallback', handler });
      },
    ),
    launch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
    },
  };
  return { mockTelegraf, middleware };
});

vi.mock('telegraf', () => ({ Telegraf: vi.fn(() => mockTelegraf) }));

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `tg-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

interface FakeCtx {
  from: { id: number; username: string };
  chat: { id: number; type: string };
  message: { text: string };
  match?: RegExpMatchArray | null;
  callbackQuery: { id: string; data: string };
  reply: ReturnType<typeof vi.fn>;
  answerCbQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
}

describe('TelegramService callback fallback ordering — late-registered prefixes', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;
  let service: TelegramService;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
    service = new TelegramService({ configStore });
    middleware.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await service.stop();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  });

  function fakeCtx(data: string): FakeCtx {
    return {
      from: { id: 1000, username: 'tester' },
      chat: { id: 1000, type: 'private' },
      message: { text: '' },
      callbackQuery: { id: 'cb-1', data },
      reply: vi.fn(),
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    };
  }

  /** Walk the middleware chain in registration order, Telegraf-style. */
  async function dispatchCallback(data: string): Promise<FakeCtx> {
    const ctx = fakeCtx(data);
    let i = 0;
    const run = async (): Promise<void> => {
      if (i >= middleware.length) return;
      const mw = middleware[i++]!;
      if (mw.kind === 'action') {
        if (mw.regex.test(data)) {
          ctx.match = data.match(mw.regex);
          await mw.handler(ctx as never);
          // matched action middleware consumes the event (no next()).
        } else {
          await run();
        }
      } else {
        await mw.handler(ctx as never, run);
      }
    };
    await run();
    return ctx;
  }

  it('routes a late-registered prefix to its handler (fallback calls next())', async () => {
    configStore.setBotToken('dummy:test-token');
    const lateHandler = vi.fn(async () => {});
    await service.start();
    // The fix's core scenario: a callback registered AFTER start() is attached
    // AFTER the fallback in the middleware chain.
    service.registerBotCallback('late', lateHandler);

    const ctx = await dispatchCallback('late:doit');

    // The late handler received the event with the parsed callback context.
    expect(lateHandler).toHaveBeenCalledTimes(1);
    const received = lateHandler.mock.calls[0]![0] as {
      data: string;
      action: string;
      params: string;
    };
    expect(received.data).toBe('late:doit');
    expect(received.action).toBe('late');
    expect(received.params).toBe('doit');
    // The fallback must NOT have answered — it fell through to the handler,
    // which owns the answer (no double-answer, no stuck spinner).
    expect(ctx.answerCbQuery).not.toHaveBeenCalled();
  });

  it('still answers + stops for an unmatched prefix (no handler, no next)', async () => {
    configStore.setBotToken('dummy:test-token');
    const spy = vi.fn(async () => {});
    await service.start();
    service.registerBotCallback('late', spy);

    const ctx = await dispatchCallback('bogus:xyz');

    // Unmatched → fallback answers the spinner and does NOT continue the chain.
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('This button is outdated — use /start');
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the normal pre-start wiring: specific handler runs first, fallback not reached for matched data', async () => {
    configStore.setBotToken('dummy:test-token');
    const preHandler = vi.fn(async () => {});
    service.registerBotCallback('stop', preHandler);
    await service.start();

    const ctx = await dispatchCallback('stop:confirm');

    expect(preHandler).toHaveBeenCalledTimes(1);
    // The fallback was never reached for matched data in pre-start wiring, so
    // the specific handler's answer is the only one (no double-answer).
    expect(ctx.answerCbQuery).not.toHaveBeenCalled();
  });
});
