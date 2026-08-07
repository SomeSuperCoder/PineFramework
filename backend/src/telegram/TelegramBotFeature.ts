/**
 * TelegramBotFeature — the policy layer for the PineFramework Telegram bot.
 *
 * Owns the command surface (request/subscribe/unsubscribe/lang/report/stats/
 * stop/emergency/link/unlink), the operator auth gate, and the notification-type
 * routing core. It is transport-agnostic by design:
 *
 *  - `getEngine` and `onMessage` are injected, so the feature is constructible
 *    and its handlers are drivable WITHOUT a live Telegraf instance (the Test
 *    Engineer drives handlers with fabricated ctx objects).
 *  - `install(transport)` binds every command handler onto a transport that only
 *    needs a `registerBotCommand` seam (see TelegramService.registerBotCommand).
 *
 * All user-facing text is resolved through i18n `t()` with the exact dictionary
 * keys in `./i18n.ts`. Controllers and the admin share one operator gate; every
 * other member is bound to the chat-level subscription model owned by
 * TelegramConfigStore.
 *
 * Commands with interactive UIs (lang, subscribe, unsubscribe, emergency,
 * start) present inline keyboards via `reply_markup.inline_keyboard`. Button
 * presses route through the `BotCommandTransport.registerBotCallback` seam
 * (action prefix matching) to dedicated callback handlers. Every callback
 * handler calls `answerCallbackQuery` to dismiss the spinner and uses
 * `editMessageText` to update the original message in-place.
 */

import type { BotEngine, BotState } from 'pine-framework';
import type {
  TelegramConfigStore,
  NotificationType,
  ChatLanguage,
  TelegramChat,
} from '../store/TelegramConfigStore.js';
import { NOTIFICATION_TYPES } from '../store/TelegramConfigStore.js';
import type { StatsService } from '../services/StatsService.js';
import { t, isSupportedLanguage, type BotLanguage, type I18nKey } from './i18n.js';

/**
 * The minimal, fabricatable message context each handler accepts. Structurally
 * satisfied by telegraf's `Context` (from/chat/message/reply), so real transport
 * handlers and tester-injected fake ctx objects share one shape.
 */
export interface FeatureCommandContext {
  from?: { id: number; username?: string; first_name?: string };
  chat?: { id: number; type?: string };
  message?: { text?: string };
  reply: (text: string, extra?: unknown) => Promise<unknown>;
}

/** A feature-registered catch-all text handler (e.g. /stop confirmation). */
export type BotTextHandler = (ctx: FeatureCommandContext) => Promise<void> | void;

/**
 * Extended context for inline button callback handlers. Carries the parsed
 * callback data alongside the base `FeatureCommandContext` fields, plus
 * helpers for answering the callback query and editing the original message.
 *
 * Callback data protocol: `"{action}:{param1}:{param2}"` (max 64 bytes).
 * The `action` prefix is matched against registered prefixes; `params` is
 * the colon-delimited string after the first `:`.
 */
export interface CallbackContext extends FeatureCommandContext {
  /** The raw `callback_query.id` — pass to `answerCallback`. */
  callbackQueryId: string;
  /** The full `callback_query.data` string (e.g. `"stop:confirm"`). */
  data: string;
  /** The matched action prefix (e.g. `"stop"`). */
  action: string;
  /** Everything after the action prefix and its trailing `:` (e.g. `"confirm"`). */
  params: string;
  /**
   * Acknowledge the callback query so the Telegram spinner disappears.
   * @param text  Optional toast text shown briefly to the user.
   */
  answerCallback: (text?: string) => Promise<void>;
  /**
   * Edit the original message text in-place. Use for inline menus.
   * @param text   New message text (MarkdownV2).
   * @param markup Optional reply_markup (e.g. InlineKeyboardMarkup).
   */
  editMessage: (text: string, markup?: unknown) => Promise<void>;
}

