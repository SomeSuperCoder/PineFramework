/**
 * wizard.ts — the /backtest inline-keyboard wizard (OpenSpec telegram-backtest-flow).
 *
 * Collects strategy -> symbol -> timeframe -> days-back -> commission method ->
 * run through layered inline keyboards that EDIT one message in place, then
 * runs the producer seam (runTelegramBacktest, contract M2) fire-and-forget and
 * sends the result card (renderBacktestCard, contract M1) via the injected
 * photo transport.
 *
 * Design decisions:
 *  - Per-chat session Map; one session per chat, replaced by /backtest or
 *    Restart. No state-machine library — the established layered-callback
 *    pattern (dashboard / notifications).
 *  - Strategy selection uses INDEX tokens (`bt:strat:0`) against a snapshot of
 *    the strategy list taken when the session starts — never UUIDs (Telegram
 *    callback_data is capped at 64 bytes).
 *  - Stale taps on superseded step buttons are ignored with a silent ack and
 *    the active session state is preserved. Back / Restart / Cancel are always
 *    reachable (navigation is never gated by the stale guard).
 *  - The run is NEVER awaited inside the callback handler: ack + edit to a
 *    localized "running…" state, then fire-and-forget. A second run while one
 *    is in flight is rejected by a per-chat single-run guard.
 *  - All user-facing text comes from i18n; emoji live inside the strings.
 */

import type { BacktestApiResult, BacktestCommissionMethodId } from '../../backtest-contract.js';
import type { DiskOHLCVCache } from '../../cache/DiskOHLCVCache.js';
import type { ScriptEntry, ScriptFileManager } from '../../store/ScriptFileManager.js';
import type { BotLanguage, I18nKey } from '../i18n.js';
import { t } from '../i18n.js';
import type { CallbackContext, FeatureCommandContext } from '../TelegramBotFeature.js';
import { escapeMarkdownV2 } from '../TelegramService.js';
import { formatGeneratedAt, formatMoney, formatProfitFactor } from '../report/format.js';
import { renderBacktestCard, type BacktestCardLabels } from '../report/backtestCard.js';
import {
  BACKTEST_METHODS,
  BACKTEST_SYMBOLS,
  BACKTEST_TIMEFRAMES,
  daysKeyboard,
  isWizardStep,
  methodKeyboard,
  methodLabel,
  runKeyboard,
  runningKeyboard,
  strategyKeyboard,
  symbolKeyboard,
  terminalKeyboard,
  timeframeDisplay,
  timeframeKeyboard,
  type WizardStep,
} from './keyboards.js';
import {
  runTelegramBacktest,
  type TelegramBacktestErrorCode,
  type TelegramBacktestParams,
} from './runTelegramBacktest.js';

/** Per-chat wizard state. Partial settings accumulate as the user advances. */
interface BacktestSession {
  /** The step the chat's message currently shows (stale-tap guard). */
  step: WizardStep;
  /** Strategy list snapshot — `bt:strat:<index>` resolves against THIS array. */
  strategies: ScriptEntry[];
  strategyIndex?: number;
  symbol?: string;
  timeframe?: string;
  daysBack?: number;
  commissionMethod?: BacktestCommissionMethodId;
  /** Single-run guard per chat: true while a run is in flight. */
  running: boolean;
}

/** Localized message key per producer-seam error code (contract M2). */
const ERROR_CODE_KEYS: Record<TelegramBacktestErrorCode, I18nKey> = {
  NO_STRATEGIES: 'backtestErrNoStrategies',
  STRATEGY_NOT_FOUND: 'backtestErrStrategyNotFound',
  NOT_A_STRATEGY: 'backtestErrNotAStrategy',
  TOO_MANY_BARS: 'backtestErrTooManyBars',
  INVALID_SETTINGS: 'backtestErrInvalidSettings',
  FEE_FETCH_FAILED: 'backtestErrFeeFetch',
  ENGINE_FAILED: 'backtestErrEngine',
  DATA_FETCH_FAILED: 'backtestErrDataFetch',
};

/**
 * Render a PERCENT VALUE (68.4 = 68.4%) with 1 decimal and an optional +/−
 * sign. Backtest metrics are percent values, NOT 0..1 fractions — formatRate()
 * must never see them (same rule as backtestCard's formatPercentValue).
 */
