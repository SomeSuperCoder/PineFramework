import { Telegraf, type Context } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { type FeatureCommandContext } from './TelegramBotFeature.js';
import {
  type TelegramConfigStore,
  type ProxyConfig,
} from '../store/TelegramConfigStore.js';
import { escapeMarkdown } from 'pine-framework/trading/telegram-bot';
import { t } from './i18n.js';
import { createBackendLogger } from '../utils/logger.js';

const logger = createBackendLogger('backend', 'telegram');

/**
 * Escape all MarkdownV2 special characters EXCEPT `*` (which is used for
 * bold formatting in i18n strings). This ensures dynamic text is safe to
 * send with `parse_mode: 'MarkdownV2'` while preserving intentional bold.
 *
 * IMPORTANT: `\` is escaped first to avoid double-escaping when chained
 * with the subsequent replacements.
 */
function escapeMarkdownV2(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
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
}

/**
 * Feature-registered command handler. Telegraf's `Context` structurally
 * satisfies `FeatureCommandContext` at runtime (from/chat/message/reply), so a
 * raw telegraf `Context` can be handed to a feature handler — the seam is
 * only widened for type-safety, never narrowed.
 */
export type BotCommandHandler = (ctx: FeatureCommandContext) => Promise<void> | void;

interface TelegramServiceOptions {
  configStore: TelegramConfigStore;
}

function createHttpAgent(proxy: ProxyConfig): HttpsProxyAgent<string> {
  const { host, port, username, password } = proxy;
  let proxyUrl = `http://`;
  if (username) {
    proxyUrl += encodeURIComponent(username);
    if (password) {
      proxyUrl += `:${encodeURIComponent(password)}`;
    }
    proxyUrl += `@`;
  }
  proxyUrl += `${host}:${port}`;
  return new HttpsProxyAgent(proxyUrl);
}

export class TelegramService {
  private bot: Telegraf | null = null;
  private configStore: TelegramConfigStore;
  private isRunning = false;
  /** Feature-registered command handlers, attached once the bot is launched. */
  private readonly registeredCommands = new Map<string, BotCommandHandler>();
  /** Feature-registered text handlers, attached once the bot is launched. */
  private readonly textHandlers: BotCommandHandler[] = [];

  constructor(options: TelegramServiceOptions) {
    this.configStore = options.configStore;
  }

  /**
   * Register a bot command handler. Safe to call before `start()` (the handler
   * is deferred and attached after `bot.launch()`); if the bot is already
   * running it is attached immediately. Registering a name twice overrides the
   * previous handler.
   */
  registerBotCommand(command: string, handler: BotCommandHandler): void {
    if (this.registeredCommands.has(command) && this.bot) {
      logger.info(`[Telegram] Re-registering command "${command}"; overriding existing handler`);
    }
    this.registeredCommands.set(command, handler);
    if (this.bot) {
      this.attachCommand(command, handler);
    }
  }

  /** Attach a feature handler to the live telegraf transport. */
  private attachCommand(command: string, handler: BotCommandHandler): void {
    this.bot?.command(command, handler as (ctx: Context) => Promise<void> | void);
  }

  /** Attach a feature text handler to the live telegraf transport. */
  private attachTextHandler(handler: BotCommandHandler): void {
    this.bot?.on('text', handler as (ctx: Context) => Promise<void> | void);
  }

