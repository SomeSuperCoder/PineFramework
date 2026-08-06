import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { OHLCVCache } from './cache/ohlcv-cache.js';
import { DiskOHLCVCache } from './cache/DiskOHLCVCache.js';
import { createOHLCVRouter } from './routes/ohlcv.js';
import { createBarsRouter } from './routes/bars.js';
import { executeRouter } from './routes/execute.js';
import { symbolsRouter } from './routes/symbols.js';
import { createStatusRouter } from './routes/status.js';
import { createBacktestRouter } from './routes/backtest.js';
import { createSettingsRouter } from './routes/settings.js';
import { createScriptsRouter } from './routes/scripts.js';
import { createIndicatorsRouter } from './routes/indicators.js';
import { createBuiltInScriptsRouter } from './routes/builtInScripts.js';
import { createExportRouter } from './routes/export.js';
import { createBotRouter } from './routes/bot.js';
import { createTradeHistoryRouter } from './routes/trade-history.js';
import { StatsService } from './services/StatsService.js';
import { BotConfigStore } from 'pine-framework/trading/config-store';
import { TradeHistoryStore } from 'pine-framework/trading/trade-history-store';
import type { BotConfig, BotEngine, RiskManager, RiskManagerConfig } from 'pine-framework';
import {
  TradingTelegramBot,
  type TradingNotificationKind,
  type TradingNotificationRouter,
} from 'pine-framework/trading/telegram-bot';
import { createBotWSGateway } from './ws/bot-gateway.js';
import { buildSnapshotPayload } from './ws/snapshot-payload.js';
import { createWSGateway } from './ws/gateway.js';
import { TelegramConfigStore, type NotificationType } from './store/TelegramConfigStore.js';
import { ScriptFileManager } from './store/ScriptFileManager.js';
import { RunningIndicatorsStore } from './store/RunningIndicatorsStore.js';
import { ScriptsManifestStore } from './store/ScriptsManifestStore.js';
import { TelegramService } from './telegram/TelegramService.js';
import { TelegramBotFeature } from './telegram/TelegramBotFeature.js';
import { renderNotification } from './telegram/notification-renderer.js';
import { migrateLegacyScripts } from './migration.js';
import { logger } from './utils/logger.js';
import { createBotLogger } from './utils/bot-logger.js';

// ── Feature flags ──
const ENABLE_TRADING_BOT = process.env.ENABLE_TRADING_BOT !== 'false';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const TELEGRAM_JSON_PATH = path.join(DATA_DIR, 'telegram.json');
const INDICATORS_JSON_PATH = path.join(DATA_DIR, 'indicators.json');
const SCRIPTS_DIR = path.join(DATA_DIR, 'scripts');
const SCRIPTS_MANIFEST_PATH = path.join(SCRIPTS_DIR, 'manifest.json');
const TEST_INDICATORS_DIR = path.resolve(__dirname, '..', '..', 'test_indicators');

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '8081', 10);

logger.info('Backend server starting', { port: PORT });

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const attrs = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration,
    };
    const msg = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 400) {
      logger.warn(msg, attrs);
    } else {
      logger.info(msg, attrs);
    }
  });
  next();
});

const cache = new OHLCVCache(100, 60_000);
const diskCache = new DiskOHLCVCache({
  cacheDir: path.join(DATA_DIR, 'ohlcv-cache'),
});

const telegramConfig = new TelegramConfigStore(TELEGRAM_JSON_PATH);
const telegramService = new TelegramService({ configStore: telegramConfig });

const indicatorsStore = new RunningIndicatorsStore(INDICATORS_JSON_PATH);
const manifestStore = new ScriptsManifestStore(SCRIPTS_MANIFEST_PATH);
const scriptFileManager = new ScriptFileManager(SCRIPTS_DIR, manifestStore);

// D4 (trade-history dashboard): the store is constructed OUTSIDE the
// ENABLE_TRADING_BOT gate so history/stats stay readable when the bot flag is
// off — it is file-pointed at module init and reads even when no engine is
// constructed. JSONL files land at {DATA_DIR}/trade-history/{botId}/trades.jsonl.
const TRADE_HISTORY_BOT_ID = 'default-bot'; // must match BotEngine's effective botId
const tradeHistoryStore = new TradeHistoryStore({
  baseDir: path.join(DATA_DIR, 'trade-history'),
  botId: TRADE_HISTORY_BOT_ID,
});