/** A feature-registered callback handler for inline buttons. */
export type BotCallbackHandler = (ctx: CallbackContext) => Promise<void>;

/** The transport surface a feature installs against. */
export interface BotCommandTransport {
  registerBotCommand: (
    command: string,
    handler: (ctx: FeatureCommandContext) => Promise<void> | void,
  ) => void;
  /** Optional seam for sessionful text flows (two-step /stop). */
  registerBotText?: (handler: BotTextHandler) => void;
  /**
   * Register a callback_query handler by action prefix. The transport matches
   * `callback_query.data` against `^{prefix}(?::(.+))?$` and routes matches
   * to the handler with parsed `action` and `params`.
   *
   * Safe to call before `start()` (deferred) or after (attached immediately).
   * Registering the same prefix twice overrides the previous handler.
   */
  registerBotCallback?: (actionPrefix: string, handler: BotCallbackHandler) => void;
}

interface TelegramBotFeatureOptions {
  store: TelegramConfigStore;
  stats?: StatsService | null;
  /** Resolves the live engine, or null when trading is disabled / not built yet. */
  getEngine: () => BotEngine | null;
  /** Injected message transport; returns true when the chat accepted the message. */
  onMessage?: (chatId: number, message: string) => Promise<boolean>;
}

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** How long a /stop confirmation stays valid before it is ignored. */
const STOP_CONFIRM_TTL_MS = 60_000;
/** Explicit confirmations for the two-step /stop flow, matched case-insensitively. */
const STOP_CONFIRM_WORDS: ReadonlySet<string> = new Set(['yes', 'y', 'confirm', 'да', 'si']);

interface PendingStopConfirm {
  /** Chat id that requested the stop. */
  chatId: number;
  /** Timestamp of the /stop that started the confirmation window. */
  askedAt: number;
  /** Operator that issued the /stop (recorded for audit; not enforced on reply). */
  confirmingUserId: number;
}

export class TelegramBotFeature {
  private readonly store: TelegramConfigStore;
  private readonly stats?: StatsService | null;
  private readonly getEngine: () => BotEngine | null;
  private readonly onMessage?: (chatId: number, message: string) => Promise<boolean>;
  /** In-flight /stop confirmations, keyed by chatId (M1 two-step stop). */
  private readonly pendingStops = new Map<number, PendingStopConfirm>();

  constructor(opts: TelegramBotFeatureOptions) {
    this.store = opts.store;
    this.stats = opts.stats ?? null;
    this.getEngine = opts.getEngine;
    this.onMessage = opts.onMessage;
  }

  // ---- Transport wiring ----------------------------------------------------

  /**
   * Register every supported command handler against a transport. Safe to call
   * before the transport has launched: the seam defers/attaches them.
   */
  install(transport: BotCommandTransport): void {
    transport.registerBotCommand('start', (ctx) => this.handleStart(ctx));
    transport.registerBotCommand('request', (ctx) => this.handleRequest(ctx));
    transport.registerBotCommand('subscribe', (ctx) => this.handleSubscribe(ctx));
    transport.registerBotCommand('unsubscribe', (ctx) => this.handleUnsubscribe(ctx));
    transport.registerBotCommand('lang', (ctx) => this.handleLang(ctx));
    transport.registerBotCommand('report', (ctx) => this.handleReport(ctx));
    transport.registerBotCommand('stats', (ctx) => this.handleStats(ctx));
    transport.registerBotCommand('stop', (ctx) => this.handleStop(ctx));
    transport.registerBotCommand('emergency', (ctx) => this.handleEmergency(ctx));

    // Inline button callbacks — the interactive UI path. Each prefix routes
    // through the transport's callback_query matching to the handler below.
    if (transport.registerBotCallback) {
      transport.registerBotCallback('lang', (ctx) => this.handleLangCallback(ctx));
      transport.registerBotCallback('sub', (ctx) => this.handleSubscribeCallback(ctx));
      transport.registerBotCallback('unsub', (ctx) => this.handleUnsubscribeCallback(ctx));
      transport.registerBotCallback('emergency', (ctx) => this.handleEmergencyCallback(ctx));
      transport.registerBotCallback('stop', (ctx) => this.handleStopCallback(ctx));
    }

    transport.registerBotCommand('link', (ctx) => this.handleLink(ctx));
    transport.registerBotCommand('unlink', (ctx) => this.handleUnlink(ctx));

    // Sessionful text flow (two-step /stop confirmation). Optional seam: when
    // the transport exposes it, route every non-command text message here.
    if (transport.registerBotText) {
      transport.registerBotText((ctx) => this.handleText(ctx));
    }
  }

