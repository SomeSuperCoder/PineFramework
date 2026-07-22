import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { createWSGateway } from './ws/gateway.js';
import { TelegramConfigStore } from './store/TelegramConfigStore.js';
import { ScriptFileManager } from './store/ScriptFileManager.js';
import { RunningIndicatorsStore } from './store/RunningIndicatorsStore.js';
import { ScriptsManifestStore } from './store/ScriptsManifestStore.js';
import { TelegramService } from './telegram/TelegramService.js';
import { migrateLegacyScripts } from './migration.js';
import { logger } from './utils/logger.js';

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

logger.info({ port: PORT }, 'Backend server starting');

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const attrs = { method: req.method, url: req.originalUrl || req.url, status: res.statusCode, duration };
    const msg = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 400) {
      logger.warn(attrs, msg);
    } else {
      logger.info(attrs, msg);
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
    console.log(`[Proxy-Test] Testing SOCKS5 proxy: ${proxyUrl}`);
    const agent = new SocksProxyAgent(proxyUrl);
    const https = await import('node:https');
    await new Promise<void>((resolve, reject) => {
      const req = https.get('https://api.telegram.org', { agent, timeout: 10000 }, (resp) => {
        resp.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    });
    console.log(`[Proxy-Test] Proxy works!`);
    res.json({ ok: true, proxy: `${proxy.host}:${proxy.port}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Proxy-Test] Proxy test failed:`, msg);
    res.json({ ok: false, error: msg, proxy: `${proxy.host}:${proxy.port}` });
  }
});

app.post('/api/telegram/test', async (_req, res) => {
  const subs = telegramConfig.getSubscribers();
  console.log(`[Telegram-Test] Sending test message, ${subs.length} subscribers found`);
  if (subs.length === 0) {
    res.status(400).json({ error: 'No subscribers' });
    return;
  }
  console.log(`[Telegram-Test] Target chatId: ${subs[0].chatId}, username: ${subs[0].username}`);
  // Must be valid MarkdownV2: escape all special chars except paired * for bold
  const base = '*Test Message*\n\nYour Telegram bot is working correctly';
  const escaped = base.replace(/!/g, '\\!').replace(/\./g, '\\.');
  console.log(`[Telegram-Test] Calling sendMessage with chatId=${subs[0].chatId}`);
  const ok = await telegramService.sendMessage(subs[0].chatId, escaped);
  console.log(`[Telegram-Test] sendMessage returned: ${ok}`);
  res.json({ success: ok });
});

async function restartTelegramService(): Promise<void> {
  await telegramService.stop();
  await telegramService.start();
}

app.use('/api', createSettingsRouter({
  getBotToken: () => telegramConfig.getBotToken(),
  setBotToken: (token: string) => telegramConfig.setBotToken(token),
  getAlertPreference: (chatId: number, alertId: string) => telegramConfig.getAlertPreference(chatId, alertId),
  setAlertPreference: (chatId: number, alertId: string, enabled: boolean) => telegramConfig.setAlertPreference(chatId, alertId, enabled),
  getSubscribers: () => telegramConfig.getSubscribers(),
  getProxy: () => telegramConfig.getProxy(),
  setProxy: (proxy) => {
    telegramConfig.setProxy(proxy);
    restartTelegramService().catch((err) => console.error('[Telegram] Error restarting after proxy update:', err));
  },
}));

app.use('/api', createBuiltInScriptsRouter(TEST_INDICATORS_DIR));
app.use('/api', createScriptsRouter(scriptFileManager, indicatorsStore));
app.use('/api', createIndicatorsRouter(indicatorsStore));
app.use('/api', createExportRouter());

createWSGateway(server, cache, telegramService);

server.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Scripts directory: ${SCRIPTS_DIR}`);
  await telegramService.start();

  // Migrate legacy scripts from scripts.json to file-based storage
  const migration = migrateLegacyScripts(DATA_DIR, SCRIPTS_DIR, manifestStore);
  if (migration.migrated > 0) {
    console.log(`[Migration] Migrated ${migration.migrated} legacy scripts to file-based storage`);
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  await telegramService.stop();
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