// D4: ONE shared StatsService wraps the trade-history store so the REST routes
// and the Telegram /report command read the same in-process aggregation.
const statsService = new StatsService(tradeHistoryStore);

// ── Live-trading notification seam ───────────────────────────────────────────
// The Telegram feature is transport-agnostic and built BEFORE any engine
// exists. `liveEngine` is module-scope so the feature's lazy getEngine()
// resolves the real engine only once the ENABLE_TRADING_BOT block publishes it
// (and is cleared again on shutdown). `onMessage` routes the rendered
// notification into the existing Telegram transport.
let liveEngine: BotEngine | null = null;
const telegramFeature = new TelegramBotFeature({
  store: telegramConfig,
  stats: statsService,
  getEngine: () => liveEngine,
  onMessage: (chatId, msg) => telegramService.sendMessage(chatId, msg),
});
telegramFeature.install(telegramService);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api', createOHLCVRouter(cache, diskCache));
app.use('/api', createBarsRouter(cache, diskCache));
app.use('/api', executeRouter);
app.use('/api', symbolsRouter);
app.use('/api', createStatusRouter(diskCache));
app.use('/api', createBacktestRouter(diskCache));
app.get('/api/telegram/proxy-test', async (_req, res) => {
  const proxy = telegramConfig.getProxy();
  if (!proxy) {
    res.json({ ok: false, error: 'No proxy configured' });
    return;
  }
  try {
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    let proxyUrl = `socks5://`;
    if (proxy.username) {
      proxyUrl += encodeURIComponent(proxy.username);
      if (proxy.password) proxyUrl += `:${encodeURIComponent(proxy.password)}`;
      proxyUrl += `@`;
    }
    proxyUrl += `${proxy.host}:${proxy.port}`;
    // H3: never log the full URL (it embeds the proxy password). host:port only.
    logger.info(`[Proxy-Test] Testing SOCKS5 proxy: ${proxy.host}:${proxy.port}`);
    const agent = new SocksProxyAgent(proxyUrl);
    const https = await import('node:https');
    await new Promise<void>((resolve, reject) => {
      const req = https.get('https://api.telegram.org', { agent, timeout: 10000 }, (resp) => {
        resp.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out'));
      });
    });
    logger.info(`[Proxy-Test] Proxy works!`);
    res.json({ ok: true, proxy: `${proxy.host}:${proxy.port}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Proxy-Test] Proxy test failed: ${msg}`);
    res.json({ ok: false, error: msg, proxy: `${proxy.host}:${proxy.port}` });
  }
});

app.post('/api/telegram/test', async (_req, res) => {
  const chats = telegramConfig.getChats();
  const adminId = telegramConfig.getAdmin()?.userId;
  // Canary target: the admin's own private chat when it is known, else the
  // first private chat, else any linked chat. Mirrors the new chat model —
  // the old subscriber list no longer exists.
  const target =
    (adminId !== undefined ? telegramConfig.getChat(adminId) : undefined) ??
    chats.find((c) => c.type === 'private') ??
    chats.find((c) => c.linked);
  if (!target) {
    res.status(400).json({ error: 'No subscribed chat configured' });
    return;
  }
  logger.info(`[Telegram-Test] Sending test message to chatId=${target.chatId}`);
  // Must be valid MarkdownV2: escape all special chars except paired * for bold
  const base = '*Test Message*\n\nYour Telegram bot is working correctly';
  const escaped = base.replace(/!/g, '\\!').replace(/\./g, '\\.');
  logger.info(`[Telegram-Test] Calling sendMessage with chatId=${target.chatId}`);
  const ok = await telegramService.sendMessage(target.chatId, escaped);
  logger.info(`[Telegram-Test] sendMessage returned: ${ok}`);
  res.json({ success: ok });
});

async function restartTelegramService(): Promise<void> {
  await telegramService.stop();
  await telegramService.start();
}

app.use(
  '/api',
  createSettingsRouter({
    getBotToken: () => telegramConfig.getBotToken(),
    setBotToken: (token: string) => telegramConfig.setBotToken(token),
    getAlertPreference: (chatId: number, alertId: string) =>
      telegramConfig.getAlertPreference(chatId, alertId),
    setAlertPreference: (chatId: number, alertId: string, enabled: boolean) =>
      telegramConfig.setAlertPreference(chatId, alertId, enabled),
    getAdmin: () => telegramConfig.getAdmin(),
    setAdmin: (userId: number, username: string) =>
      telegramConfig.setAdmin(userId, username),
    getControllers: () => telegramConfig.getControllers(),
    addController: (userId: number, username: string, grantedBy: number) =>
      telegramConfig.addController(userId, username, grantedBy),
    removeController: (userId: number) => telegramConfig.removeController(userId),
    getRequests: () => telegramConfig.getRequests(),
    removeRequest: (userId: number) => telegramConfig.removeRequest(userId),
    getChats: () => telegramConfig.getChats(),
    setChatLanguage: (chatId: number, language) =>
      telegramConfig.setChatLanguage(chatId, language),
    // The store exposes union/removal primitives; a "set to exactly these
    // types" PUT is a diff: remove what dropped out, add what appeared.
    setMemberSubscriptions: (chatId: number, memberId: number, types) => {
      const current = telegramConfig.getMemberSubscription(chatId, memberId);
      const toAdd = types.filter((t) => !current.includes(t));
      const toRemove = current.filter((t) => !types.includes(t));
      if (toAdd.length > 0) telegramConfig.memberSubscribe(chatId, memberId, toAdd);
      if (toRemove.length > 0) telegramConfig.memberUnsubscribe(chatId, memberId, toRemove);
    },
    linkChat: (chatId: number, byUserId: number) =>
      telegramConfig.linkChat(chatId, byUserId),
    unlinkChat: (chatId: number) => telegramConfig.unlinkChat(chatId),
    getProxy: () => telegramConfig.getProxy(),
    setProxy: (proxy) => {
      telegramConfig.setProxy(proxy);
      restartTelegramService().catch((err) =>
        logger.error('[Telegram] Error restarting after proxy update:', err),
      );
    },
  }),
);

app.use('/api', createBuiltInScriptsRouter(TEST_INDICATORS_DIR));
app.use('/api', createScriptsRouter(scriptFileManager, indicatorsStore));
app.use('/api', createIndicatorsRouter(indicatorsStore));
app.use('/api', createExportRouter());

// D4: trade history/stats are readable regardless of the bot flag — the store
// above is file-pointed at module init, so this router works even when
// ENABLE_TRADING_BOT=false and no engine is ever constructed. One shared
// StatsService wraps the store so the REST routes and the upcoming Telegram
// /report command consume the same in-process aggregation.
app.use(
  '/api',
  createTradeHistoryRouter({ statsService }),
);

// ── Log Query Endpoint ──
// AI agents and the frontend can query structured log files
// stored under logs/{category}/{subcategory}.log (NDJSON format).
// Query params: category, subcategory, level, limit (default 100, max 1000).
//
// Level filter: log files store level as a string name (e.g. "info"),
// so the string query param matches directly — no numeric conversion needed.

app.get('/api/logs', async (req, res) => {
  const { category, subcategory, level, limit } = req.query as Record<
    string,
    string | undefined
  >;

  const maxLimit = 1000;
  const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 100, maxLimit) : 100;

  // Validate category to prevent path traversal
  const safeCategory = category || 'backend';
  if (!/^[a-z][a-z0-9-]*$/.test(safeCategory)) {
    res.status(400).json({ error: 'Invalid category format' });
    return;
  }

  const logsDir = path.join(__dirname, '..', '..', '..', 'logs');
  const categoryDir = path.join(logsDir, safeCategory);

  let files: string[] = [];
  try {
    const entries = await readdir(categoryDir);
    files = entries
      .filter((f) => f.endsWith('.log'))
      .map((f) => path.join(categoryDir, f));
  } catch {
    // Directory does not exist yet — return empty array
    res.json([]);
    return;
  }

  // If subcategory is specified, filter to just that file
  if (subcategory) {
    const safeSubcategory = subcategory.replace(/[^a-z0-9-]/g, '');
    files = files.filter((f) => f.endsWith(`/${safeSubcategory}.log`));
  }

  const entries: Array<{
    timestamp: string;
    level: string;
    category: string;
    subcategory: string;
    message: string;
    meta?: Record<string, unknown>;
  }> = [];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (level && entry.level !== level) continue;
          entries.push(entry);
        } catch {
          // Skip malformed JSON lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Return most recent entries first
  entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  res.json(entries.slice(0, parsedLimit));
});

