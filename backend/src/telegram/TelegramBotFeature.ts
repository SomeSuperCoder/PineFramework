/**
 * TelegramBotFeature — the policy layer for the PineFramework Telegram bot.
 *
 * Owns the button-only control surface (notifications, language, reports,
 * stop, emergency, operator-access requests), the
 * operator auth gate, and the notification-type routing core. Control is
 * reached EXCLUSIVELY through inline buttons — /start is the only registered
 * command. It is transport-agnostic by design:
 *
 *  - `getEngine` and `onMessage` are injected, so the feature is constructible
 *    and its handlers are drivable WITHOUT a live Telegraf instance (the Test
 *    Engineer drives handlers with fabricated ctx objects).
 *  - `install(transport)` binds every action handler onto a transport that only
 *    needs `registerBotCommand` / `registerBotCallback` seams (see
 *    TelegramService).
 *
 * All user-facing text is resolved through i18n `t()` with the exact dictionary
 * keys in `./i18n.ts`. Controllers and the admin share one operator gate; every
 * other member is bound to the chat-level subscription model owned by
 * TelegramConfigStore.
 *
 * Every control presents inline keyboards via `reply_markup.inline_keyboard`.
 * Button presses route through the `BotCommandTransport.registerBotCallback`
 * seam (action prefix matching) to dedicated callback handlers. Every callback
 * handler calls `answerCallbackQuery` to dismiss the spinner and uses
 * `editMessageText` to update the original message in-place.
 */

import type { BotEngine } from 'pine-framework';
import type {
  TelegramConfigStore,
  NotificationType,
  ChatLanguage,
  TelegramChat,
} from '../store/TelegramConfigStore.js';
import { NOTIFICATION_TYPES } from '../store/TelegramConfigStore.js';
import type { StatsService, SessionSummary } from '../services/StatsService.js';
import { buildGlobalPnlSnapshot, type GlobalPnlSnapshot } from '../services/globalPnl.js';
import { renderGlobalPnlCard, type PnlCardLabels } from './report/renderCard.js';
import {
  formatMoney,
  formatRate,
  formatProfitFactor,
  formatGeneratedAt,
} from './report/format.js';
import { t, isSupportedLanguage, type BotLanguage, type I18nKey } from './i18n.js';
import { escapeMarkdownV2 } from './TelegramService.js';
import { BacktestWizard } from './backtest/wizard.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';
import type { ScriptFileManager } from '../store/ScriptFileManager.js';

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

/**
 * Extras forwarded verbatim to the transport's in-place message edit
 * (`ctx.editMessageText`). `reply_markup` is required: every edit call
 * site must re-attach the original message's inline keyboard, otherwise
 * Telegram silently removes it during the edit.
 */
export interface EditMessageExtras {
  reply_markup: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

/**
 * Extended context for inline button callback handlers. Carries the parsed
 * callback data alongside the base `FeatureCommandContext` fields, plus
 * helpers for answering the callback query and editing the original message.
 *
 * Callback data protocol: `"{action}:{value}"` (max 64 bytes). The `action`
 * prefix is matched against registered prefixes; `params` is everything after
 * the first `:` and holds a single `value` (e.g. `sub:trading`). Handlers
 * parse the value tolerantly via `params.split(':').pop()` so legacy
 * multi-segment keys (`sub:toggle:trading`, `lang:set:en`) keep working until
 * the inline keyboards they were emitted by finish rolling out.
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
   * Extras are forwarded verbatim to the transport; always pass
   * `{ reply_markup: <the original message's keyboard> }` so the inline
   * keyboard survives the edit.
   * @param text   New message text (MarkdownV2).
   * @param extra  Optional extras, forwarded verbatim (see EditMessageExtras).
   */
  editMessage: (text: string, extra?: EditMessageExtras) => Promise<void>;
}

/** A feature-registered callback handler for inline buttons. */
export type BotCallbackHandler = (ctx: CallbackContext) => Promise<void>;

/**
 * One entry in the SSOT action registry. A single logical action may offer a
 * slash-command handler and/or an inline-keyboard callback handler (e.g.
 * /subscribe ↔ its `sub:` buttons). The registry is the single source of truth
 * that `install()` iterates, so commands and their keyboards stay in sync.
 */
interface BotAction {
  /** Stable logical name used as the registry key and by validation. */
  name: string;
  /** Slash command to register (e.g. "subscribe"); omitted for callback-only. */
  command?: string;
  /** Inline-keyboard callback prefix (e.g. "sub"). */
  callbackPrefix?: string;
  /** Handler for the slash-command path. */
  handler?: (ctx: FeatureCommandContext) => Promise<void>;
  /** Handler for the inline-keyboard callback path. */
  callbackHandler?: (ctx: CallbackContext) => Promise<void>;
}