  /**
   * Register a catch-all text handler. Safe to call before `start()` (deferred
   * and attached after launch); if already running, attached immediately. Used
   * by the feature for sessionful flows such as /stop confirmation (M1).
   */
  registerBotText(handler: BotCommandHandler): void {
    this.textHandlers.push(handler);
    if (this.bot) {
      this.attachTextHandler(handler);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const token = this.configStore.getBotToken();
    if (!token) {
      logger.info('[Telegram] No bot token configured, skipping start');
      return;
    }

    const proxy = this.configStore.getProxy();
    let agent: HttpsProxyAgent<string> | undefined;
    if (proxy && proxy.host && proxy.port) {
      try {
        agent = createHttpAgent(proxy);
        const authInfo = proxy.username ? ' (with auth)' : '';
        logger.info(`[Telegram] HTTP proxy agent created for ${proxy.host}:${proxy.port}${authInfo}`);
        logger.info(`[Telegram] Bot will route all Telegram API calls through proxy`);
      } catch (err) {
        logger.error('[Telegram] Failed to create HTTP proxy agent:', { err });
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
      const lang = this.configStore.getChatLanguage(ctx.chat?.id ?? 0);
      const chatId = ctx.chat?.id;
      if (chatId) {
        this.configStore.addChat(chatId, ctx.chat.type === 'group' ? 'group' : 'private');
      }
      await ctx.reply(escapeMarkdownV2(t(lang, 'startWelcome')), { parse_mode: 'MarkdownV2' });
    });

    this.bot.command('help', async (ctx: Context) => {
      const lang = this.configStore.getChatLanguage(ctx.chat?.id ?? 0);
      await ctx.reply(escapeMarkdownV2(t(lang, 'helpCommands')), { parse_mode: 'MarkdownV2' });
    });

    // Attach any feature-registered command handlers BEFORE launch
    // (launch() starts polling which never returns, so code after it is unreachable)
    for (const [command, handler] of this.registeredCommands) {
      this.attachCommand(command, handler);
    }
    for (const handler of this.textHandlers) {
      this.attachTextHandler(handler);
    }

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
    const chats = this.configStore.getChats();
    logger.info('sendAlertToSubscribers', { alertId, subscriberCount: chats.length, symbol, timeframe });

    const escapedMessage = escapeMarkdownV2(message);

    const header = symbol || timeframe
      ? `*Alert*${symbol ? ` \\- ${escapeMarkdown(symbol)}` : ''}${timeframe ? ` \\- ${escapeMarkdown(timeframe)}` : ''}`
      : '*Alert*';

    const fullMessage = `${header}\n\n${escapedMessage}`;

    for (const chat of chats) {
      // B1 — delivery is subscription-gated, mirroring the feature's routing:
      //   private: the chat's own member must be subscribed to 'trading'
      //   group:   linked AND at least one member subscribed to 'trading'
      // A chat is delivered at most once even when several members match.
      let memberOk: boolean;
      if (chat.type === 'private') {
        memberOk = this.configStore.isMemberSubscribed(chat.chatId, chat.chatId, 'trading');
      } else {
        if (!this.configStore.isLinked(chat.chatId)) {
          logger.info(`[Telegram] sendAlertToSubscribers: SKIPPING group chat ${chat.chatId} (not linked)`);
          continue;
        }
        memberOk = Object.keys(chat.memberSubscriptions).some(
          (key) => chat.memberSubscriptions[key]?.includes('trading') ?? false,
        );
      }
      if (!memberOk) {
        logger.info(`[Telegram] sendAlertToSubscribers: SKIPPING chat ${chat.chatId} (no 'trading' subscription)`);
        continue;
      }
      if (alertId) {
        // Legacy per-alert prefs key the chat's own member by chatId (stays
        // chat-scoped for groups too — one pref per chat, matching the old
        // private-chat semantics).
        const enabled = this.configStore.getAlertPreference(chat.chatId, alertId);
        logger.info('sendAlertToSubscribers subscriber', { chatId: chat.chatId, alertId, enabled });
        if (!enabled) {
          logger.info(`[Telegram] sendAlertToSubscribers: SKIPPING chat ${chat.chatId} (alert disabled)`);
          continue;
        }
      }
      logger.info(`[Telegram] sendAlertToSubscribers: sending to chatId=${chat.chatId}`);
      await this.sendMessage(chat.chatId, fullMessage);
    }
  }

  isActive(): boolean {
    return this.bot !== null;
  }

  getBot(): Telegraf | null {
    return this.bot;
  }
}
