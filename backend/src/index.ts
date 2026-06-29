import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OHLCVCache } from './cache/ohlcv-cache.js';
import { createOHLCVRouter } from './routes/ohlcv.js';
import { executeRouter } from './routes/execute.js';
import { symbolsRouter } from './routes/symbols.js';
import { statusRouter } from './routes/status.js';
import { createBacktestRouter } from './routes/backtest.js';
import { createSettingsRouter } from './routes/settings.js';
import { createWSGateway } from './ws/gateway.js';
import { TelegramConfigStore } from './store/TelegramConfigStore.js';
import { TelegramService } from './telegram/TelegramService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const TELEGRAM_JSON_PATH = path.join(DATA_DIR, 'telegram.json');

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '8080', 10);

const cache = new OHLCVCache(100, 60_000);

const telegramConfig = new TelegramConfigStore(TELEGRAM_JSON_PATH);
const telegramService = new TelegramService({ configStore: telegramConfig });

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api', createOHLCVRouter(cache));
app.use('/api', executeRouter);
app.use('/api', symbolsRouter);
app.use('/api', statusRouter);
app.use('/api', createBacktestRouter());
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
  if (subs.length === 0) {
    res.status(400).json({ error: 'No subscribers' });
    return;
  }
  const ok = await telegramService.sendMessage(subs[0].chatId, '*Test Message*\n\nYour Telegram bot is working correctly!');
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

createWSGateway(server, cache);

server.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Data directory: ${DATA_DIR}`);
  await telegramService.start();
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