/** The transport surface a feature installs against. */
export interface BotCommandTransport {
  registerBotCommand: (
    command: string,
    handler: (ctx: FeatureCommandContext) => Promise<void> | void,
  ) => void;
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
  /**
   * Injected photo transport (e.g. a PNG buffer rendered by the report card
   * pipeline); returns true when the chat accepted the photo. Optional — the
   * feature degrades to "not delivered" (false) when absent.
   */
  onPhoto?: (chatId: number, buffer: Buffer, caption?: string) => Promise<boolean>;
  /**
   * Strategy library accessor for the /backtest wizard. Optional — test
   * constructions of sibling flows omit it; the wizard degrades to a
   * localized empty-library state. The production composition root always
   * injects the live ScriptFileManager.
   */
  scripts?: ScriptFileManager;
  /** Optional persistent OHLCV cache, forwarded to the /backtest producer seam. */
  diskCache?: DiskOHLCVCache;
  /** Built-in scripts directory (test_indicators) — forwarded to the /backtest
   *  wizard so built-in strategies appear alongside user strategies (mirrors
   *  the frontend's user+built-in merge). Optional — sibling-flow test
   *  constructions omit it. */
  builtInScriptsDir?: string;
}

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Maps each notification type to its localized display-name i18n key. */
const NOTIFICATION_TYPE_KEYS: Record<NotificationType, I18nKey> = {
  trading: 'notifTypeTrading',
  position_open: 'notifTypePositionOpen',
  position_close: 'notifTypePositionClose',
  report: 'notifTypeReport',
  daily: 'notifTypeDaily',
  error: 'notifTypeError',
  bot_lifecycle: 'notifTypeBotLifecycle',
};

/**
 * The callback prefixes the feature's inline keyboards EMIT — the single
 * source of truth for `validateActionRegistry`. The union of every keyboard
 * emitter below: /start dashboard (notif, lang, report, stop, emergency,
 * request), the back-to-dashboard rows (start),
 * langPickerKeyboard (lang, start), stopConfirmKeyboard (stop),
 * emergencyConfirmKeyboard (emergency), buildTypeKeyboard callers
 * (sub, unsub), and the manage notifications submenu (notif). When a new
 * inline button is added to a keyboard, its prefix must be added here (and
 * the action registered in the SSOT registry) so the validator covers it
 * automatically — never maintain a parallel list.
 */
const EMITTED_CALLBACK_PREFIXES: readonly string[] = [
  'sub',
  'unsub',
  'lang',
  'report',
  'stop',
  'emergency',
  'notif',
  'start',
  'request',
  'bt',
];

/**
 * Max caption length (chars) for the report text when attached to the PnL
 * card photo. Telegram's hard caption limit is 1024, but sendPhoto escapes
 * the caption to MarkdownV2 (adding backslashes), so we guard against the
 * RAW text at 900: 1024 hard cap minus escape-growth headroom. Long reports
 * fall back to a text message + short-caption photo instead of a truncated
 * caption.
 */
const REPORT_CAPTION_MAX_LENGTH = 900;

/**
 * Inline keyboards re-attached on every in-place message edit. Each edit call
 * site must pass the SAME keyboard the original message carried, otherwise
 * Telegram removes the inline buttons when the text is edited. Labels resolve
 * via i18n, so each takes the chat's language.
 */
function stopConfirmKeyboard(lang: BotLanguage): EditMessageExtras['reply_markup'] {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'btnConfirm'), callback_data: 'stop:confirm' },
        { text: t(lang, 'btnCancel'), callback_data: 'stop:cancel' },
      ],
    ],
  };
}

/**
 * Back-to-dashboard row appended to every inline submenu keyboard, so users
 * can always return to the /start dashboard without re-sending /start.
 */
function backToMainRow(lang: BotLanguage): Array<{ text: string; callback_data: string }> {
  return [{ text: t(lang, 'btnBackMain'), callback_data: 'start:menu' }];
}

/** Language picker keyboard shown by /lang and the lang:menu callback. */
function langPickerKeyboard(lang: BotLanguage): EditMessageExtras['reply_markup'] {
  return {
    inline_keyboard: [
      [
        { text: '🇬🇧 English', callback_data: 'lang:en' },
        { text: '🇪🇸 Español', callback_data: 'lang:es' },
        { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
      ],
      backToMainRow(lang),
    ],
  };
}

/** Emergency confirmation keyboard shown by the dashboard "Emergency" button. */
function emergencyConfirmKeyboard(lang: BotLanguage): EditMessageExtras['reply_markup'] {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'btnEmergencyStop'), callback_data: 'emergency:confirm' },
        { text: t(lang, 'btnCancel'), callback_data: 'emergency:cancel' },
      ],
    ],
  };
}

export class TelegramBotFeature {
  private readonly store: TelegramConfigStore;
  private readonly stats?: StatsService | null;
  private readonly getEngine: () => BotEngine | null;
  private readonly onMessage?: (chatId: number, message: string) => Promise<boolean>;
  private readonly onPhoto?: (chatId: number, buffer: Buffer, caption?: string) => Promise<boolean>;
  /** /backtest inline-keyboard wizard — owns the bt:* callback family. */
  private readonly backtestWizard: BacktestWizard;

