/**
 * keyboards.ts — Inline-keyboard builders for the /backtest wizard.
 *
 * Every button emits a `bt:*` callback. The `bt` prefix is registered in the
 * feature's SSOT action registry AND its EMITTED_CALLBACK_PREFIXES (install()
 * throws if an emitted prefix has no backing action). Labels resolve through
 * i18n — emoji live inside the translated strings, never concatenated here.
 *
 * DAYS-BACK PRESETS (design D4): the engine caps at 1500 bars. bars/day is
 * 1440 / tfMinutes for intraday timeframes (1m→1440, 3m→480, 5m→288, 15m→96,
 * 30m→48, 60m→24, 120m→12, 240m→6) and ~1 / ~0.14 / ~0.047 for D / W / M.
 * Presets below keep the MAX preset ≤ 1500 bars; the seam's TOO_MANY_BARS
 * error remains the final guard against real-world bar counts.
 */

import type { BacktestCommissionMethodId } from '../../backtest-contract.js';
import type { ScriptEntry } from '../../store/ScriptFileManager.js';
import type { BotLanguage } from '../i18n.js';
import { t } from '../i18n.js';
import type { EditMessageExtras } from '../TelegramBotFeature.js';

/** Curated symbols — same list as the CLI defaults. */
export const BACKTEST_SYMBOLS: readonly string[] = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
];

/** Timeframes — same list as the CLI defaults. */
export const BACKTEST_TIMEFRAMES: readonly string[] = [
  '1',
  '3',
  '5',
  '15',
  '30',
  '60',
  '120',
  '240',
  'D',
  'W',
  'M',
];

/** Official commission methods — exactly the two normalizeExplicitOverride accepts. */
export const BACKTEST_METHODS: readonly BacktestCommissionMethodId[] = [
  'jupiter_ultra',
  'jupiter_manual',
];

/**
 * Timeframe-aware lookback presets — the max preset of each list stays ≤ 1500
 * bars (preset × bars-per-day, where bars/day ≈ 1440/tf-minutes: 1m→1440,
 * 3m→480, 5m→288, 15m→96, 30m→48, 60m→24, 120m→12, 240m→6, D→1, W→0.14,
 * M→0.047), with the seam's TOO_MANY_BARS as final guard.
 */
const DAYS_PRESETS: Record<string, readonly number[]> = {
  '1': [1],
  '3': [1, 3],
  '5': [1, 3, 5],
  '15': [1, 3, 7, 15],
  '30': [1, 3, 7, 30],
  '60': [1, 7, 30, 60],
  '120': [1, 7, 30, 90, 120],
  '240': [7, 30, 90, 250],
  D: [30, 90, 365],
  W: [30, 90, 365],
  M: [30, 90, 365],
};

/** Presets for a timeframe; a defensive [1, 7, 30] fallback never exceeds the cap. */
export function daysPresetsFor(timeframe: string): readonly number[] {
  return DAYS_PRESETS[timeframe] ?? [1, 7, 30];
}

/** The seven wizard steps, in flow order. */
export type WizardStep = 'strat' | 'symbol' | 'timeframe' | 'days' | 'method' | 'capital' | 'run';

export const WIZARD_STEPS: readonly WizardStep[] = [
  'strat',
  'symbol',
  'timeframe',
  'days',
  'method',
  'capital',
  'run',
];

export function isWizardStep(value: string): value is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(value);
}

/** Previous step for the Back button; undefined at the first step. */
export function previousStep(step: WizardStep): WizardStep | undefined {
  switch (step) {
    case 'strat':
      return undefined;
    case 'symbol':
      return 'strat';
    case 'timeframe':
      return 'symbol';
    case 'days':
      return 'timeframe';
    case 'method':
      return 'days';
    case 'capital':
      return 'method';
    case 'run':
      return 'capital';
  }
}

/** Localized display name for a commission method. */
export function methodLabel(lang: BotLanguage, method: BacktestCommissionMethodId): string {
  return t(lang, method === 'jupiter_ultra' ? 'backtestMethodUltra' : 'backtestMethodManual');
}

/** Display form of a timeframe: '60' -> '60m', 'D' -> 'D' (card/run label convention). */
export function timeframeDisplay(timeframe: string): string {
  return /^\d+$/.test(timeframe) ? `${timeframe}m` : timeframe;
}

// ---- keyboard building -------------------------------------------------------

interface Button {
  text: string;
  callback_data: string;
}
type Row = Button[];
type Keyboard = EditMessageExtras['reply_markup'];

function keyboard(rows: Row[]): Keyboard {
  return { inline_keyboard: rows };
}

/**
 * Bottom control row: Back (when a previous step exists), Restart, Cancel.
 * Always reachable regardless of the active step — navigation is never gated
 * by the stale-tap guard.
 */