  /**
   * Catch-all for text that matched no known command. Named so the wiring wave
   * can route it to a transport text/fallback hook; the command-only `install`
   * surface cannot register a catch-all.
   */
  async handleUnknown(ctx: FeatureCommandContext): Promise<void> {
    await ctx.reply(this.t(ctx, 'unknownCommand'));
  }

  // ---- Notification routing core -------------------------------------------

  /**
   * Route one notification to every chat/member subscribed to `type`.
   *
   * - With `opts.chatId`, only that chat is considered: a private chat's own
   *   member (memberId == chatId) must be subscribed; a group must be linked
   *   and each subscribed member delivered.
   * - Without it, every private chat and every linked group is considered.
   * - Groups only deliver when linked (`isLinked`); private chats always are.
   * - Message text is built per-recipient with that chat's language.
   *   Controllers are irrelevant here — deliver is subscription-driven.
   *
   * @returns the number of successful sends (transport returned true).
   */
  async deliver(
    type: NotificationType,
    getMessage: (lang: ChatLanguage) => string,
    opts?: { chatId?: number },
  ): Promise<number> {
    if (!this.onMessage) return 0;

    const recipients: Set<number> = new Set();

    if (opts?.chatId !== undefined) {
      const chat = this.store.getChat(opts.chatId);
      if (chat) this.collectRecipientChats(chat, type, recipients);
    } else {
      for (const chat of this.store.getChats()) {
        this.collectRecipientChats(chat, type, recipients);
      }
    }

    let delivered = 0;
    for (const chatId of recipients) {
      const chat = this.store.getChat(chatId);
      if (!chat) continue;
      try {
        const ok = await this.onMessage(chat.chatId, getMessage(chat.language));
        if (ok) delivered++;
      } catch {
        // A single recipient's transport failure must not break the rest.
      }
    }
    return delivered;
  }

  /**
   * Adds `chat.chatId` when this chat is a routing target for `type`:
   * a private chat must have its own member subscribed; a group must be linked
   * and have at least one member subscribed. The set dedupes the group case —
   * multiple subscribed members still deliver ONE message to the chat.
   */
  private collectRecipientChats(
    chat: TelegramChat,
    type: NotificationType,
    out: Set<number>,
  ): void {
    if (chat.type === 'private') {
      if (this.store.isMemberSubscribed(chat.chatId, chat.chatId, type)) {
        out.add(chat.chatId);
      }
      return;
    }
    // Group: only when linked. Group members never default to ALL, so only
    // members who explicitly subscribed are considered.
    if (!this.store.isLinked(chat.chatId)) return;
    for (const memberKey of Object.keys(chat.memberSubscriptions)) {
      const memberId = Number(memberKey);
      if (Number.isNaN(memberId)) continue;
      if (this.store.isMemberSubscribed(chat.chatId, memberId, type)) {
        out.add(chat.chatId);
        return;
      }
    }
  }

  // ---- Auth helpers ----------------------------------------------------------

  /** True when `fromId` is the configured admin or an approved controller. */
  private isAdminOrController(fromId: number): boolean {
    return fromId === this.store.getAdmin()?.userId || this.store.isController(fromId);
  }