  /**
   * SSOT action registry — the single source of truth for every control and
   * its inline-button callback. `install()` iterates this instead of a
   * hardcoded wire-up list, so a control and its keyboard can never drift
   * drift apart. /start and /backtest are the only registered commands; every
   * other control is reached exclusively through inline buttons.
   */
  private readonly actions: BotAction[] = [
    {
      name: 'start',
      command: 'start',
      handler: (ctx) => this.handleStart(ctx),
      // The back-to-dashboard rows ('start:menu') re-render the /start
      // dashboard in-place via editMessage.
      callbackPrefix: 'start',
      callbackHandler: (ctx) => this.handleDashboardCallback(ctx),
    },
    {
      // Callback-only: the dashboard "Request access" button submits a
      // self-service operator-access request for non-operators.
      name: 'request',
      callbackPrefix: 'request',
      callbackHandler: (ctx) => this.handleRequestCallback(ctx),
    },
    {
      // Callback-only: the subscribe toggle buttons (sub:<type>) and the
      // dashboard notification entry points.
      name: 'subscribe',
      callbackPrefix: 'sub',
      callbackHandler: (ctx) => this.handleSubscribeCallback(ctx),
    },
    {
      name: 'unsubscribe',
      callbackPrefix: 'unsub',
      callbackHandler: (ctx) => this.handleUnsubscribeCallback(ctx),
    },
    {
      // Callback-only action: the /start dashboard "Manage notifications"
      // button (notif:menu) and the submenu's toggle/all/none buttons.
      name: 'notifications',
      callbackPrefix: 'notif',
      callbackHandler: (ctx) => this.handleNotificationsCallback(ctx),
    },
    {
      name: 'lang',
      callbackPrefix: 'lang',
      callbackHandler: (ctx) => this.handleLangCallback(ctx),
    },
    {
      name: 'report',
      callbackPrefix: 'report',
      callbackHandler: (ctx) => this.handleReportCallback(ctx),
    },
    {
      name: 'stop',
      callbackPrefix: 'stop',
      callbackHandler: (ctx) => this.handleStopCallback(ctx),
    },
    {
      name: 'emergency',
      callbackPrefix: 'emergency',
      callbackHandler: (ctx) => this.handleEmergencyCallback(ctx),
    },
    {
      // /backtest — the inline-keyboard backtest wizard (strategy -> symbol ->
      // timeframe -> days -> commission method -> run). The wizard owns the
      // entire bt:* callback family; the feature only routes to it.
      name: 'backtest',
      command: 'backtest',
      handler: (ctx) => this.backtestWizard.start(ctx),
      callbackPrefix: 'bt',
      callbackHandler: (ctx) => this.backtestWizard.handleCallback(ctx),
    },
  ];

  constructor(opts: TelegramBotFeatureOptions) {
    this.store = opts.store;
    this.stats = opts.stats ?? null;
    this.getEngine = opts.getEngine;
    this.onMessage = opts.onMessage;
    this.onPhoto = opts.onPhoto;
    // The photo transport is the feature's private sendPhoto (never throws,
    // returns false on failure) — the wizard's fallback path mirrors
    // handleReport's. sendPhoto is a method reference resolved lazily at call
    // time, so construction order is irrelevant.
    this.backtestWizard = new BacktestWizard({
      scripts: opts.scripts,
      builtInScriptsDir: opts.builtInScriptsDir,
      diskCache: opts.diskCache,
      getChatLanguage: (chatId) => this.store.getChatLanguage(chatId),
      onPhoto: (chatId, buffer, caption) => this.sendPhoto(chatId, buffer, caption),
    });
  }

  // ---- Transport wiring ----------------------------------------------------

  /**
   * Register every supported action handler against a transport. Safe to call
   * before the transport has launched: the seam defers/attaches them.
   */
  install(transport: BotCommandTransport): void {
    // Iterate the SSOT action registry: every action and its inline callback
    // is bound here. Commands are intentionally limited to /start and
    // /backtest — every other control is reached exclusively through inline
    // buttons.
    this.registerActions(transport);

    // Fail fast: every inline-button prefix the feature *emits* (dashboard,
    // type keyboards, lang/stop/emergency pickers) must resolve to a
    // registered action. A dead keyboard button becomes a boot error instead
    // of a silent no-op at click time.
    this.validateActionRegistry();
  }

