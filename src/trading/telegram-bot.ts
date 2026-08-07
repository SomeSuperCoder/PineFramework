/**
 * Live trading Telegram notification integration.
 *
 * Extends the existing Telegram notification system with live trading events:
 * - Bot started / stopped
 * - Position opened / closed
 * - Emergency stop triggered
 * - Daily stop loss triggered
 * - Errors and warnings
 *
 * @module trading
 */

import type { TradeRecord, BotConfig, BotState } from './types.js';

/**
 * Minimal Telegram sender interface — can be backed by the existing
 * backend TelegramService or a mock for testing.
 */
export interface TelegramSender {
  sendMessage(chatId: number, message: string): Promise<boolean>;
  getSubscribers(): Array<{ chatId: number }>;
}

export interface TradingNotificationOptions {
  /** Whether trade notifications include transaction links. */
  includeTxLinks: boolean;
  /** Explorer URL template. {signature} is replaced with the tx signature. */
  explorerUrlTemplate?: string;
  /** Optional live-notification router. When set, every notify* method routes
   *  through `deliver` and returns, taking the BACKEND subscription/i18n path
   *  instead of the legacy broadcast fallback. */
  routing?: TradingNotificationRouter;
}

/**
 * The closed set of live-trading notification kinds.
 */
export type TradingNotificationKind =
  | 'bot_started' | 'bot_stopped' | 'position_open' | 'position_close'
  | 'emergency_stop' | 'daily_loss' | 'error' | 'warning' | 'state_change';

/** Discriminated payload per kind — all existing core types. */
export type TradingNotificationData =
  | { kind: 'bot_started'; config: BotConfig }
  | { kind: 'bot_stopped'; runtimeMs: number; tradeCount: number; pnl: number }
  | { kind: 'position_open'; trade: TradeRecord }
  | { kind: 'position_close'; trade: PositionNotificationTrade }
  | { kind: 'emergency_stop'; source: string }
  | { kind: 'daily_loss'; loss: number; maxLoss: number }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'warning'; message: string }
  | { kind: 'state_change'; from: BotState; to: BotState; reason: string };

/**
 * Trade payload for position notifications. exitPrice / realizedPnl / fees are
 * optional because a FORCE close (stop/emergency button) may confirm on-chain
 * without a truthfully derivable exit price — the notice must then omit those
 * fields rather than invent a $0.00 PnL (never-guess PnL rule). Natural closes
 * always carry them. The renderer (backend notification-renderer + the legacy
 * fallback here) omits the corresponding lines when a field is missing.
 */
export interface PositionNotificationTrade extends Omit<
  TradeRecord,
  'exitPrice' | 'realizedPnl' | 'fees'
> {
  exitPrice?: number;
  realizedPnl?: number;
  fees?: number;
  /** Why the position closed (e.g. 'user_stop' / 'emergency_stop'). Metadata
   *  only — never rendered into the message (a force-close notice is IDENTICAL
   *  to a natural close). */
  closeReason?: string;
}

/** Router implemented by the BACKEND. Core defines; backend implements. */
export interface TradingNotificationRouter {
  deliver(kind: TradingNotificationKind, data: TradingNotificationData, opts?: { chatId?: number }): Promise<void>;
}

const DEFAULT_OPTIONS: TradingNotificationOptions = {
  includeTxLinks: true,
  explorerUrlTemplate: 'https://solscan.io/tx/{signature}',
};

/**
 * Escape text for Telegram MarkdownV2.
 * Named export so the backend renderer reuses this as the single escaping source.
 */
export function escapeMarkdown(text: string): string {
  return text
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
}

export class TradingTelegramBot {
  private sender: TelegramSender;
  private options: TradingNotificationOptions;

  constructor(sender: TelegramSender, options?: Partial<TradingNotificationOptions>) {
    this.sender = sender;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async notifyBotStarted(config: BotConfig): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('bot_started', { kind: 'bot_started', config }, undefined);
      return;
    }
    const message =
      '*🤖 Bot Started*\n\n' +
      `DEX: \`${escapeMarkdown(config.dex)}\`\n` +
      `Pairs: \`${config.pairs?.length ?? 0}\`\n` +
      `Daily Loss Limit: \`$${config.risk.maxDailyLoss}\``;

