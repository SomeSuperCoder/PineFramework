/**
 * Per-language renderer for live-trading notifications.
 *
 * Pure function — no Telegraf, no state. The `TradingNotificationRouter`
 * closure in the backend entrypoint calls `renderNotification` to build the
 * MarkdownV2 body for a given recipient's language, then hands it to
 * `TelegramBotFeature.deliver` for subscription-aware routing.
 *
 * Every message is composed from the i18n keys in `./i18n.ts` (emoji are
 * embedded per-language in each translated string) with all dynamic values
 * escaped through the core `escapeMarkdown` — the single escaping source —
 * so live-trading alerts match log/dashboard conventions.
 */

import {
  escapeMarkdown,
  type TradingNotificationData,
  type TradingNotificationKind,
} from 'pine-framework/trading/telegram-bot';
import { t, type BotLanguage } from './i18n.js';

/** Escape a USD-formatted number (escapeMarkdown turns `.` into `\.`). */
const USD = (value: number): string => escapeMarkdown(value.toFixed(2));

/**
 * Render one live-trading notification for a recipient speaking `lang`.
 *
 * `kind` (the routing key) and `data` (the discriminated payload) are typed
 * independently, so `data` is narrowed per case via a discriminant intersection
 * (`TradingNotificationData & { kind: ... }` collapses to the matching union
 * member). A payload/kind mismatch is therefore a compile error, not a runtime
 * surprise.
 */
export function renderNotification(
  kind: TradingNotificationKind,
  lang: BotLanguage,
  data: TradingNotificationData,
): string {
  switch (kind) {
    case 'bot_started': {
      const item = data as TradingNotificationData & { kind: 'bot_started' };
      const config = item.config;
      return [
        t(lang, 'botStarted'),
        '',
        `DEX: \`${escapeMarkdown(config.dex)}\``,
        `Pairs: \`${config.pairs?.length ?? 0}\``,
        `Daily Loss Limit: \`$${escapeMarkdown(String(config.risk.maxDailyLoss))}\``,
      ].join('\n');
    }

    case 'bot_stopped': {
      const item = data as TradingNotificationData & { kind: 'bot_stopped' };
      const hours = Math.floor(item.runtimeMs / 3600000);
      const minutes = Math.floor((item.runtimeMs % 3600000) / 60000);
      const pnlStr =
        item.pnl >= 0 ? `+$${item.pnl.toFixed(2)}` : `-$${Math.abs(item.pnl).toFixed(2)}`;
      return [
        t(lang, 'botStopped'),
        '',
        `Runtime: \`${hours}h ${minutes}m\``,
        `Trades: \`${item.tradeCount}\``,
        `PnL: \`${escapeMarkdown(pnlStr)}\``,
      ].join('\n');
    }

    case 'position_open': {
      const trade = (data as TradingNotificationData & { kind: 'position_open' }).trade;
      const side = trade.side === 'buy' ? 'Long' : 'Short';
      return [
        t(lang, 'positionOpened', {
          symbol: escapeMarkdown(trade.symbol),
          side: escapeMarkdown(side),
          qty: escapeMarkdown(String(trade.size)),
          price: USD(trade.entryPrice),
        }),
        '',
        `DEX: \`${escapeMarkdown(trade.dex)}\``,
      ].join('\n');
    }

    case 'position_close': {
      const { trade } = data as TradingNotificationData & { kind: 'position_close' };
      const side = trade.side === 'buy' ? 'Long' : 'Short';
      // Never-guess PnL: a force-close may confirm without a truthfully
      // derivable exit price. The PnL/Exit/Fees lines are then OMITTED — never
      // 'undefined'/'NaN', never an invented $0.00.
      const pnlStr =
        trade.realizedPnl === undefined
          ? undefined
          : trade.realizedPnl >= 0
            ? `+$${trade.realizedPnl.toFixed(2)}`
            : `-$${Math.abs(trade.realizedPnl).toFixed(2)}`;

      const lines = [
        pnlStr === undefined
          ? t(lang, 'positionClosedNoPnl', { symbol: escapeMarkdown(trade.symbol) })
          : t(lang, 'positionClosed', {
              symbol: escapeMarkdown(trade.symbol),
              pnl: escapeMarkdown(pnlStr),
            }),
        '',
        `Side: \`${escapeMarkdown(side)}\``,
        `Size: \`${escapeMarkdown(String(trade.size))}\``,
        `Entry: \`$${USD(trade.entryPrice)}\``,
      ];
      if (trade.exitPrice !== undefined) {
        lines.push(`Exit: \`$${USD(trade.exitPrice)}\``);
      }
      if (trade.fees !== undefined) {
        lines.push(`Fees: \`$${USD(trade.fees)}\``);
      }
      lines.push(`DEX: \`${escapeMarkdown(trade.dex)}\``);
      return lines.join('\n');
    }

    case 'emergency_stop': {
      const source = (data as TradingNotificationData & { kind: 'emergency_stop' }).source;
      return [t(lang, 'emergency'), '', `Source: \`${escapeMarkdown(source)}\``].join('\n');
    }

    case 'daily_loss': {
      const item = data as TradingNotificationData & { kind: 'daily_loss' };
      return [
        t(lang, 'dailyLoss'),
        '',
        `Loss: \`$${USD(item.loss)}\``,
        `Limit: \`$${USD(item.maxLoss)}\``,
      ].join('\n');
    }

    case 'error': {
      const item = data as TradingNotificationData & { kind: 'error' };
      const truncated =
        item.message.length > 200 ? item.message.substring(0, 200) + '...' : item.message;
      return [
        t(lang, 'errorNotification', { message: escapeMarkdown(truncated) }),
        '',
        `Code: \`${escapeMarkdown(item.code)}\``,
      ].join('\n');
    }

    case 'warning': {
      const message = (data as TradingNotificationData & { kind: 'warning' }).message;
      return t(lang, 'warningNotification', { message: escapeMarkdown(message) });
    }

    case 'state_change': {
      const item = data as TradingNotificationData & { kind: 'state_change' };
      return [
        t(lang, 'stateChange', { state: escapeMarkdown(String(item.to)) }),
        '',
        `From: \`${escapeMarkdown(String(item.from))}\``,
        `To: \`${escapeMarkdown(String(item.to))}\``,
        `Reason: \`${escapeMarkdown(item.reason)}\``,
      ].join('\n');
    }
  }
}

export default renderNotification;