  /**
   * Bind every action in the SSOT registry onto the transport. Command handlers
   * go through `registerBotCommand`; actions exposing a `callbackPrefix` go
   * through `registerBotCallback` — either their dedicated `callbackHandler` or
   * (for simple value-agnostic actions) the shared command handler.
   */
  private registerActions(transport: BotCommandTransport): void {
    for (const action of this.actions) {
      // Command path.
      if (action.command && action.handler !== undefined) {
        const handler = action.handler;
        transport.registerBotCommand(action.command, (ctx) => handler(ctx));
      }
      // Callback path. A dedicated callbackHandler wins; otherwise fall back to
      // the shared command handler for simple, value-agnostic actions.
      if (action.callbackPrefix && transport.registerBotCallback) {
        const dedicated = action.callbackHandler;
        const shared = action.handler;
        if (dedicated) {
          transport.registerBotCallback(action.callbackPrefix, dedicated);
        } else if (shared) {
          // CallbackContext extends FeatureCommandContext, so the command
          // handler is structurally compatible with the callback seam.
          transport.registerBotCallback(action.callbackPrefix, (ctx) => shared(ctx));
        }
      }
    }
  }

  /**
   * Assert every inline-button prefix the feature's keyboards emit maps to a
   * registered action. The emitted set is derived from the single shared
   * constant `EMITTED_CALLBACK_PREFIXES` (the keyboards' actual output), not a
   * parallel hand-maintained array; the registry's `callbackPrefix` fields are
   * the other side of the equation. Throws at install time if any emitted
   * prefix has no backing action — turning a dead button into a boot failure
   * (B3 / B5).
   */
  private validateActionRegistry(): void {
    const registeredPrefixes = new Set(
      this.actions.map((a) => a.callbackPrefix).filter((p): p is string => p !== undefined),
    );
    for (const prefix of EMITTED_CALLBACK_PREFIXES) {
      if (!registeredPrefixes.has(prefix)) {
        throw new Error(
          `TelegramBotFeature install failed: inline button prefix "${prefix}" is emitted ` +
            'by keyboards but has no registered callbackPrefix in the action registry.',
        );
      }
    }
  }

  /**
   * Catch-all for text that matched no known command.
   *
   * ⚠️ INTENTIONALLY UNWIRED — this bot is button-only by directive. The
   * production `install` surface registers no text handler, so nothing routes
   * here. Do NOT re-introduce a text seam (bot.on('text') /
   * registerBotText) to wire this without revisiting the button-only
   * directive first.
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

  // ---- Photo transport ------------------------------------------------------

  /**
   * Send a photo (PNG buffer, e.g. the rendered global PnL card) to a chat via
   * the injected `onPhoto` transport. Returns false when no photo transport was
   * injected (feature constructed without photo support) or the transport
   * failed — callers treat false as "not delivered", mirroring `deliver`'s
   * counting semantics. Never throws.
   */
  private async sendPhoto(chatId: number, buffer: Buffer, caption?: string): Promise<boolean> {
    if (!this.onPhoto) return false;
    try {
      return await this.onPhoto(chatId, buffer, caption);
    } catch {
      return false;
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

  // ---- Control handlers -----------------------------------------------------

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
      // Auto-link: a chat is linked the first time the bot is started there.
      // Private chats link on creation; a group links here, recording the
      // starter. linkChat is a no-op on non-groups, so the branch is safe.
      if (isGroup) {
        this.store.linkChat(chatId, ctx.from?.id ?? 0);
      }
    }

    // Operator-only row (Stop / Emergency) is hidden from non-operators. The
    // Stop / Emergency callbacks assert controller access — this is defense
    // in depth on visibility only.
    const isOperator = ctx.from?.id !== undefined && this.isAdminOrController(ctx.from.id);

    await ctx.reply(t(lang, 'startWelcome'), {
      reply_markup: {
        inline_keyboard: this.buildDashboardKeyboard(isOperator, lang),
      },
    });
  }

  /**
   * Inline callback for the back-to-dashboard "Main menu" buttons. Re-renders
   * the /start dashboard in-place (no new message), honoring the same
   * operator-row visibility as /start.
   */
  async handleDashboardCallback(ctx: CallbackContext): Promise<void> {
    await ctx.answerCallback();
    const isOperator = ctx.from?.id !== undefined && this.isAdminOrController(ctx.from.id);
    const lang = this.chatLang(ctx);
    await ctx.editMessage(this.t(ctx, 'startWelcome'), {
      reply_markup: {
        inline_keyboard: this.buildDashboardKeyboard(isOperator, lang),
      },
    });
  }