    await this.broadcast(message);
  }

  async notifyBotStopped(runtimeMs: number, tradeCount: number, pnl: number): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('bot_stopped', { kind: 'bot_stopped', runtimeMs, tradeCount, pnl }, undefined);
      return;
    }
    const hours = Math.floor(runtimeMs / 3600000);
    const minutes = Math.floor((runtimeMs % 3600000) / 60000);
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

    const message =
      '*🛑 Bot Stopped*\n\n' +
      `Runtime: \`${hours}h ${minutes}m\`\n` +
      `Trades: \`${tradeCount}\`\n` +
      `PnL: \`${escapeMarkdown(pnlStr)}\``;

    await this.broadcast(message);
  }

  async notifyPositionOpened(trade: TradeRecord): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('position_open', { kind: 'position_open', trade }, undefined);
      return;
    }
    const txLink =
      trade.transactionSignature && this.options.includeTxLinks
        ? `\n[View TX](${this.options.explorerUrlTemplate!.replace('{signature}', trade.transactionSignature)})`
        : '';

    const message =
      '*📈 Position Opened*\n\n' +
      `Symbol: \`${escapeMarkdown(trade.symbol)}\`\n` +
      `Side: \`${trade.side === 'buy' ? 'Long' : 'Short'}\`\n` +
      `Size: \`${trade.size}\`\n` +
      `Price: \`$${trade.entryPrice.toFixed(2)}\`\n` +
      `DEX: \`${trade.dex}\`` +
      txLink;

    await this.broadcast(message);
  }

  /**
   * Notify a position close. exitPrice / realizedPnl / fees may be absent for
   * a force-close (stop/emergency) whose exit price was not truthfully
   * derivable — the PnL/Exit/Fees lines are omitted rather than inventing
   * $0.00 (never-guess PnL rule). With all fields present the message is
   * byte-identical to a natural close.
   */
  async notifyPositionClosed(trade: PositionNotificationTrade): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('position_close', { kind: 'position_close', trade }, undefined);
      return;
    }
    const txLink =
      trade.transactionSignature && this.options.includeTxLinks
        ? `\n[View TX](${this.options.explorerUrlTemplate!.replace('{signature}', trade.transactionSignature)})`
        : '';

    const lines = [
      '*📉 Position Closed*',
      '',
      `Symbol: \`${escapeMarkdown(trade.symbol)}\``,
      `Side: \`${trade.side === 'buy' ? 'Long' : 'Short'}\``,
      `Size: \`${trade.size}\``,
      `Entry: \`$${trade.entryPrice.toFixed(2)}\``,
    ];
    if (trade.exitPrice !== undefined) {
      lines.push(`Exit: \`$${trade.exitPrice.toFixed(2)}\``);
    }
    if (trade.realizedPnl !== undefined) {
      const pnlStr =
        trade.realizedPnl >= 0
          ? `+$${trade.realizedPnl.toFixed(2)}`
          : `-$${Math.abs(trade.realizedPnl).toFixed(2)}`;
      lines.push(`PnL: \`${escapeMarkdown(pnlStr)}\``);
    }
    if (trade.fees !== undefined) {
      lines.push(`Fees: \`$${trade.fees.toFixed(2)}\``);
    }
    lines.push(`DEX: \`${trade.dex}\`` + txLink);

    await this.broadcast(lines.join('\n'));
  }

  async notifyEmergencyStop(source: string): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('emergency_stop', { kind: 'emergency_stop', source }, undefined);
      return;
    }
    const message =
      '*🚨 Emergency Stop*\n\n' +
      `Source: \`${escapeMarkdown(source)}\`\n` +
      'All positions are being closed.\n' +
      'Bot will not open new positions until restarted.';

    await this.broadcast(message);
  }

  async notifyDailyLossTriggered(loss: number, maxLoss: number): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('daily_loss', { kind: 'daily_loss', loss, maxLoss }, undefined);
      return;
    }
    const message =
      '*🚨 ROLLING 24H LOSS LIMIT BREACHED*\n\n' +
      `Loss: \`$${loss.toFixed(2)}\`\n` +
      `Limit: \`$${maxLoss.toFixed(2)}\`\n\n` +
      'Emergency stop triggered. All positions closed.\n' +
      'Bot will not open new positions until restarted.';

    await this.broadcast(message);
  }

  async notifyError(errorCode: string, errorMessage: string): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('error', { kind: 'error', code: errorCode, message: errorMessage }, undefined);
      return;
    }
    const truncated =
      errorMessage.length > 200 ? errorMessage.substring(0, 200) + '...' : errorMessage;

    const message =
      '*❌ Error*\n\n' +
      `Code: \`${escapeMarkdown(errorCode)}\`\n` +
      `Message: \`${escapeMarkdown(truncated)}\``;

    await this.broadcast(message);
  }

  async notifyWarning(message: string): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('warning', { kind: 'warning', message }, undefined);
      return;
    }
    const msg = '*⚠️ Warning*\n\n' + escapeMarkdown(message);

    await this.broadcast(msg);
  }

  /**
   * Notify of a state change (e.g., Error state).
   */
  async notifyStateChange(from: BotState, to: BotState, reason: string): Promise<void> {
    if (this.options.routing) {
      await this.options.routing.deliver('state_change', { kind: 'state_change', from, to, reason }, undefined);
      return;
    }
    const message =
      '*🔄 Bot State Changed*\n\n' +
      `From: \`${from}\`\n` +
      `To: \`${to}\`\n` +
      `Reason: \`${escapeMarkdown(reason)}\``;

    await this.broadcast(message);
  }

  private async broadcast(message: string): Promise<void> {
    const subscribers = this.sender.getSubscribers();
    for (const sub of subscribers) {
      await this.sender.sendMessage(sub.chatId, message);
    }
  }
}
