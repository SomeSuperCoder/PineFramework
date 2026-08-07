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
  registerBotCallback?: (
    actionPrefix: string,
    handler: BotCallbackHandler,
  ) => void;
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
    transport.registerBotCommand('request', (ctx) => this.handleRequest(ctx));
    transport.registerBotCommand('subscribe', (ctx) => this.handleSubscribe(ctx));
    transport.registerBotCommand('unsubscribe', (ctx) => this.handleUnsubscribe(ctx));
    transport.registerBotCommand('lang', (ctx) => this.handleLang(ctx));
    transport.registerBotCommand('report', (ctx) => this.handleReport(ctx));
    transport.registerBotCommand('stats', (ctx) => this.handleStats(ctx));
    transport.registerBotCommand('stop', (ctx) => this.handleStop(ctx));
    transport.registerBotCommand('emergency', (ctx) => this.handleEmergency(ctx));

    // Inline button callback for /stop confirmation. When the transport
    // supports it, button presses route here instead of the text fallback.
    if (transport.registerBotCallback) {
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

  /** /subscribe [type] — opt (a member of) a chat into notification types. */
  async handleSubscribe(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if (chatId === undefined || fromId === undefined) {
      await ctx.reply(this.t(ctx, 'invalidArgs'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;
    const types = this.resolveTypes(this.args(ctx));
    if (types === null) {
      await ctx.reply(`${this.t(ctx, 'invalidArgs')}\n${this.t(ctx, 'validTypes')}`);
      return;
    }

    this.store.addChat(chatId, isGroup ? 'group' : 'private');
    // Decide success/failure on the EFFECTIVE subscription state — the same
    // view deliver()/isMemberSubscribed reads. memberSubscribe is a union, so
    // the list only ever grows: when already subscribed to every requested type
    // nothing was added, so reply failure rather than faking success.
    const before = this.store.getMemberSubscription(chatId, memberId);
    this.store.memberSubscribe(chatId, memberId, types);
    const after = this.store.getMemberSubscription(chatId, memberId);
    const changed = after.length > before.length;
    await ctx.reply(this.t(ctx, changed ? 'subscribeSuccess' : 'subscribeFailure'));
  }

  /** /unsubscribe [type] — mirror of /subscribe. */
  async handleUnsubscribe(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if (chatId === undefined || fromId === undefined) {
      await ctx.reply(this.t(ctx, 'invalidArgs'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;
    const types = this.resolveTypes(this.args(ctx));
    if (types === null) {
      await ctx.reply(`${this.t(ctx, 'invalidArgs')}\n${this.t(ctx, 'validTypes')}`);
      return;
    }
    // Same effective-state view as /subscribe: memberUnsubscribe only shrinks
    // the list, so a smaller after-list proves at least one requested type was
    // actually removed. When nothing shrank there was nothing to unsubscribe —
    // reply failure instead of claiming a removal that did not happen.
    const before = this.store.getMemberSubscription(chatId, memberId);
    this.store.memberUnsubscribe(chatId, memberId, types);
    const after = this.store.getMemberSubscription(chatId, memberId);
    const changed = after.length < before.length;
    await ctx.reply(this.t(ctx, changed ? 'unsubscribeSuccess' : 'unsubscribeFailure'));
  }

  /** Parses the optional [type] arg: no arg -> ALL, valid type -> [type], else invalid. */
  private resolveTypes(args: string[]): NotificationType[] | null {
    if (args.length === 0) return [...NOTIFICATION_TYPES];
    const [first] = args;
    if (!isNotificationType(first)) return null;
    return [first];
  }

  /** /lang [en|es|ru] — read or change the chat's language. */
  async handleLang(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const arg = this.args(ctx)[0];

    if (arg === undefined) {
      await ctx.reply(this.t(ctx, 'langUsage'));
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

  /** /emergency — operator halt, instant. */
  async handleEmergency(ctx: FeatureCommandContext): Promise<void> {
    if (!(await this.assertController(ctx))) return;
    const lang = this.chatLang(ctx);
    const engine = this.getEngine();
    if (!engine) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }
    try {
      await engine.emergencyStop();
      await ctx.reply(t(lang, 'emergencyResult'));
    } catch {
      await ctx.reply(t(lang, 'emergencyResult'));
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
}

export type { TelegramBotFeatureOptions };