  /**
   * Callback handler for the dashboard "Request access" button. Non-operators
   * submit a self-service operator-access request (the same store mutation the
   * old /request command performed); operators get a friendly "already
   * granted" confirmation.
   */
  async handleRequestCallback(ctx: CallbackContext): Promise<void> {
    await ctx.answerCallback();
    if (ctx.params !== 'go') return;
    const lang = this.chatLang(ctx);
    const mainRow = backToMainRow(lang);

    const username = ctx.from?.username ?? '';
    const firstName = ctx.from?.first_name ?? '';
    const fromId = ctx.from?.id;

    if (fromId === undefined) {
      await ctx.editMessage(this.t(ctx, 'invalidArgs'), {
        reply_markup: { inline_keyboard: [mainRow] },
      });
      return;
    }
    if (this.store.isController(fromId) || fromId === this.store.getAdmin()?.userId) {
      await ctx.editMessage(this.t(ctx, 'requestAlreadyGranted'), {
        reply_markup: { inline_keyboard: [mainRow] },
      });
      return;
    }
    if (this.store.getRequests().some((r) => r.userId === fromId)) {
      await ctx.editMessage(this.t(ctx, 'requestAlreadyPending'), {
        reply_markup: { inline_keyboard: [mainRow] },
      });
      return;
    }
    this.store.addRequest(fromId, username, firstName);
    await ctx.editMessage(this.t(ctx, 'requestSubmitted'), {
      reply_markup: { inline_keyboard: [mainRow] },
    });
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
    const lang = this.chatLang(ctx);

    // "menu" from /start dashboard → show toggle keyboard.
    if (ctx.params === 'menu') {
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'subscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'sub', lang),
        },
      });
      return;
    }

    const type = ctx.params.split(':').pop() ?? '';
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
        inline_keyboard: this.buildTypeKeyboard(updated, 'sub', lang),
      },
    });
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
    const lang = this.chatLang(ctx);

    // "menu" from /start dashboard → show toggle keyboard.
    if (ctx.params === 'menu') {
      const currentTypes = this.store.getMemberSubscription(chatId, memberId);
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'unsubscribeSuccess'), {
        reply_markup: {
          inline_keyboard: this.buildTypeKeyboard(currentTypes, 'unsub', lang),
        },
      });
      return;
    }

    const type = ctx.params.split(':').pop() ?? '';
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
        inline_keyboard: this.buildTypeKeyboard(updated, 'unsub', lang),
      },
    });
  }

  /**
   * Callback handler for the "Manage notifications" dashboard button. Shows
   * the per-type toggle submenu in-place, with bulk Enable all / Disable all
   * controls and a back-to-dashboard row. Every mutation re-renders the
   * submenu with the updated checkbox state (bug: green checkboxes after
   * unsubscribing).
   */
  async handleNotificationsCallback(ctx: CallbackContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;

    if (!chatId || fromId === undefined) {
      await ctx.answerCallback();
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    const memberId = isGroup ? fromId : chatId;
    this.store.addChat(chatId, isGroup ? 'group' : 'private');

    // "menu" from the dashboard → show the toggle submenu.
    if (ctx.params === 'menu') {
      await ctx.answerCallback();
      await this.editNotificationsMenu(ctx, chatId, memberId);
      return;
    }

    // Bulk controls: subscribe / unsubscribe every type at once.
    if (ctx.params === 'all' || ctx.params === 'none') {
      if (ctx.params === 'all') {
        this.store.memberSubscribe(chatId, memberId, [...NOTIFICATION_TYPES]);
      } else {
        this.store.memberUnsubscribe(chatId, memberId, [...NOTIFICATION_TYPES]);
      }
      await ctx.answerCallback();
      await this.editNotificationsMenu(ctx, chatId, memberId);
      return;
    }

    // Single type → toggle.
    const type = ctx.params.split(':').pop() ?? '';
    if (!isNotificationType(type)) {
      await ctx.answerCallback();
      return;
    }
    const current = this.store.getMemberSubscription(chatId, memberId);
    if (current.includes(type)) {
      this.store.memberUnsubscribe(chatId, memberId, [type]);
    } else {
      this.store.memberSubscribe(chatId, memberId, [type]);
    }

    await ctx.answerCallback();
    await this.editNotificationsMenu(ctx, chatId, memberId);
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
    const lang = this.chatLang(ctx);

    // "menu" from /start dashboard → show language picker.
    if (ctx.params === 'menu') {
      await ctx.answerCallback();
      await ctx.editMessage(this.t(ctx, 'langUsage'), {
        reply_markup: langPickerKeyboard(lang),
      });
      return;
    }

    const langSelected = ctx.params.split(':').pop() as BotLanguage;
    if (!isSupportedLanguage(langSelected)) {
      await ctx.answerCallback(this.t(ctx, 'langInvalid'));
      return;
    }

    const isGroup = ctx.chat?.type === 'group';
    this.store.addChat(chatId, isGroup ? 'group' : 'private');
    this.store.setChatLanguage(chatId, langSelected);
    await ctx.answerCallback();
    await ctx.editMessage(this.t(ctx, 'langChanged', { lang: langSelected }), {
      reply_markup: langPickerKeyboard(langSelected),
    });
  }

  /**
   * Report — global PnL recap (any chat member). Reached via the dashboard
   * "Report" button; `handleReportCallback` delegates here.
   *
   * Builds the GlobalPnlSnapshot from the live engine + session stats, renders
   * the data-rich emojified text message, and attaches the real-time PnL card
   * PNG when a photo transport is available. The text is the guarantee, the
   * image is a bonus: any render/transport failure falls back to the full text
   * message — never a silent death. Short reports ride on the photo as its
   * caption; long ones are sent as text first, then the image with the bare
   * header as caption (Telegram captions cap at 1024 chars).
   */
  async handleReport(ctx: FeatureCommandContext): Promise<void> {
    const lang = this.chatLang(ctx);

    if (!this.stats) {
      await ctx.reply(t(lang, 'engineNotInitialized'));
      return;
    }

    const engine = this.getEngine();
    const summary = this.stats.getSessionSummary();
    const groupedStats = this.stats.getGroupedStats('asset');
    const perSymbolStats = groupedStats
      ? Object.entries(groupedStats).map(([key, stats]) => ({ key, stats }))
      : undefined;

    const snapshot = buildGlobalPnlSnapshot({
      summary,
      positions: engine
        ? engine.positions.map((p) => ({ symbol: p.symbol, unrealizedPnl: p.unrealizedPnl }))
        : [],
      engineState: engine?.state ?? null,
      perSymbolStats,
    });

    const text = this.buildReportText(lang, snapshot, summary, engine);
    const chatId = ctx.chat?.id;

    if (chatId !== undefined) {
      try {
        const buf = await renderGlobalPnlCard(snapshot, this.buildCardLabels(lang, snapshot));
        if (text.length <= REPORT_CAPTION_MAX_LENGTH) {
          // Short report: the photo carries the full text as its caption.
          if (await this.sendPhoto(chatId, buf, text)) return;
          await ctx.reply(escapeMarkdownV2(`${text}\n${t(lang, 'reportImageError')}`), {
            parse_mode: 'MarkdownV2' as const,
          });
          return;
        }
        // Long report: full text first, then the image with the bare header.
        await ctx.reply(escapeMarkdownV2(text), { parse_mode: 'MarkdownV2' as const });
        if (await this.sendPhoto(chatId, buf, t(lang, 'reportHeader'))) return;
        await ctx.reply(t(lang, 'reportImageError'));
        return;
      } catch {
        // renderGlobalPnlCard threw (e.g. sharp unavailable) — fall through
        // to the text-only reply below.
      }
    }

    await ctx.reply(escapeMarkdownV2(text), { parse_mode: 'MarkdownV2' as const });
  }

  /**
   * Inline callback for the /start dashboard "Report" button. Dispatches the
   * reserved `show` action onto the report logic, then answers the callback to
   * dismiss the Telegram spinner. Unknown params are a graceful no-op (never
   * throw).
   */
  async handleReportCallback(ctx: CallbackContext): Promise<void> {
    if (ctx.params !== 'show') {
      await ctx.answerCallback();
      return;
    }
    await ctx.answerCallback();
    // ctx (CallbackContext) satisfies FeatureCommandContext, so handleReport
    // runs verbatim against the same context.
    await this.handleReport(ctx);
  }

  /**
   * Build the full report message from the global PnL snapshot: header, total,
   * realized/unrealized split, headline metrics, top movers, recent trades,
   * engine status and the generated-at stamp. Uses the shared formatters
   * (format.ts) so text and image can never disagree about a rendered value.
   * Sections with no data (no movers, no recent trades) are omitted; the
   * headline zeros still render.
   */
  private buildReportText(
    lang: BotLanguage,
    snapshot: GlobalPnlSnapshot,
    summary: SessionSummary,
    engine: BotEngine | null,
  ): string {
    const lines: string[] = [
      t(lang, 'reportHeader'),
      t(lang, 'reportTotal', { total: formatMoney(snapshot.totalPnl) }),
      t(lang, 'reportSplit', {
        realized: formatMoney(snapshot.realizedPnl),
        unrealized: formatMoney(snapshot.unrealizedPnl),
      }),
      t(lang, 'reportMetrics', {
        count: snapshot.tradeCount,
        winRate: formatRate(snapshot.winRate),
        pf: formatProfitFactor(snapshot.profitFactor),
      }),
      t(lang, 'reportTradeStats', {
        avg: formatMoney(snapshot.avgTrade),
        dd: formatMoney(snapshot.maxDrawdown),
        fees: formatMoney(snapshot.totalFees),
      }),
    ];

    if (snapshot.perSymbol.length > 0) {
      lines.push(t(lang, 'reportMovers'));
      for (const { symbol, pnl } of snapshot.perSymbol) {
        lines.push(t(lang, 'reportSymbolRow', { symbol, pnl: formatMoney(pnl) }));
      }
    }

    if (summary.recent.length > 0) {
      lines.push(t(lang, 'reportRecent'));
      for (const trade of summary.recent) {
        lines.push(
          t(lang, 'reportRow', {
            symbol: trade.symbol,
            side: trade.side,
            pnl: this.formatPnl(trade.realizedPnl),
          }),
        );
      }
    }

    const stateKey: I18nKey =
      snapshot.engineState === 'running'
        ? 'reportEngineRunning'
        : snapshot.engineState === 'stopped'
          ? 'reportEngineStopped'
          : snapshot.engineState === 'error'
            ? 'reportEngineError'
            : 'reportEngineUnknown';

    lines.push(
      t(lang, 'reportEngine', {
        state: t(lang, stateKey),
        pairs: engine?.config?.pairs?.length ?? 0,
        open: snapshot.openPositionsCount,
      }),
    );
    lines.push(t(lang, 'reportGenerated', { time: formatGeneratedAt(snapshot.generatedAt, lang) }));

    return lines.join('\n');
  }

  /**
   * Build the localized label map the PnL card renderer consumes. The renderer
   * stays pure (no i18n import); every user-facing card string is resolved
   * here through `t(lang, ...)` and passed in as a plain argument.
   */
  private buildCardLabels(lang: BotLanguage, snapshot: GlobalPnlSnapshot): PnlCardLabels {
    return {
      brand: t(lang, 'cardBrand'),
      global: t(lang, 'cardGlobal'),
      netRealizedUnrealized: t(lang, 'cardNetRealizedUnrealized'),
      realized: t(lang, 'cardRealized'),
      unrealized: t(lang, 'cardUnrealized'),
      symbolPnl: t(lang, 'cardSymbolPnl'),
      topMovers: t(lang, 'cardTopMovers'),
      winRate: t(lang, 'cardWinRate'),
      profitFactor: t(lang, 'cardProfitFactor'),
      avgTrade: t(lang, 'cardAvgTrade'),
      maxDrawdown: t(lang, 'cardMaxDrawdown'),
      openPositions: t(lang, 'cardOpenPositions'),
      generated: t(lang, 'cardGenerated', {
        time: formatGeneratedAt(snapshot.generatedAt, lang),
      }),
      emptyState: t(lang, 'cardEmptyState'),
      engineState: {
        running: t(lang, 'cardEngineRunning'),
        stopped: t(lang, 'cardEngineStopped'),
        error: t(lang, 'cardEngineError'),
        unknown: t(lang, 'cardEngineUnknown'),
      },
      footer: t(lang, 'cardFooter', { report: t(lang, 'cardReportWord') }),
    };
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
    // Stop controls are operator-scoped: deny any non-operator who manages to
    // tap the confirmation button, and dismiss the spinner so the denial reads.
    await ctx.answerCallback();
    if (!(await this.assertController(ctx))) return;
    const { params } = ctx;

    if (params === 'ask') {
      // Dashboard "Stop" must ask before acting — the same two-step flow as
      // the old /stop command. Confirmation is button-only now: no text path
      // is armed, the "confirm" callback is the only way to stop the engine.
      await ctx.editMessage(t(lang, 'stopConfirmRequest'), {
        reply_markup: stopConfirmKeyboard(lang),
      });
      return;
    }

    if (params === 'confirm') {
      const engine = this.getEngine();
      if (!engine || engine.state !== 'Running') {
        await ctx.answerCallback(t(lang, 'stopCancelled'));
        await ctx.editMessage(t(lang, 'stopCancelled'), { reply_markup: stopConfirmKeyboard(lang) });
        return;
      }

      try {
        await engine.stop();
        await ctx.answerCallback();
        await ctx.editMessage(t(lang, 'stopConfirmSuccess'), {
          reply_markup: stopConfirmKeyboard(lang),
        });
      } catch {
        await ctx.answerCallback(t(lang, 'stopCancelled'));
        await ctx.editMessage(t(lang, 'stopCancelled'), { reply_markup: stopConfirmKeyboard(lang) });
      }
      return;
    }

    if (params === 'cancel') {
      await ctx.answerCallback();
      await ctx.editMessage(t(lang, 'stopCancelled'), { reply_markup: stopConfirmKeyboard(lang) });
      return;
    }
  }

  /**
   * Callback handler for the emergency stop confirmation button.
   * Dispatches on `params` ("confirm" to halt, "cancel" to dismiss).
   */
  async handleEmergencyCallback(ctx: CallbackContext): Promise<void> {
    // Defense in depth: /emergency is operator-gated, but the callback itself
    // must ALSO reject non-operators before it can halt the engine.
    await ctx.answerCallback();
    if (!(await this.assertController(ctx))) return;
    const lang = this.chatLang(ctx);

    if (ctx.params === 'ask') {
      // Dashboard "Emergency" must ask before acting — the same two-step flow
      // as /emergency.
      await ctx.editMessage(t(lang, 'emergencyResult'), {
        reply_markup: emergencyConfirmKeyboard(lang),
      });
      return;
    }

    if (ctx.params === 'confirm') {
      const engine = this.getEngine();
      if (!engine) {
        await ctx.answerCallback(t(lang, 'engineNotInitialized'));
        await ctx.editMessage(t(lang, 'engineNotInitialized'), {
          reply_markup: emergencyConfirmKeyboard(lang),
        });
        return;
      }
      try {
        await engine.emergencyStop();
        await ctx.answerCallback();
        await ctx.editMessage(t(lang, 'emergencyResult'), {
          reply_markup: emergencyConfirmKeyboard(lang),
        });
      } catch {
        await ctx.answerCallback(t(lang, 'emergencyResult'));
        await ctx.editMessage(t(lang, 'emergencyResult'), {
          reply_markup: emergencyConfirmKeyboard(lang),
        });
      }
      return;
    }

    if (ctx.params === 'cancel') {
      await ctx.answerCallback();
      await ctx.editMessage(t(lang, 'emergencyCancelled'), {
        reply_markup: emergencyConfirmKeyboard(lang),
      });
      return;
    }
  }

  // ---- Formatting helpers ---------------------------------------------------

  private formatPnl(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }

  /**
   * Build the /start dashboard keyboard. Shared by `handleStart` (reply) and
   * `handleDashboardCallback` (in-place edit of the back-to-dashboard rows),
   * so the two can never drift apart.
   *
   * @param isOperator  When true, the operator-only row (Stop / Emergency) is
   *                    included; otherwise the self-service "Request access"
   *                    row is shown instead.
   * @param lang        Chat language for every button label.
   */
  private buildDashboardKeyboard(
    isOperator: boolean,
    lang: BotLanguage,
  ): Array<Array<{ text: string; callback_data: string }>> {
    return [
      [{ text: t(lang, 'dashBtnManage'), callback_data: 'notif:menu' }],
      [
        { text: t(lang, 'dashBtnLang'), callback_data: 'lang:menu' },
        { text: t(lang, 'dashBtnReport'), callback_data: 'report:show' },
      ],
      ...(isOperator
        ? [
            [
              { text: t(lang, 'dashBtnStop'), callback_data: 'stop:ask' },
              { text: t(lang, 'dashBtnEmergency'), callback_data: 'emergency:ask' },
            ],
          ]
        : [[{ text: t(lang, 'dashBtnRequest'), callback_data: 'request:go' }]]),
      // Backtest is available to EVERY user (not operator-gated) — the
      // /backtest command and wizard are part of the shared surface. The
      // `bt` prefix is registered in the action registry and validated at
      // install; bt:start routes through the wizard's handleCallback.
      [{ text: t(lang, 'dashBtnBacktest'), callback_data: 'bt:start' }],
    ];
  }

  /**
   * Build the "Manage notifications" submenu keyboard: one toggle per
   * notification type, a bulk Enable all / Disable all row, then the
   * back-to-dashboard row. Reuses `buildTypeKeyboard` so the toggles share
   * the exact visuals of the /subscribe /unsubscribe keyboards.
   */
  private buildNotificationsKeyboard(
    currentTypes: readonly NotificationType[],
    lang: BotLanguage,
  ): Array<Array<{ text: string; callback_data: string }>> {
    // buildTypeKeyboard ends with the back-to-dashboard row; keep it last and
    // insert the bulk controls just above it.
    const rows = this.buildTypeKeyboard(currentTypes, 'notif', lang);
    const backRow = rows[rows.length - 1];
    return [
      ...rows.slice(0, -1),
      [
        { text: t(lang, 'btnNotifEnableAll'), callback_data: 'notif:all' },
        { text: t(lang, 'btnNotifDisableAll'), callback_data: 'notif:none' },
      ],
      backRow,
    ];
  }

  /** Re-render the "Manage notifications" submenu in-place with current state. */
  private async editNotificationsMenu(
    ctx: CallbackContext,
    chatId: number,
    memberId: number,
  ): Promise<void> {
    const currentTypes = this.store.getMemberSubscription(chatId, memberId);
    const lang = this.chatLang(ctx);
    await ctx.editMessage(this.t(ctx, 'notificationsMenuTitle'), {
      reply_markup: {
        inline_keyboard: this.buildNotificationsKeyboard(currentTypes, lang),
      },
    });
  }

/**
 * Build an inline keyboard with one button per notification type. Types
 * the member is currently subscribed to are prefixed with ✅; others with ⬜.
 * Buttons are laid out in rows of 2 for a balanced grid, followed by the
 * back-to-dashboard row.
 *
 * @param currentTypes  The member's active subscription list.
 * @param actionPrefix  The callback_data prefix (e.g. "sub", "unsub", "notif").
 * @param lang          Chat language for the type display names + back row.
 */
private buildTypeKeyboard(
    currentTypes: readonly NotificationType[],
    actionPrefix: string,
    lang: BotLanguage,
  ): Array<Array<{ text: string; callback_data: string }>> {
    const buttons = NOTIFICATION_TYPES.map((type) => ({
      text: currentTypes.includes(type)
        ? `✅ ${t(lang, NOTIFICATION_TYPE_KEYS[type])}`
        : `⬜ ${t(lang, NOTIFICATION_TYPE_KEYS[type])}`,
      callback_data: `${actionPrefix}:${type}`,
    }));

    // Split into rows of 2 for a balanced grid.
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }
    rows.push(backToMainRow(lang));
    return rows;
  }
}

export type { TelegramBotFeatureOptions };
