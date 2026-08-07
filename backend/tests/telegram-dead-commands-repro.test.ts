/**
 * VERIFICATION TEST — Telegram Bot Commands ARE Attached Before Launch
 *
 * Fix: Feature command attachment loops were moved BEFORE `bot.launch()` in
 * TelegramService.start(), so feature commands are now properly attached
 * to the bot before long-polling begins.
 *
 * This test verifies:
 * 1. Feature command handlers are stored in `registeredCommands` before start()
 * 2. `attachCommand()` IS called for each feature command (before launch)
 * 3. Only /start and /help are still registered before launch (unchanged)
 * 4. All feature commands appear on the bot instance before launch() hangs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramService } from '../src/telegram/TelegramService.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `dead-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('✅ COMMANDS ATTACHED — feature commands are attached before bot.launch()', () => {
  let filePath: string;
  let configStore: TelegramConfigStore;

  beforeEach(() => {
    filePath = tmpFile();
    configStore = new TelegramConfigStore(filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('VERIFY: feature commands ARE attached before launch()', async () => {
    const service = new TelegramService({ configStore });
    configStore.setBotToken('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');

    // Register feature commands BEFORE start — exactly as TelegramBotFeature.install() does
    const handler = async () => {};
    service.registerBotCommand('start', handler);
    service.registerBotCommand('request', handler);
    service.registerBotCommand('subscribe', handler);
    service.registerBotCommand('unsubscribe', handler);
    service.registerBotCommand('lang', handler);
    service.registerBotCommand('report', handler);
    service.registerBotCommand('link', handler);
    service.registerBotCommand('unlink', handler);
    service.registerBotCommand('stats', handler);
    service.registerBotCommand('stop', handler);
    service.registerBotCommand('emergency', handler);

    // Spy on the private attachCommand method via prototype
    const attachSpy = vi.spyOn(service as any, 'attachCommand');

    // Start the bot — feature commands are now attached BEFORE launch()
    try {
      await service.start();
    } catch {
      // Expected: the dummy token can't connect to Telegram
    }

    // The registered commands are in the map
    const registeredCommands = (service as any).registeredCommands;
    expect(registeredCommands.size).toBe(11);

    // FIX VERIFIED: attachCommand IS called for each feature command
    // Feature commands are now attached in the loops BEFORE bot.launch()
    const featureCommands = ['start', 'request', 'subscribe', 'unsubscribe', 'lang', 'report', 'link', 'unlink', 'stats', 'stop', 'emergency'];

    for (const cmd of featureCommands) {
      const callsForCmd = attachSpy.mock.calls.filter(
        (call: any[]) => call[0] === cmd
      );
      // attachCommand WAS called for each feature command — fix confirmed
      expect(callsForCmd.length).toBe(1);
    }

    attachSpy.mockRestore();
  });

  it('VERIFY: feature commands ARE on the bot (registered before launch hangs)', async () => {
    const service = new TelegramService({ configStore });
    configStore.setBotToken('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');

    // Track all calls to bot.command()
    let botCommandCalls: string[] = [];

    // Mock the Telegraf bot — launch() hangs forever (simulating long-polling)
    const mockBot = {
      use: vi.fn(),
      command: vi.fn().mockImplementation((cmd: string, _handler: any) => {
        botCommandCalls.push(cmd);
        return mockBot;
      }),
      launch: vi.fn().mockImplementation(() => {
        // Simulate real behavior: launch() starts long-polling which never resolves
        return new Promise<void>(() => {}); // hangs forever
      }),
      stop: vi.fn(),
      telegram: { getMe: vi.fn().mockResolvedValue({ id: 1, is_bot: true, first_name: 'test', username: 'testbot' }) },
      on: vi.fn(),
    };

    vi.spyOn(await import('telegraf'), 'Telegraf').mockImplementation(() => mockBot as any);

    try {
      // Register feature commands BEFORE start() — as TelegramBotFeature.install() does
      service.registerBotCommand('start', async () => {});
      service.registerBotCommand('request', async () => {});
      service.registerBotCommand('subscribe', async () => {});
      service.registerBotCommand('unsubscribe', async () => {});
      service.registerBotCommand('lang', async () => {});
      service.registerBotCommand('report', async () => {});
      service.registerBotCommand('link', async () => {});
      service.registerBotCommand('unlink', async () => {});
      service.registerBotCommand('stats', async () => {});
      service.registerBotCommand('stop', async () => {});
      service.registerBotCommand('emergency', async () => {});

      // start() will attach feature commands BEFORE launch(), then hang at launch()
      service.start();

      // Let the event loop tick — attachCommand calls happen synchronously before launch()
      await new Promise(resolve => setTimeout(resolve, 100));

      // /help is registered by the service itself (unchanged); /start is now a
      // feature command registered through install() — both land before launch.
      expect(botCommandCalls).toContain('help');

      // FIX VERIFIED: feature commands ARE also on the bot (attached before launch)
      const featureCommands = ['start', 'request', 'subscribe', 'unsubscribe', 'lang', 'report', 'link', 'unlink', 'stats', 'stop', 'emergency'];
      for (const cmd of featureCommands) {
        expect(botCommandCalls).toContain(cmd);
      }

      // launch() was called and hangs forever
      expect(mockBot.launch).toHaveBeenCalled();

      // Cleanup: abort the hanging promise
      service.stop();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
