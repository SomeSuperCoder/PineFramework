/**
 * Group-9 — signal-handler unit tests for the exported shutdown seam
 * (OpenSpec auto-close-on-stop, design decision 8).
 *
 * `stopEngineOnShutdown` is exported from src/index.ts. Importing the real
 * entrypoint is NOT side-effect-free: top-level code calls `server.listen(...)`
 * (boots a server + registers real SIGINT/SIGTERM handlers) and instantiates
 * JsonStore-backed stores that WRITE `backend/data/*.json` on construction, plus
 * the ENABLE_TRADING_BOT block builds a WalletManager/BotEngine. To unit-test
 * the seam deterministically we vi.mock the heavy modules so importing
 * src/index.ts becomes inert: no real server binds (http.createServer → stub),
 * nothing is written to disk, no network, no real signals.
 *
 * Case: the seam reads `engine.state` (a property) and calls `engine.stop()`
 * inside a try/catch. It is null-safe and NEVER throws, so a stop/close failure
 * can never block shutdown()'s 10s forced-exit backstop.
 *
 * Lane: test files only. Production code (src/index.ts) is untouched.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Heavy-deps mocks: make importing src/index.ts inert & deterministic ──
// Built-in modules.
vi.mock('http', () => {
  // Fake server: `listen` never invokes its callback, so the real
  // telegramService.start() / migrateLegacyScripts() top-level steps never run.
  const fakeServer = {
    listen: vi.fn(),
    close: vi.fn((cb?: () => void) => cb && cb()),
    on: vi.fn(),
  };
  return { createServer: vi.fn(() => fakeServer), default: {} };
});

// Trading-lib family (top-level-await'd inside the bot block). Keep the REAL
// pine-framework exports (route modules like execute.ts need createPineScriptEngine)
// but stub the heavy bot-construction classes so the ENABLE_TRADING_BOT block
// never touches disk/network at import.
vi.mock('pine-framework', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pine-framework')>();
  class StubEngine {
    on() {
      return this;
    }
    configure() {}
    getSnapshot() {
      return null;
    }
  }
  return {
    ...actual,
    BotEngine: StubEngine,
    RiskManager: class {},
    AutoMarketSelector: class {},
    generateDefaultCandidates: () => [],
  };
});
vi.mock('pine-framework/trading/wallet', () => ({
  WalletManager: class {},
  EncryptedFileStorage: class {},
}));
vi.mock('pine-framework/trading/config-store', () => ({
  BotConfigStore: class {
    load() {
      return null;
    }
  },
}));
vi.mock('../src/trading/auto-select-runner.js', () => ({
  BybitBarFetcher: class {},
  LiveBacktestRunner: class {},
}));

// Backend WebSocket + logging layers (attach to real `http` server / broadcast).
vi.mock('../src/ws/gateway.js', () => ({ createWSGateway: vi.fn() }));
vi.mock('../src/ws/bot-gateway.js', () => ({
  createBotWSGateway: vi.fn(() => ({ broadcast: vi.fn() })),
}));
vi.mock('../src/utils/bot-logger.js', () => {
  const stub = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createBotLogger: vi.fn(() => stub) };
});

// Store + cache layers — otherwise JsonStore writes backend/data/*.json on load.
vi.mock('../src/store/TelegramConfigStore.js', () => ({
  TelegramConfigStore: class {
    getBotToken() {
      return '';
    }
    getSubscribers() {
      return [];
    }
    getProxy() {
      return undefined;
    }
    getAlertPreference() {
      return null;
    }
    setBotToken() {}
    setAlertPreference() {}
    setProxy() {}
    addSubscriber() {}
  },
}));
vi.mock('../src/store/RunningIndicatorsStore.js', () => ({
  RunningIndicatorsStore: class {},
}));
vi.mock('../src/store/ScriptsManifestStore.js', () => ({
  ScriptsManifestStore: class {},
}));
vi.mock('../src/store/ScriptFileManager.js', () => ({
  ScriptFileManager: class {},
}));
vi.mock('../src/cache/DiskOHLCVCache.js', () => ({ DiskOHLCVCache: class {} }));

// Telegram + logger — keep test output deterministic and silent.
//
// The TelegramService mock doubles as the `BotCommandTransport` handed to
// TelegramBotFeature.install(telegramService) (src/index.ts:126). install()
// unconditionally calls transport.registerBotCommand (TelegramBotFeature.ts:372)
// and also consumes registerBotCallback for inline-button prefixes (guarded at
// :376) — both seams must exist on the stub or importing src/index.js crashes
// before any test runs. Mirror the sibling suites (telegram-feature.test.ts).
vi.mock('../src/telegram/TelegramService.js', () => ({
  TelegramService: class {
    start() {}
    stop() {}
    // The TelegramService mock doubles as the BotCommandTransport handed to
    // TelegramBotFeature.install(telegramService) (src/index.ts:126). install()
    // unconditionally calls transport.registerBotCommand (TelegramBotFeature.ts:372)
    // and also consumes registerBotCallback for inline-button prefixes (guarded
    // at :376). Both seams must exist on the stub or importing src/index.js
    // crashes before any test runs. Mirror the sibling suites.
    // Class-body fields need `=` (not `:` — that would be a type annotation).
    registerBotCommand = vi.fn();
    registerBotCallback = vi.fn();
  },
}));
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createBackendLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// The seam under test — imported directly from the entrypoint (not a separate
// module), so these tests exercise the REAL exported symbol.
import { stopEngineOnShutdown } from '../src/index.js';

type EngineArg = Parameters<typeof stopEngineOnShutdown>[0];

function makeEngine(state: 'Running' | 'Stopped' | 'Error') {
  const stop = vi.fn();
  return { engine: { state, stop }, stop };
}

describe('stopEngineOnShutdown (Group-9 signal handler, exported seam)', () => {
  it('1) when the engine is Running, calls engine.stop exactly once', async () => {
    const { engine, stop } = makeEngine('Running');
    stop.mockResolvedValue(undefined);

    await stopEngineOnShutdown(engine as unknown as EngineArg);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('2) when the engine is null, returns without throwing and never calls stop', async () => {
    await expect(stopEngineOnShutdown(null)).resolves.toBeUndefined();
  });

  it.each(['Stopped', 'Error'] as const)(
    '3) when the engine is %s (not Running), does NOT call stop',
    async (state) => {
      const { engine, stop } = makeEngine(state);

      await stopEngineOnShutdown(engine as unknown as EngineArg);

      expect(stop).not.toHaveBeenCalled();
    },
  );

  it('4) when engine.stop() REJECTS, stopEngineOnShutdown still RESOLVES (never throws)', async () => {
    const { engine, stop } = makeEngine('Running');
    stop.mockRejectedValue(new Error('close positions failed'));

    // The whole body is try/catch — the process-exit path proceeds.
    await expect(stopEngineOnShutdown(engine as unknown as EngineArg)).resolves.toBeUndefined();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});