  /** Rejects non-operators with permDeniedControl; returns false when denied. */
  private async assertController(ctx: FeatureCommandContext): Promise<boolean> {
    const fromId = ctx.from?.id;
    if (fromId === undefined || !this.isAdminOrController(fromId)) {
      await ctx.reply(this.t(ctx, 'permDeniedControl'));
      return false;
    }
    return true;
  }

  /** The chat's language, falling back to english for unknown chats. */
  private chatLang(ctx: FeatureCommandContext): BotLanguage {
    return this.store.getChatLanguage(ctx.chat?.id ?? 0);
  }

  /** i18n resolved against the chat's language. */
  private t(
    ctx: FeatureCommandContext,
    key: I18nKey,
    params?: Record<string, string | number>,
  ): string {
    return t(this.chatLang(ctx), key, params);
  }

  /** Tokenized args after the command word, e.g. "/subscribe trading" -> ["trading"]. */
  private args(ctx: FeatureCommandContext): string[] {
    const text = ctx.message?.text ?? '';
    return text.split(/\s+/).slice(1).filter(Boolean);
  }

  // ---- Command handlers ----------------------------------------------------

  /**
   * /start — welcome dashboard with navigation inline buttons.
   *
   * Registers the chat and presents a menu of the most common actions
   * so users can navigate without memorizing commands.
   */
  async handleStart(ctx: FeatureCommandContext): Promise<void> {
    const lang = this.chatLang(ctx);
    const chatId = ctx.chat?.id;
    if (chatId) {
      const isGroup = ctx.chat?.type === 'group';
      this.store.addChat(chatId, isGroup ? 'group' : 'private');
    }

    await ctx.reply(t(lang, 'startWelcome'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔔 Subscribe', callback_data: 'sub:menu' },
            { text: '🔕 Unsubscribe', callback_data: 'unsub:menu' },
          ],
          [
            { text: '🌐 Language', callback_data: 'lang:menu' },
            { text: '📊 Report', callback_data: 'report:show' },
          ],
          [
            { text: '⚙️ Stats', callback_data: 'stats:show' },
            { text: '🛑 Stop', callback_data: 'stop:confirm' },
          ],
        ],
      },
    });
  }

  /** /request — ask the team to grant operator access. */
  async handleRequest(ctx: FeatureCommandContext): Promise<void> {
    const username = ctx.from?.username ?? '';
    const firstName = ctx.from?.first_name ?? '';
    const fromId = ctx.from?.id;

    if (fromId === undefined) {
      await ctx.reply(this.t(ctx, 'invalidArgs'));
      return;
    }
    if (this.store.isController(fromId) || fromId === this.store.getAdmin()?.userId) {
      await ctx.reply(this.t(ctx, 'requestAlreadyGranted'));
      return;
    }
    if (this.store.getRequests().some((r) => r.userId === fromId)) {
      await ctx.reply(this.t(ctx, 'requestAlreadyPending'));
      return;
    }
    this.store.addRequest(fromId, username, firstName);
    await ctx.reply(this.t(ctx, 'requestSubmitted'));
  }

  /**
   * /subscribe [type] — opt (a member of) a chat into notification types.
   *
   * Without a type arg: shows an inline keyboard with toggle buttons for
   * every notification type, reflecting current subscription state.
   * With a type arg: subscribes to that type directly (text fallback).
   */
  async handleSubscribe(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if (chatId === undefined || fromId === undefined) {
      await ctx.reply(this.t(ctx, 'invalidArgs'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;

    // No type arg → present toggle keyboard with current state.
    const args = this.args(ctx);
    if (args.length === 0) {
      this.store.addChat(chatId, isGroup ? 'group' : 'private');
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.reply(this.t(ctx, 'subscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'sub:toggle'),
        },
      });
      return;
    }

    const types = this.resolveTypes(args);
    if (types === null) {
      await ctx.reply(`${this.t(ctx, 'invalidArgs')}\n${this.t(ctx, 'validTypes')}`);
      return;
    }

    this.store.addChat(chatId, isGroup ? 'group' : 'private');
    const before = this.store.getMemberSubscription(chatId, memberId);
    this.store.memberSubscribe(chatId, memberId, types);
    const after = this.store.getMemberSubscription(chatId, memberId);
    const changed = after.length > before.length;
    await ctx.reply(this.t(ctx, changed ? 'subscribeSuccess' : 'subscribeFailure'));
  }

  /**
   * Callback handler for subscribe toggle buttons. Toggles a single
   * notification type and refreshes the inline keyboard to reflect
   * the updated subscription state. Also handles the "menu" action
   * from the /start dashboard — shows the toggle keyboard in-place.
   */
  async handleSubscribeCallback(ctx: CallbackContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;

    if (!chatId || fromId === undefined) {
      await ctx.answerCallback();
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;
    this.store.addChat(chatId, isGroup ? 'group' : 'private');

    // "menu" from /start dashboard → show toggle keyboard.
    if (ctx.params === 'menu') {
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'subscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'sub:toggle'),
        },
      });
      return;
    }

    const type = ctx.params;
    if (!isNotificationType(type)) {
      await ctx.answerCallback();
      return;
    }

    // Toggle: if subscribed → unsubscribe; else → subscribe.
    const current = this.store.getMemberSubscription(chatId, memberId);
    if (current.includes(type)) {
      this.store.memberUnsubscribe(chatId, memberId, [type]);
    } else {
      this.store.memberSubscribe(chatId, memberId, [type]);
    }

    // Refresh the keyboard with updated state.
    const updated = this.store.getMemberSubscription(chatId, memberId);
    await ctx.answerCallback();
    await ctx.editMessage(this.t(ctx, 'subscribeSuccess'), {
      reply_markup: {
        inline_keyboard: this.buildTypeKeyboard(updated, 'sub:toggle'),
      },
    });
  }

  /**
   * /unsubscribe [type] — mirror of /subscribe.
   *
   * Without a type arg: shows an inline keyboard with toggle buttons for
   * every notification type, reflecting current subscription state.
   * With a type arg: unsubscribes from that type directly (text fallback).
   */
  async handleUnsubscribe(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if (chatId === undefined || fromId === undefined) {
      await ctx.reply(this.t(ctx, 'invalidArgs'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;

    // No type arg → present toggle keyboard with current state.
    const args = this.args(ctx);
    if (args.length === 0) {
      this.store.addChat(chatId, isGroup ? 'group' : 'private');
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.reply(this.t(ctx, 'unsubscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'unsub:toggle'),
        },
      });
      return;
    }

    const types = this.resolveTypes(args);
    if (types === null) {
      await ctx.reply(`${this.t(ctx, 'invalidArgs')}\n${this.t(ctx, 'validTypes')}`);
      return;
    }
    const before = this.store.getMemberSubscription(chatId, memberId);
    this.store.memberUnsubscribe(chatId, memberId, types);
    const after = this.store.getMemberSubscription(chatId, memberId);
    const changed = after.length < before.length;
    await ctx.reply(this.t(ctx, changed ? 'unsubscribeSuccess' : 'unsubscribeFailure'));
  }

  /**
   * Callback handler for unsubscribe toggle buttons. Toggles a single
   * notification type and refreshes the inline keyboard to reflect
   * the updated subscription state. Also handles the "menu" action
   * from the /start dashboard — shows the toggle keyboard in-place.
   */
  async handleUnsubscribeCallback(ctx: CallbackContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;

    if (!chatId || fromId === undefined) {
      await ctx.answerCallback();
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;
    this.store.addChat(chatId, isGroup ? 'group' : 'private');

    // "menu" from /start dashboard → show toggle keyboard.
    if (ctx.params === 'menu') {
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'unsubscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'unsub:toggle'),
        },
      });
      return;
    }

    const type = ctx.params;
    if (!isNotificationType(type)) {
      await ctx.answerCallback();
      return;
    }

    // Toggle: if subscribed → unsubscribe; else → subscribe.
    const current = this.store.getMemberSubscription(chatId, memberId);
    if (current.includes(type)) {
      this.store.memberUnsubscribe(chatId, memberId, [type]);
    } else {
      this.store.memberSubscribe(chatId, memberId, [type]);
    }

    // Refresh the keyboard with updated state.
    const updated = this.store.getMemberSubscription(chatId, memberId);
    await ctx.answerCallback();
    await ctx.editMessage(this.t(ctx, 'unsubscribeSuccess'), {
      reply_markup: {
        inline_keyboard: this.buildTypeKeyboard(updated, 'unsub:toggle'),
      },
    });
  }

  /** Parses the optional [type] arg: no arg -> ALL, valid type -> [type], else invalid. */
  private resolveTypes(args: string[]): NotificationType[] | null {
    if (args.length === 0) return [...NOTIFICATION_TYPES];
    const [first] = args;
    if (!isNotificationType(first)) return null;
    return [first];
  }

  /**
   * /lang [en|es|ru] — read or change the chat's language.
   *
   * Without args: shows an inline keyboard with language buttons.
   * With an arg: applies the language immediately (text fallback path).
   */
  async handleLang(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const arg = this.args(ctx)[0];

    // No arg → present language picker with inline buttons.
    if (arg === undefined) {
      await ctx.reply(this.t(ctx, 'langUsage'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇬🇧 English', callback_data: 'lang:set:en' },
              { text: '🇪🇸 Español', callback_data: 'lang:set:es' },
              { text: '🇷🇺 Русский', callback_data: 'lang:set:ru' },
            ],
          ],
        },
      });
      return;
    }

    if (chatId === undefined || !isSupportedLanguage(arg)) {
      await ctx.reply(this.t(ctx, 'langInvalid'));
      return;
    }
    const isGroup = ctx.chat?.type === 'group';
    this.store.addChat(chatId, isGroup ? 'group' : 'private');
    this.store.setChatLanguage(chatId, arg);
    await ctx.reply(this.t(ctx, 'langChanged', { lang: arg }));
  }

  /**
   * Callback handler for the language picker inline buttons. Receives the
   * selected language code via `params` (e.g. "en", "es", "ru"), persists
   * it, and edits the original message to confirm the change. Also handles
   * the "menu" action from the /start dashboard — shows the picker in-place.
   */
  async handleLangCallback(ctx: CallbackContext): Promise<void> {
    const chatId = ctx.chat?.id;

    if (!chatId) {
      await ctx.answerCallback(this.t(ctx, 'langInvalid'));
      return;
    }

    // "menu" from /start dashboard → show language picker.
    if (ctx.params === 'menu') {
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'langUsage'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇬🇧 English', callback_data: 'lang:set:en' },
              { text: '🇪🇸 Español', callback_data: 'lang:set:es' },
              { text: '🇷🇺 Русский', callback_data: 'lang:set:ru' },
            ],
          ],
        },
      });
      return;
    }

    const lang = ctx.params as BotLanguage;
    if (!isSupportedLanguage(lang)) {
      await ctx.answerCallback(this.t(ctx, 'langInvalid'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    this.store.addChat(chatId, isGroup ? 'group' : 'private');
    this.store.setChatLanguage(chatId, lang);
    await ctx.answerCallback();
    await ctx.editMessage(this.t(ctx, 'langChanged', { lang }));
  }

  /** /report — compact performance recap (any chat member). */
  async handleReport(ctx: FeatureCommandContext): Promise<void> {
    const lang = this.chatLang(ctx);

    if (!this.stats) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }
    const summary = this.stats.getSessionSummary();
    if (summary.totalTrades === 0) {
      await ctx.reply(t(lang, 'reportEmpty'));
      return;
    }

    const rows = summary.recent.map((trade) =>
      t(lang, 'reportRow', {
        symbol: trade.symbol,
        side: trade.side,
        pnl: this.formatPnl(trade.realizedPnl),
      }),
    );
    const body = [t(lang, 'reportHeader'), ...rows].join('\n');
    await ctx.reply(body);
  }

  /** /stats — engine status (operator only). */
  async handleStats(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const lang = this.chatLang(ctx);
    const engine = this.getEngine();
    if (!engine) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }

    const state: BotState = engine.state;
    const stateKey: I18nKey =
      state === 'Running' ? 'statsRunning' : state === 'Error' ? 'statsError' : 'statsStopped';
    const pairs = engine.config?.pairs?.length ?? 0;
    const positions = engine.positions.length;
    await ctx.reply(
      [
        t(lang, 'statsHeader'),
        t(lang, stateKey),
        t(lang, 'statsPairs', { count: pairs }),
        t(lang, 'statsPositions', { count: positions }),
      ].join('\n'),
    );
  }

  /** /stop — operator authority, two-step confirmation via inline buttons. */
  async handleStop(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const lang = this.chatLang(ctx);
    const engine = this.getEngine();
    if (!engine) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }

    if (engine.state !== 'Running') {
      await ctx.reply(t(lang, 'statsStopped'));
      return;
    }

    // Inline buttons: primary path when the transport supports callbacks.
    // The text fallback in handleText still works for transports without
    // registerBotCallback (pendingStops map is kept for that path).
    await ctx.reply(t(lang, 'stopConfirmRequest'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Yes, Stop', callback_data: 'stop:confirm' },
            { text: '❌ Cancel', callback_data: 'stop:cancel' },
          ],
        ],
      },
    });

    // Also set pending for the text fallback path — if the transport does NOT
    // support inline callbacks, the user can still reply "yes" in text.
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) {
      this.pendingStops.set(chatId, {
        chatId,
        askedAt: Date.now(),
        confirmingUserId: ctx.from?.id ?? 0,
      });
    }
  }

  /**
   * Inline button callback handler for /stop confirmation. Dispatches on the
   * `params` value ("confirm" or "cancel") extracted from callback_data.
   *
   * Always calls answerCallbackQuery to dismiss the Telegram spinner, then
   * edits the original message to reflect the outcome.
   */
  async handleStopCallback(ctx: CallbackContext): Promise<void> {
    const lang = this.chatLang(ctx);
    const { params } = ctx;

    if (params === 'confirm') {
      const engine = this.getEngine();
      if (!engine || engine.state !== 'Running') {
        await ctx.answerCallback(t(lang, 'stopCancelled'));
        await ctx.editMessage(t(lang, 'stopCancelled'));
        return;
      }

      try {
        await engine.stop();
        await ctx.answerCallback();
        await ctx.editMessage(t(lang, 'stopConfirmSuccess'));
      } catch {
        await ctx.answerCallback(t(lang, 'stopCancelled'));
        await ctx.editMessage(t(lang, 'stopCancelled'));
      }
      return;
    }

    if (params === 'cancel') {
      await ctx.answerCallback();
      await ctx.editMessage(t(lang, 'stopCancelled'));
      return;
    }
  }

  /**
   * Catch-all text handler. Resolves any in-flight /stop confirmation for the
   * chat: an explicit confirmation runs engine.stop(); anything else (or an
   * expired/absent pending entry) is a no-op or cancels. Non-command text with
   * no pending entry is ignored here (the unknown-command hook is separate).
   */
  async handleText(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const pending = this.pendingStops.get(chatId);
    if (!pending) return;

    // Stale confirmations (older than the TTL) are dropped and ignored.
    if (Date.now() - pending.askedAt > STOP_CONFIRM_TTL_MS) {
      this.pendingStops.delete(chatId);
      return;
    }

    const lang = this.chatLang(ctx);
    this.pendingStops.delete(chatId); // consume regardless of the reply text

    const text = (ctx.message?.text ?? '').trim().toLowerCase();
    if (!STOP_CONFIRM_WORDS.has(text)) {
      await ctx.reply(t(lang, 'stopCancelled'));
      return;
    }

    const engine = this.getEngine();
    if (!engine) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }
    try {
      await engine.stop();
      await ctx.reply(t(lang, 'stopConfirmSuccess'));
    } catch {
      await ctx.reply(t(lang, 'stopCancelled'));
    }
  }

  /**
   * /emergency — operator halt with confirmation button.
   *
   * Shows a confirmation keyboard before executing the emergency stop.
   * The confirmation callback handles the actual engine halt.
   */
  async handleEmergency(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const lang = this.chatLang(ctx);
    const engine = this.getEngine();
    if (!engine) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }

    await ctx.reply(t(lang, 'emergencyResult'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚨 EMERGENCY STOP', callback_data: 'emergency:confirm' },
            { text: '❌ Cancel', callback_data: 'emergency:cancel' },
          ],
        ],
      },
    });
  }

  /**
   * Callback handler for the emergency stop confirmation button.
   * Dispatches on `params` ("confirm" to halt, "cancel" to dismiss).
   */
  async handleEmergencyCallback(ctx: CallbackContext): Promise<void> {
    const lang = this.chatLang(ctx);

    if (ctx.params === 'confirm') {
      const engine = this.getEngine();
      if (!engine) {
        await ctx.answerCallback(t(lang, 'engineNotInitialized'));
        await ctx.editMessage(t(lang, 'engineNotInitialized'));
        return;
      }
      try {
        await engine.emergencyStop();
        await ctx.answerCallback();
        await ctx.editMessage(t(lang, 'emergencyResult'));
      } catch {
        await ctx.answerCallback(t(lang, 'emergencyResult'));
        await ctx.editMessage(t(lang, 'emergencyResult'));
      }
      return;
    }

    if (ctx.params === 'cancel') {
      await ctx.answerCallback();
      await ctx.editMessage('↩️ Emergency cancelled.');
      return;
    }
  }

  /** /link — operator links a group chat. */
  async handleLink(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if (chatId === undefined || fromId === undefined) return;

    if (ctx.chat?.type !== 'group') {
      await ctx.reply(this.t(ctx, 'linkGroupOnly'));
      return;
    }
    // Ensure the chat exists before linking (group chats may not be registered yet).
    this.store.addChat(chatId, 'group');
    const ok = this.store.linkChat(chatId, fromId);
    await ctx.reply(this.t(ctx, ok ? 'linkSuccess' : 'linkFail'));
  }

  /** /unlink — operator unlinks a group chat. */
  async handleUnlink(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    if (ctx.chat?.type !== 'group') {
      await ctx.reply(this.t(ctx, 'linkGroupOnly'));
      return;
    }
    const ok = this.store.unlinkChat(chatId);
    await ctx.reply(this.t(ctx, ok ? 'unlinkSuccess' : 'unlinkFail'));
  }

  // ---- Formatting helpers ---------------------------------------------------

  private formatPnl(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }

  /**
   * Build an inline keyboard with one button per notification type. Types
   * the member is currently subscribed to are prefixed with ✅; others with ⬜.
   * Buttons are laid out in rows of 2 for a balanced grid.
   *
   * @param currentTypes  The member's active subscription list.
   * @param actionPrefix  The callback_data prefix (e.g. "sub:toggle", "unsub:toggle").
   */
  private buildTypeKeyboard(
    currentTypes: readonly NotificationType[],
    actionPrefix: string,
  ): Array<Array<{ text: string; callback_data: string }>> {
    const buttons = NOTIFICATION_TYPES.map((type) => ({
      text: currentTypes.includes(type) ? `✅ ${type}` : `⬜ ${type}`,
      callback_data: `${actionPrefix}:${type}`,
    }));

    // Split into rows of 2 for a balanced grid.
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    return rows;
  }
}

export type { TelegramBotFeatureOptions };