function percentValue(pct: number, signed = false): string {
  const r = Math.round(pct * 10) / 10;
  const body = r.toFixed(1).replace(/\.0$/, '');
  const sign = signed ? (r > 0 ? '+' : r < 0 ? '-' : '') : '';
  return `${sign}${body}%`;
}

export interface BacktestWizardOptions {
  /** Strategy library accessor — the same ScriptFileManager the seam uses.
   *  Absent (test constructions of sibling flows) degrades to empty-library. */
  scripts?: ScriptFileManager;
  /** Optional persistent OHLCV cache, forwarded to the producer seam. */
  diskCache?: DiskOHLCVCache;
  /** Injectable clock (ms) for deterministic date resolution. */
  now?: number;
  /** Resolve the chat language (the feature's store-backed chatLang). */
  getChatLanguage: (chatId: number) => BotLanguage;
  /** Photo transport: PNG buffer + localized caption out (never throws). */
  onPhoto: (chatId: number, buffer: Buffer, caption?: string) => Promise<boolean>;
}

export class BacktestWizard {
  private readonly sessions = new Map<number, BacktestSession>();
  private readonly scripts?: ScriptFileManager;
  private readonly diskCache?: DiskOHLCVCache;
  private readonly now?: number;
  private readonly getChatLanguage: (chatId: number) => BotLanguage;
  private readonly onPhoto: (chatId: number, buffer: Buffer, caption?: string) => Promise<boolean>;

  constructor(options: BacktestWizardOptions) {
    this.scripts = options.scripts;
    this.diskCache = options.diskCache;
    this.now = options.now;
    this.getChatLanguage = options.getChatLanguage;
    this.onPhoto = options.onPhoto;
  }

  private lang(chatId: number): BotLanguage {
    return this.getChatLanguage(chatId);
  }

  /** Strategies available for backtesting (indicators/libraries excluded). */
  private async loadStrategies(): Promise<ScriptEntry[]> {
    if (!this.scripts) return [];
    const all = await this.scripts.getAll();
    return all.filter((entry) => entry.scriptType === 'strategy');
  }

  /**
   * /backtest command (and restart entry point): (re)start the wizard at the
   * strategy step. Empty library -> localized empty state, no session.
   */
  async start(ctx: FeatureCommandContext): Promise<void> {
    const chatId = ctx.chat?.id ?? 0;
    const lang = this.lang(chatId);
    const strategies = await this.loadStrategies();
    if (strategies.length === 0) {
      await ctx.reply(t(lang, 'backtestEmptyLibrary'));
      return;
    }
    this.sessions.set(chatId, { step: 'strat', strategies, running: false });
    await ctx.reply(t(lang, 'backtestStepStrategy'), {
      reply_markup: strategyKeyboard(strategies, lang),
    });
  }

  /**
   * Single callback entry for every `bt:*` prefix. Dispatches on the first
   * params segment; navigation (restart/cancel/back) is always accepted, step
   * selections are stale-guarded per handler.
   */
  async handleCallback(ctx: CallbackContext): Promise<void> {
    const [action, ...rest] = ctx.params.split(':');
    const arg = rest.join(':');
    const chatId = ctx.chat?.id ?? 0;

    switch (action) {
      case 'restart':
        await ctx.answerCallback();
        await this.restart(ctx, chatId);
        return;
      case 'cancel':
        await ctx.answerCallback();
        await this.cancel(ctx, chatId);
        return;
      case 'back':
        await ctx.answerCallback();
        if (isWizardStep(arg)) {
          await this.showStep(ctx, chatId, arg);
        } else {
          await this.showCurrent(ctx, chatId);
        }
        return;
      case 'strat':
        await this.selectStrategy(ctx, chatId, arg);
        return;
      case 'sym':
        await this.selectSymbol(ctx, chatId, arg);
        return;
      case 'tf':
        await this.selectTimeframe(ctx, chatId, arg);
        return;
      case 'days':
        await this.selectDays(ctx, chatId, arg);
        return;
      case 'method':
        await this.selectMethod(ctx, chatId, arg);
        return;
      case 'run':
        await this.run(ctx, chatId);
        return;
      default:
        // Unknown bt:* data — never throw; acknowledge and re-show the active step.
        await ctx.answerCallback();
        await this.showCurrent(ctx, chatId);
    }
  }

  // ---- step selection (stale-guarded) ----------------------------------------