// ── Trading Bot (feature-gated) ──
// Hoisted engine reference so the process-signal shutdown path can trigger the
// engine's graceful stop (auto-close-on-stop, design decision 8). The engine
// is constructed inside the feature-gated block below and only exists when
// ENABLE_TRADING_BOT is true.
let botEngine: BotEngine | null = null;

if (ENABLE_TRADING_BOT) {
  const { BotEngine, RiskManager, AutoMarketSelector, generateDefaultCandidates } =
    await import('pine-framework');
  const { WalletManager, EncryptedFileStorage } = await import('pine-framework/trading/wallet');
  const { BybitBarFetcher, LiveBacktestRunner } = await import('./trading/auto-select-runner.js');

  const defaultCandidates = generateDefaultCandidates();

  const barFetcher = new BybitBarFetcher();
  const backtestRunner = new LiveBacktestRunner();

  // Wallet manager — always use encrypted file storage for persistence
  const walletManager = new WalletManager(
    new EncryptedFileStorage(DATA_DIR),
    process.env.WALLET_PASSPHRASE || 'pine-default-passphrase',
  );

  // Config store — persist bot configuration across restarts
  const configStore = new BotConfigStore(DATA_DIR);

  // Load persisted config BEFORE constructing the engine so the risk manager
  // can be built from the saved risk settings (D6).
  const savedConfig = configStore.load();

  /**
   * Build the risk manager from persisted bot config risk settings (D6).
   *
   * Returns undefined when no risk config is present so the bot starts with
   * risk guards disabled rather than crashing.
   *
   * Timezone: RiskConfig stores no timezone today, so the trading-day reset
   * defaults to UTC; the wallet-balance guard inherits it per RiskManager
   * semantics (falls back to dailyLoss.timezone).
   *
   * Wallet-balance guard: enabled only when maxDailyWalletLossUsdc is present
   * and > 0. A missing/0/negative value means "unlimited" (RiskConfig
   * contract); constructing the guard anyway would drive per-candle RPC
   * fetches for zero benefit, so it is omitted entirely.
   */
  function buildRiskManager(config: BotConfig | null): RiskManager | undefined {
    if (!config?.risk) return undefined;

    const riskConfig: RiskManagerConfig = {
      dailyLoss: {
        maxDailyLoss: config.risk.maxDailyLoss,
        timezone: 'UTC',
      },
      emergencyClosePositions: false, // Phase 2: position-close actions are stubs
    };
    if (
      config.risk.maxDailyWalletLossUsdc !== undefined &&
      config.risk.maxDailyWalletLossUsdc > 0
    ) {
      riskConfig.walletBalance = {
        maxDailyWalletLossUsdc: config.risk.maxDailyWalletLossUsdc,
        timezone: riskConfig.dailyLoss.timezone,
      };
    }
    return new RiskManager(riskConfig);
  }

  // Mount bot WebSocket gateway first (lazy engine reference)
  const botWS = createBotWSGateway(server, () => botEngine);

  // Bot logger: writes to logs/bot/{subcategory}.log and broadcasts
  // every log level to the `bot:log` WebSocket channel so the
  // TradingBotPanel receives real-time log events.
  const botLogger = createBotLogger('execution', (entry) => {
    botWS.broadcast({
      channel: 'bot:log',
      data: entry,
    });
  });

  // ── Live-trading notification routing ─────────────────────────────────────
  // Maps the core Telegram notification kinds onto the backend's subscription
  // categories (the two "catch-all" buckets — 'trading' and 'error' — absorb
  // emergency/state-change and warning respectively), then routes each rendered
  // per-language notification through the feature's subscription-aware deliver.
  // The legacy sender passed to TradingTelegramBot is INERT: with `routing`
  // set, every notify* short-circuits to deliver() and the broadcast never runs,
  // so no double-send and no stale legacy recipients.
  const kindToType = (kind: TradingNotificationKind): NotificationType => {
    switch (kind) {
      case 'bot_started':
      case 'bot_stopped':
      case 'emergency_stop':
      case 'state_change':
        // bot_lifecycle = start/stop/emergency/state changes (spec).
        return 'bot_lifecycle';
      case 'position_open':
        return 'position_open';
      case 'position_close':
        return 'position_close';
      case 'daily_loss':
        return 'daily';
      case 'error':
      case 'warning':
        return 'error';
    }
  };
  const routing: TradingNotificationRouter = {
    deliver: async (kind, data, opts) => {
      await telegramFeature.deliver(
        kindToType(kind),
        (lang) => renderNotification(kind, lang, data),
        opts,
      );
    },
  };
  const telegramBot = new TradingTelegramBot(
    { sendMessage: async () => true, getSubscribers: () => [] },
    { includeTxLinks: true, routing },
  );

  botEngine = new BotEngine({
    logger: botLogger,
    walletManager,
    riskManager: buildRiskManager(savedConfig),
    telegramBot,
    // D2/D3 (trade-history dashboard): persist every closed trade and stream it
    // live to the dashboard. botId is explicit so stamped records always match
    // the store's directory — same SSOT value as the store constructed above.
    tradeHistoryStore,
    botId: TRADE_HISTORY_BOT_ID,
    onTradeClosed: (trade) => {
      // Best-effort: a WS broadcast failure (no clients, socket hiccup) must
      // never break trading. The executor also guards this observer, but keep
      // the transport failure local to the wire as well.
      try {
        botWS.broadcast({
          channel: 'bot:trade',
          data: { trade },
        });
      } catch (err) {
        logger.error('[Bot] Failed to broadcast closed trade', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    // D4: persist any runtime config change (e.g. toggleChaosMode) to disk so
    // the mode survives a restart. Engine config is truth; disk follows it.
    onConfigPersist: (config) => configStore.save(config),
    onAutoSelect: async (config) => {
      const selector = new AutoMarketSelector({
        barFetcher,
        backtestRunner,
        script: config.strategySource,
        dex: config.dex,
        metric: config.autoSelectMetric ?? 'profitFactor',
      });
      const result = await selector.select(defaultCandidates, (progress) => {
        botWS.broadcast({
          channel: 'bot:autoSelect',
          type: 'progress',
          data: progress,
        });
      });
      botWS.broadcast({
        channel: 'bot:autoSelect',
        type: 'complete',
        data: {
          best: result.best,
          ranking: result.ranking,
          metric: result.metric,
          evaluatedCount: result.evaluatedCount,
          failedCount: result.failedCount,
        },
      });
      return [result.best.pair];
    },
  });

  // Non-null alias for the wiring closures below: TS does not preserve `let`
  // narrowing inside closures, but at this point in the block the engine is
  // always assigned (constructed above, before any wiring or request runs).
  const engine = botEngine;

  // Publish to the Telegram feature's lazy getEngine now that the engine exists.
  liveEngine = botEngine;

  if (savedConfig) {
    try {
      botEngine.configure(savedConfig);
      logger.info('Loaded persisted bot config');
    } catch (err) {
      logger.warn('Failed to load persisted bot config', { err });
    }
  }

  // Mount bot REST API routes
  app.use(
    '/api',
    createBotRouter({
      getEngine: () => botEngine,
      getWalletManager: () => walletManager,
      getConfigStore: () => configStore,
      getAutoSelectDeps: () => ({
        AutoMarketSelector,
        barFetcher,
        backtestRunner,
        broadcast: (msg: unknown) => botWS.broadcast(msg as any),
        candidates: defaultCandidates,
      }),
    }),
  );

  // Wire engine events → WebSocket broadcast
  botEngine.on('stateChange', (event) => {
    botWS.broadcast({
      channel: 'bot:state',
      data: {
        current: event.current,
        previous: event.previous,
        reason: event.reason,
        timestamp: event.timestamp,
      },
    });
    // Re-broadcast full snapshot when bot starts so connected clients receive startedAt
    if (event.current === 'Running') {
      // SSOT (design D2): same shared builder as the gateway connect handler —
      // this site previously omitted `chaosSignals`, wiping collected markers
      // on every Running transition (the verified live-invisibility bug).
      botWS.broadcast({
        channel: 'bot:snapshot',
        type: 'snapshot',
        data: buildSnapshotPayload(engine.getSnapshot(), engine),
      });
    }
  });

  botEngine.on('chaosSignal', (record) => {
    botWS.broadcast({
      channel: 'bot:chaosSignal',
      data: record,
    });
  });

  // D3: per-candle chaos outcomes broadcast live — the frontend renders the
  // last heartbeat directly from msg.data, matching the chaosSignal channel
  // payload convention.
  botEngine.on('chaosHeartbeat', (heartbeat) => {
    botWS.broadcast({
      channel: 'bot:chaosHeartbeat',
      data: heartbeat,
    });
  });

  // D3: per-candle processing failures surfaced instead of silently swallowed.
  botEngine.on('candleError', (info) => {
    botWS.broadcast({
      channel: 'bot:candleError',
      data: info,
    });
  });

  // D1: live feed telemetry — a dead or silent Bybit feed becomes visible on
  // the dashboard instead of looking like a healthy idle bot. Mirrors the
  // bot:chaosHeartbeat convention: payload under msg.data, additive contract.
  botEngine.on('feedStatus', (status) => {
    botWS.broadcast({
      channel: 'bot:feedStatus',
      data: status,
    });
  });

  // D3: per-position open/close at confirmed order results — the positions
  // panel updates in real time from engine truth (no phantom positions).
  botEngine.on('position', (positionInfo) => {
    botWS.broadcast({
      channel: 'bot:position',
      data: positionInfo,
    });
  });

  logger.info('Trading bot API enabled (ENABLE_TRADING_BOT=true)');
}

createWSGateway(server, cache, telegramService);

// H2: bind to localhost only so the unauthenticated control-plane is not
// reachable from other network interfaces (the frontend proxies through Vite
// on localhost, so this is transparent to it).
server.listen(PORT, '127.0.0.1', async () => {
  logger.info(`Backend server running on http://localhost:${PORT}`);
  logger.info(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  logger.info(`Data directory: ${DATA_DIR}`);
  logger.info(`Scripts directory: ${SCRIPTS_DIR}`);
  await telegramService.start();

  // Migrate legacy scripts from scripts.json to file-based storage
  const migration = migrateLegacyScripts(DATA_DIR, SCRIPTS_DIR, manifestStore);
  if (migration.migrated > 0) {
    logger.info(`[Migration] Migrated ${migration.migrated} legacy scripts to file-based storage`);
  }
});

/**
 * Testable exit seam (design decision 8, auto-close-on-stop). Gracefully stops
 * the trading engine when it is Running, and NEVER throws.
 *
 * Extracted out of shutdown() so the signal→engine.stop() coercion can be
 * unit-tested with a mock engine WITHOUT importing this entrypoint (importing
 * it boots the server and registers real SIGINT/SIGTERM handlers). Passing a
 * mock engine is safe: we only read `.state` and call `.stop()` inside a
 * try/catch. This is the exported seam — tests import THIS, not index.ts.
 *
 * A stop/close failure must never block process exit; shutdown()'s 10s
 * forced-exit fallback remains the backstop.
 */
export async function stopEngineOnShutdown(engine: BotEngine | null): Promise<void> {
  if (!engine) return;

  try {
    if (engine.state === 'Running') {
      await engine.stop();
    } else {
      logger.info('[Server] Engine not running — skipping graceful stop', {
        state: engine.state,
      });
    }
  } catch (err) {
    logger.error('[Server] Engine stop failed during shutdown', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Reviewer MAJOR R2: arm the forced-exit backstop BEFORE awaiting the engine
  // stop. The engine's graceful close can legitimately take up to its close
  // deadline (60s graceful / 30s emergency), and a hung engine stop (e.g. a
  // wedged drain) must never stall process exit indefinitely. This timer
  // guarantees the process exits within 10s of the signal, bounded end-to-end.
  // The contest is intentional: a graceful stop that fits within the budget
  // clears the timer and exits cleanly; one that exceeds it is force-exited so
  // the process can never be stranded in SIGTERM.
  const forcedExitTimer = setTimeout(() => {
    logger.error('[Server] Forced shutdown after graceful-stop backstop');
    process.exit(1);
  }, 10000);

  try {
    // Auto-close-on-stop (design decision 8): the engine's graceful stop
    // sequence (including close-all, via stopEngineOnShutdown) runs BEFORE the
    // telegram service stops and the server closes, so open positions close on
    // process exit and close failure warnings still reach the operator.
    await stopEngineOnShutdown(botEngine);

    // The engine is gone — the Telegram feature's getEngine must no longer
    // report a live engine to /stats, /stop or /emergency.
    liveEngine = null;

    await telegramService.stop();
  } finally {
    // Graceful path completed within the backstop budget — the forced-exit
    // timer must not now fire and turn a clean exit into a failed one.
    clearTimeout(forcedExitTimer);
  }

  server.close(() => {
    logger.info('[Server] Closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
