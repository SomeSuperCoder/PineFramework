import { Telegraf, type Context } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { TelegramConfigStore, ProxyConfig } from '../store/TelegramConfigStore.js';
import { createBackendLogger } from '../utils/logger.js';

const logger = createBackendLogger('backend', 'telegram');

interface TelegramServiceOptions {
  configStore: TelegramConfigStore;
  onSubscribe?: (chatId: number, username: string) => void;
  onUnsubscribe?: (chatId: number) => void;
}

function createSocksAgent(proxy: ProxyConfig): SocksProxyAgent {
  const { host, port, username, password } = proxy;
  let proxyUrl = `socks5://`;
  if (username) {
    proxyUrl += encodeURIComponent(username);
    if (password) {
      proxyUrl += `:${encodeURIComponent(password)}`;
    }
    proxyUrl += `@`;
  }
  proxyUrl += `${host}:${port}`;
  return new SocksProxyAgent(proxyUrl);
}

export class TelegramService {
  private bot: Telegraf | null = null;
  private configStore: TelegramConfigStore;
  private onSubscribe?: (chatId: number, username: string) => void;
  private onUnsubscribe?: (chatId: number) => void;
  private isRunning = false;

  constructor(options: TelegramServiceOptions) {
    this.configStore = options.configStore;
    this.onSubscribe = options.onSubscribe;
    this.onUnsubscribe = options.onUnsubscribe;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const token = this.configStore.getBotToken();
    if (!token) {
      logger.info('[Telegram] No bot token configured, skipping start');
      return;
    }

    const proxy = this.configStore.getProxy();
    let agent: SocksProxyAgent | undefined;
    if (proxy && proxy.host && proxy.port) {
      try {
        agent = createSocksAgent(proxy);
        const authInfo = proxy.username ? ' (with auth)' : '';
        logger.info(`[Telegram] SOCKS5 proxy agent created for ${proxy.host}:${proxy.port}${authInfo}`);
        logger.info(`[Telegram] Bot will route all Telegram API calls through proxy`);
      } catch (err) {
        logger.error('[Telegram] Failed to create SOCKS5 proxy agent:', { err });
      }
    } else {
      logger.info('[Telegram] No proxy configured, connecting directly');
    }

    this.bot = new Telegraf(token, agent ? { telegram: { agent } } : undefined);
    this.isRunning = true;

    this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
      logger.info(`[Telegram] Message from ${ctx.from?.username || ctx.from?.id}: "${ctx.message && 'text' in ctx.message ? ctx.message.text : 'non-text'}"`);
      try {
        await next();
      } catch (err) {
        logger.error('[Telegram] Middleware error:', { err });
      }
    });

    this.bot.command('start', async (ctx: Context) => {
      await ctx.reply(
        '*Welcome to Pine Framework Bot!* 🚀\n\n'
        + 'I send you real-time alerts from your Pine Script indicators straight to this chat.\n\n'
        + '*Getting Started:*\n'
        + '1. Paste your bot token in the Telegram Config panel on the Pine Framework web app\n'
        + '2. Run `/subscribe` to register this chat for notifications\n'
        + '3. Write Pine Script indicators with `alertcondition()` — I\'ll notify you when they fire\n\n'
        + '*Commands:*\n'
        + '/subscribe — Receive alert notifications here\n'
        + '/unsubscribe — Stop receiving alert notifications\n'
        + '/help — Show this message again',
      );
    });

    this.bot.command('help', async (ctx: Context) => {
      await ctx.reply(
        '*Pine Framework Bot — Help*\n\n'
        + 'I forward `alertcondition()` triggers from your Pine Script indicators to Telegram.\n\n'
        + '*Commands:*\n'
        + '/start — Welcome message and setup instructions\n'
        + '/subscribe — Subscribe to alert notifications\n'
        + '/unsubscribe — Unsubscribe from alert notifications\n\n'
        + '*Setup:*\n'
        + 'Enter your bot token in the Pine Framework web app under Telegram Config, '
        + 'then run /subscribe to register this chat.',
      );
    });

    this.bot.command('subscribe', async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      const username = ctx.from?.username || `user_${ctx.from?.id}`;
      if (!chatId) {
        await ctx.reply('Error: Could not identify chat.');
        return;
      }
      this.configStore.addSubscriber(chatId, username);
      if (this.onSubscribe) {
        this.onSubscribe(chatId, username);
      }
      await ctx.reply('You have been subscribed to alert notifications!');
    });

    this.bot.command('unsubscribe', async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('Error: Could not identify chat.');
        return;
      }
      const removed = this.configStore.removeSubscriber(chatId);
      if (this.onUnsubscribe) {
        this.onUnsubscribe(chatId);
      }
      if (removed) {
        await ctx.reply('You have been unsubscribed from alert notifications.');
      } else {
        await ctx.reply('You were not subscribed.');
      }
    });

    try {
      await this.bot.launch();
      logger.info('[Telegram] Bot started');
    } catch (err) {
      logger.error('[Telegram] Failed to start bot:', { err });
      this.bot = null;
      this.isRunning = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) return;
    this.isRunning = false;
    try {
      await this.bot.stop();
      logger.info('[Telegram] Bot stopped');
    } catch (err) {
      logger.error('[Telegram] Error stopping bot:', { err });
    }
    this.bot = null;
  }

  async sendMessage(chatId: number, message: string): Promise<boolean> {
    if (!this.bot) {
      logger.info(`[Telegram] sendMessage: bot not created, skipping send to ${chatId}`);
      return false;
    }
    logger.info(`[Telegram] sendMessage: attempting to send to chatId=${chatId} with MarkdownV2`);
    try {
      await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
      logger.info(`[Telegram] sendMessage: SUCCESS (MarkdownV2) to chatId=${chatId}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info(`[Telegram] sendMessage: FAILED (MarkdownV2) to chatId=${chatId}: ${msg.slice(0, 200)}`);
      if (msg.includes('429')) {
        const retryAfter = msg.match(/retry after (\d+)/)?.[1];
        const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 10000;
        logger.info('Rate limited, waiting', { wait });
        await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
          logger.info(`[Telegram] sendMessage: SUCCESS (retry) to chatId=${chatId}`);
          return true;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          logger.error(`[Telegram] sendMessage: retry also failed for chatId=${chatId}: ${retryMsg.slice(0, 200)}`);
          return false;
        }
      }
      if (msg.includes('parse') || msg.includes('entities') || msg.includes('can\'t')) {
        logger.warn('MarkdownV2 parse error, falling back to plain text', { chatId, msg: msg.slice(0, 200) });
        try {
          await this.bot.telegram.sendMessage(chatId, message);
          logger.info(`[Telegram] sendMessage: SUCCESS (plain text fallback) to chatId=${chatId}`);
          return true;
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          logger.error(`[Telegram] Plain text fallback also failed for chatId=${chatId}: ${fbMsg.slice(0, 200)}`);
          return false;
        }
      }
      logger.error(`[Telegram] sendMessage error for chatId=${chatId}: ${msg.slice(0, 200)}`);
      return false;
    }
  }

  async sendPhoto(chatId: number, buffer: Buffer, caption?: string): Promise<boolean> {
    if (!this.bot || !this.isRunning) return false;
    try {
      await this.bot.telegram.sendPhoto(chatId, { source: buffer }, caption ? { caption } : undefined);
      return true;
    } catch (err: unknown) {
      logger.error('[Telegram] sendPhoto error:', { err: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  async sendAlertToSubscribers(
    message: string,
    alertId: string,
    symbol?: string,
    timeframe?: string,
  ): Promise<void> {
    const subscribers = this.configStore.getSubscribers();
    logger.info('sendAlertToSubscribers', { alertId, subscriberCount: subscribers.length, symbol, timeframe });

    const escapedMessage = message
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');

    const header = symbol || timeframe
      ? `*Alert*${symbol ? ` \\- ${symbol}` : ''}${timeframe ? ` \\- ${timeframe}` : ''}`
      : '*Alert*';

    const fullMessage = `${header}\n\n${escapedMessage}`;

    for (const sub of subscribers) {
      if (alertId) {
        const enabled = this.configStore.getAlertPreference(sub.chatId, alertId);
        logger.info('sendAlertToSubscribers subscriber', { chatId: sub.chatId, alertId, enabled });
        if (!enabled) {
          logger.info(`[Telegram] sendAlertToSubscribers: SKIPPING subscriber ${sub.chatId} (alert disabled)`);
          continue;
        }
      }
      logger.info(`[Telegram] sendAlertToSubscribers: sending to chatId=${sub.chatId}`);
      await this.sendMessage(sub.chatId, fullMessage);
    }
  }

  isActive(): boolean {
    return this.bot !== null;
  }

  getBot(): Telegraf | null {
    return this.bot;
  }
}