  /** Step 1 — strategy pick by INDEX into the session's strategy snapshot. */
  private async selectStrategy(ctx: CallbackContext, chatId: number, arg: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'strat') {
      // Stale tap on a superseded strategy keyboard — silent ack, state kept.
      await ctx.answerCallback();
      return;
    }
    const index = Number(arg);
    if (!Number.isInteger(index) || index < 0 || index >= session.strategies.length) {
      await ctx.answerCallback();
      return;
    }
    session.strategyIndex = index;
    await ctx.answerCallback();
    await this.showStep(ctx, chatId, 'symbol');
  }

  private async selectSymbol(ctx: CallbackContext, chatId: number, arg: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'symbol' || !BACKTEST_SYMBOLS.includes(arg)) {
      await ctx.answerCallback();
      return;
    }
    session.symbol = arg;
    await ctx.answerCallback();
    await this.showStep(ctx, chatId, 'timeframe');
  }

  private async selectTimeframe(ctx: CallbackContext, chatId: number, arg: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'timeframe' || !BACKTEST_TIMEFRAMES.includes(arg)) {
      await ctx.answerCallback();
      return;
    }
    session.timeframe = arg;
    await ctx.answerCallback();
    await this.showStep(ctx, chatId, 'days');
  }

  private async selectDays(ctx: CallbackContext, chatId: number, arg: string): Promise<void> {
    const session = this.sessions.get(chatId);
    const days = Number(arg);
    if (!session || session.step !== 'days' || !Number.isInteger(days) || days <= 0) {
      await ctx.answerCallback();
      return;
    }
    session.daysBack = days;
    await ctx.answerCallback();
    await this.showStep(ctx, chatId, 'method');
  }

  private async selectMethod(ctx: CallbackContext, chatId: number, arg: string): Promise<void> {
    const session = this.sessions.get(chatId);
    if (
      !session ||
      session.step !== 'method' ||
      !(BACKTEST_METHODS as readonly string[]).includes(arg)
    ) {
      await ctx.answerCallback();
      return;
    }
    session.commissionMethod = arg as BacktestCommissionMethodId;
    await ctx.answerCallback();
    await this.showStep(ctx, chatId, 'run');
  }

  // ---- run step --------------------------------------------------------------

  /**
   * Step 6 — start the run. Never awaits the backtest inside the callback:
   * ack, edit to "running…", fire-and-forget the producer+render+send. A
   * second tap while running is rejected by the single-run guard.
   */
  private async run(ctx: CallbackContext, chatId: number): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'run') {
      await ctx.answerCallback();
      return;
    }
    const lang = this.lang(chatId);
    if (session.running) {
      await ctx.answerCallback(t(lang, 'backtestAlreadyRunning'));
      return;
    }
    if (!this.buildParams(session)) {
      // Incomplete settings (defensive) — re-show the run step.
      await ctx.answerCallback();
      await this.showStep(ctx, chatId, 'run');
      return;
    }
    session.running = true;
    await ctx.answerCallback();
    await ctx.editMessage(t(lang, 'backtestRunning'), { reply_markup: runningKeyboard(lang) });
    void this.executeRun(ctx, session);
  }

  /**
   * Fire-and-forget run pipeline: seam -> render -> photo. Every failure is
   * localized and terminal (session ends). Never throws/rejects unhandled.
   * Cancelling mid-run ends the session, but an in-flight run still delivers
   * its result card when it completes.
   */
  private async executeRun(ctx: CallbackContext, session: BacktestSession): Promise<void> {
    const chatId = ctx.chat?.id ?? 0;
    const lang = this.lang(chatId);
    try {
      if (!this.scripts) {
        this.sessions.delete(chatId);
        return;
      }
      const params = this.buildParams(session);
      if (!params) {
        this.sessions.delete(chatId);
        return;
      }
      const result = await runTelegramBacktest(params, {
        scripts: this.scripts,
        diskCache: this.diskCache,
        now: this.now,
      });
      if (!result.ok) {
        await ctx.editMessage(t(lang, ERROR_CODE_KEYS[result.error.code]), {
          reply_markup: terminalKeyboard(lang),
        });
        this.sessions.delete(chatId);
        return;
      }
      try {
        const labels = this.buildCardLabels(lang, session, result.result);
        const buffer = await renderBacktestCard(result.result, labels);
        const caption = this.buildCaption(lang, session);
        if (await this.onPhoto(chatId, buffer, caption)) {
          await ctx.editMessage(t(lang, 'backtestRunDone'), {
            reply_markup: terminalKeyboard(lang),
          });
        } else {
          // Photo transport failed — same text fallback as handleReport.
          await this.sendTextFallback(ctx, lang, session, result.result);
        }
      } catch {
        // Render (sharp) or transport failure — fall back to the text summary.
        await this.sendTextFallback(ctx, lang, session, result.result);
      }
      this.sessions.delete(chatId);
    } catch {
      // Transport-level edit/reply failure — never leak an unhandled rejection.
      this.sessions.delete(chatId);
      await ctx.reply(t(lang, 'backtestErrEngine')).catch(() => {});
    }
  }

  // ---- navigation ------------------------------------------------------------

  /** Re-render the message for `step`, updating the session's current step. */
  private async showStep(ctx: CallbackContext, chatId: number, step: WizardStep): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session) return;
    const lang = this.lang(chatId);
    session.step = step;
    switch (step) {
      case 'strat':
        await ctx.editMessage(t(lang, 'backtestStepStrategy'), {
          reply_markup: strategyKeyboard(session.strategies, lang),
        });
        return;
      case 'symbol':
        await ctx.editMessage(t(lang, 'backtestStepSymbol'), {
          reply_markup: symbolKeyboard(lang),
        });
        return;
      case 'timeframe':
        await ctx.editMessage(t(lang, 'backtestStepTimeframe'), {
          reply_markup: timeframeKeyboard(lang),
        });
        return;
      case 'days':
        await ctx.editMessage(t(lang, 'backtestStepDays'), {
          reply_markup: daysKeyboard(session.timeframe ?? 'D', lang),
        });
        return;
      case 'method':
        await ctx.editMessage(t(lang, 'backtestStepMethod'), {
          reply_markup: methodKeyboard(lang),
        });
        return;
      case 'run':
        await ctx.editMessage(
          t(lang, 'backtestStepRun', {
            summary: t(lang, 'backtestRunSummary', this.runSummaryParams(session, lang)),
          }),
          { reply_markup: runKeyboard(lang) },
        );
        return;
    }
  }

  /** Re-render whatever step the session is on (recovery for unknown data). */
  private async showCurrent(ctx: CallbackContext, chatId: number): Promise<void> {
    const session = this.sessions.get(chatId);
    if (!session) return;
    await this.showStep(ctx, chatId, session.step);
  }

  /** Restart from a callback: fresh session at the strategy step (edit in place). */
  private async restart(ctx: CallbackContext, chatId: number): Promise<void> {
    const lang = this.lang(chatId);
    const strategies = await this.loadStrategies();
    if (strategies.length === 0) {
      await ctx.editMessage(t(lang, 'backtestEmptyLibrary'));
      this.sessions.delete(chatId);
      return;
    }
    this.sessions.set(chatId, { step: 'strat', strategies, running: false });
    await ctx.editMessage(t(lang, 'backtestStepStrategy'), {
      reply_markup: strategyKeyboard(strategies, lang),
    });
  }

  /** Cancel: confirm and end the session. An in-flight run still reports its card. */
  private async cancel(ctx: CallbackContext, chatId: number): Promise<void> {
    const lang = this.lang(chatId);
    this.sessions.delete(chatId);
    await ctx.editMessage(t(lang, 'backtestCancelConfirm'), {
      reply_markup: terminalKeyboard(lang),
    });
  }

  // ---- run pipeline helpers ---------------------------------------------------

  /** Build the seam params from the session; null when any required field is missing. */
  private buildParams(session: BacktestSession): TelegramBacktestParams | null {
    if (
      session.strategyIndex === undefined ||
      session.symbol === undefined ||
      session.timeframe === undefined ||
      session.daysBack === undefined ||
      session.commissionMethod === undefined
    ) {
      return null;
    }
    const strategy = session.strategies[session.strategyIndex];
    if (!strategy) return null;
    return {
      strategyId: strategy.id,
      symbol: session.symbol,
      timeframe: session.timeframe,
      daysBack: session.daysBack,
      commissionMethod: session.commissionMethod,
    };
  }

  /** Placeholders for the run-confirmation summary and the text fallback. */
  private runSummaryParams(session: BacktestSession, lang: BotLanguage): Record<string, string> {
    return {
      strategy: session.strategies[session.strategyIndex ?? -1]?.name ?? '—',
      symbol: session.symbol ?? '—',
      timeframe: timeframeDisplay(session.timeframe ?? ''),
      range: `${session.daysBack ?? 0}d`,
      method: methodLabel(lang, session.commissionMethod ?? 'jupiter_manual'),
    };
  }

  /** Short localized caption attached to the result card photo. */
  private buildCaption(lang: BotLanguage, session: BacktestSession): string {
    return t(lang, 'backtestResultCaption', {
      strategy: session.strategies[session.strategyIndex ?? -1]?.name ?? '—',
      symbol: session.symbol ?? '—',
      timeframe: timeframeDisplay(session.timeframe ?? ''),
      range: `${session.daysBack ?? 0}d`,
    });
  }

  /**
   * Localized label map for the backtest card renderer (contract M1). The
   * renderer stays pure — every card string resolves here via t(lang, ...).
   * Card strings carry no emoji (SVG text cannot render color emoji).
   */
  private buildCardLabels(
    lang: BotLanguage,
    session: BacktestSession,
    result: BacktestApiResult,
  ): BacktestCardLabels {
    return {
      brand: t(lang, 'cardBrand'),
      engine: t(lang, 'backtestCardEngine'),
      netPnl: t(lang, 'backtestCardNet'),
      settings: t(lang, 'backtestCardSettings'),
      settingsKeys: {
        symbol: t(lang, 'backtestCardSetSymbol'),
        timeframe: t(lang, 'backtestCardSetTimeframe'),
        range: t(lang, 'backtestCardSetRange'),
        method: t(lang, 'backtestCardSetMethod'),
        capital: t(lang, 'backtestCardSetCapital'),
      },
      settingsValues: {
        symbol: session.symbol ?? '—',
        timeframe: timeframeDisplay(session.timeframe ?? ''),
        range: `${session.daysBack ?? 0}d`,
        method: methodLabel(lang, session.commissionMethod ?? 'jupiter_manual'),
        // The renderer prefers effectiveConfig.initialCapital when present.
        capital: formatMoney(10000),
      },
      performance: t(lang, 'backtestCardPerformance'),
      barsAnnotation: t(lang, 'backtestCardBarsAnnotation', { bars: String(result.barCount) }),
      trades: t(lang, 'backtestCardTrades'),
      winRate: t(lang, 'backtestCardWinRate'),
      profitFactor: t(lang, 'backtestCardProfitFactor'),
      maxDrawdown: t(lang, 'backtestCardMaxDrawdown'),
      sharpe: t(lang, 'backtestCardSharpe'),
      buyHold: t(lang, 'backtestCardBuyHold'),
      commission: t(lang, 'backtestCardCommission'),
      bars: t(lang, 'backtestCardBars'),
      avgTrade: t(lang, 'backtestCardAvgTrade'),
      generated: t(lang, 'backtestCardGenerated', {
        time: formatGeneratedAt(Date.now(), lang),
      }),
      footer: t(lang, 'backtestCardFooter'),
    };
  }

  /**
   * Text fallback when the card cannot be rendered/sent (sharp unavailable,
   * photo transport failure) — mirrors handleReport's fallback pattern.
   * Percent values are formatted as percent (68.4 -> '68.4%'), never through
   * formatRate (the 0..1 fraction formatter) — same rule as the card renderer.
   */
  private async sendTextFallback(
    ctx: CallbackContext,
    lang: BotLanguage,
    session: BacktestSession,
    result: BacktestApiResult,
  ): Promise<void> {
    const m = result.metrics;
    const lines = [
      t(lang, 'backtestTextTitle', {
        strategy: session.strategies[session.strategyIndex ?? -1]?.name ?? '—',
      }),
      t(lang, 'backtestTextSummary', this.runSummaryParams(session, lang)),
      t(lang, 'backtestTextMetrics', {
        netPnl: formatMoney(m.totalPnl),
        pct: percentValue(m.totalPnlPercent, true),
        trades: String(m.totalTrades),
        winRate: percentValue(m.winRate),
        pf: m.profitFactor === null ? '∞' : formatProfitFactor(m.profitFactor),
      }),
      t(lang, 'backtestTextStats', {
        avg: formatMoney(m.totalTrades > 0 ? m.totalPnl / m.totalTrades : 0),
        dd: formatMoney(-m.maxDrawdown),
        fees: formatMoney(m.commission),
      }),
      t(lang, 'backtestTextGenerated', {
        time: formatGeneratedAt(Date.now(), lang),
      }),
    ];
    await ctx.reply(escapeMarkdownV2(lines.join('\n')), {
      parse_mode: 'MarkdownV2' as const,
    });
  }
}