function controlRow(lang: BotLanguage, step: WizardStep): Row {
  const prev = previousStep(step);
  const row: Button[] = [];
  if (prev) {
    row.push({ text: t(lang, 'backtestBtnBack'), callback_data: `bt:back:${prev}` });
  }
  row.push({ text: t(lang, 'backtestBtnRestart'), callback_data: 'bt:restart' });
  row.push({ text: t(lang, 'btnCancel'), callback_data: 'bt:cancel' });
  return row;
}

/** Step 1 — strategy picker. One row per strategy; INDEX tokens, never UUIDs. */
export function strategyKeyboard(strategies: readonly ScriptEntry[], lang: BotLanguage): Keyboard {
  const rows: Row[] = strategies.map((strategy, index) => [
    { text: strategy.name, callback_data: `bt:strat:${index}` },
  ]);
  rows.push(controlRow(lang, 'strat'));
  return keyboard(rows);
}

/** Step 2 — curated symbol picker. */
export function symbolKeyboard(lang: BotLanguage): Keyboard {
  const rows: Row[] = [];
  for (let i = 0; i < BACKTEST_SYMBOLS.length; i += 2) {
    rows.push(
      BACKTEST_SYMBOLS.slice(i, i + 2).map((symbol) => ({
        text: symbol,
        callback_data: `bt:sym:${symbol}`,
      })),
    );
  }
  rows.push(controlRow(lang, 'symbol'));
  return keyboard(rows);
}

/** Step 3 — timeframe picker. */
export function timeframeKeyboard(lang: BotLanguage): Keyboard {
  const rows: Row[] = [];
  for (let i = 0; i < BACKTEST_TIMEFRAMES.length; i += 4) {
    rows.push(
      BACKTEST_TIMEFRAMES.slice(i, i + 4).map((timeframe) => ({
        text: timeframe,
        callback_data: `bt:tf:${timeframe}`,
      })),
    );
  }
  rows.push(controlRow(lang, 'timeframe'));
  return keyboard(rows);
}

/** Step 4 — timeframe-aware lookback presets. */
export function daysKeyboard(timeframe: string, lang: BotLanguage): Keyboard {
  const presets = daysPresetsFor(timeframe);
  const rows: Row[] = [];
  for (let i = 0; i < presets.length; i += 3) {
    rows.push(
      presets.slice(i, i + 3).map((days) => ({
        text: `${days}d`,
        callback_data: `bt:days:${days}`,
      })),
    );
  }
  rows.push(controlRow(lang, 'days'));
  return keyboard(rows);
}

/** Step 5 — commission method picker (exactly the two official ids). */
export function methodKeyboard(lang: BotLanguage): Keyboard {
  const rows: Row[] = [
    BACKTEST_METHODS.map((method) => ({
      text: methodLabel(lang, method),
      callback_data: `bt:method:${method}`,
    })),
  ];
  rows.push(controlRow(lang, 'method'));
  return keyboard(rows);
}

/**
 * Initial-capital presets (Director-specified). Plain USD labels ($10, $100,
 * $1,000, $10,000) — the wizard's only currency, so no i18n key is needed.
 * Whitelisting here is the validation: every preset is a positive finite int.
 */
export const CAPITAL_PRESETS: readonly number[] = [10, 100, 1000, 10000];

/** Step 6 — initial-capital presets (2×2, mirroring the days rows). */
export function capitalKeyboard(lang: BotLanguage): Keyboard {
  const rows: Row[] = [];
  for (let i = 0; i < CAPITAL_PRESETS.length; i += 2) {
    rows.push(
      CAPITAL_PRESETS.slice(i, i + 2).map((value) => ({
        text: `$${value.toLocaleString('en-US')}`,
        callback_data: `bt:capital:${value}`,
      })),
    );
  }
  rows.push(controlRow(lang, 'capital'));
  return keyboard(rows);
}

/** Step 7 — run confirmation. */
export function runKeyboard(lang: BotLanguage): Keyboard {
  return keyboard([
    [{ text: t(lang, 'backtestBtnRun'), callback_data: 'bt:run' }],
    controlRow(lang, 'run'),
  ]);
}

/** Shown while a backtest is running: cancel-only (a second run is rejected). */
export function runningKeyboard(lang: BotLanguage): Keyboard {
  return keyboard([[{ text: t(lang, 'btnCancel'), callback_data: 'bt:cancel' }]]);
}

/** Terminal state (cancel / error / done): restart or back to the dashboard. */
export function terminalKeyboard(lang: BotLanguage): Keyboard {
  return keyboard([
    [
      { text: t(lang, 'backtestBtnRestart'), callback_data: 'bt:restart' },
      { text: t(lang, 'btnBackMain'), callback_data: 'start:menu' },
    ],
  ]);
}
