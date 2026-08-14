/**
 * telegram-backtest-wizard.test.ts — Unit tests for the Telegram backtest
 * wizard (OpenSpec telegram-backtest-flow, contract M3): `BacktestWizard` +
 * its keyboards. Runs against fabricated FeatureCommandContext/CallbackContext
 * objects (same harness convention as telegram-feature.test.ts), with the
 * producer seam `runTelegramBacktest` and the card renderer mocked — no
 * network, no engine, no sharp. Localized text is asserted through the REAL
 * i18n `t()` resolver so every expected string doubles as a key-lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  FeatureCommandContext,
  CallbackContext,
} from '../src/telegram/TelegramBotFeature.js';
import { BacktestWizard } from '../src/telegram/backtest/wizard.js';
import {
  daysPresetsFor,
  BACKTEST_TIMEFRAMES,
  BACKTEST_SYMBOLS,
} from '../src/telegram/backtest/keyboards.js';
import { runTelegramBacktest, type TelegramBacktestResult } from '../src/telegram/backtest/runTelegramBacktest.js';
import { renderBacktestCard } from '../src/telegram/report/backtestCard.js';
import { t } from '../src/telegram/i18n.js';
import type { ScriptEntry, ScriptFileManager } from '../src/store/ScriptFileManager.js';

vi.mock('../src/telegram/backtest/runTelegramBacktest.js', () => ({
  runTelegramBacktest: vi.fn(),
}));
vi.mock('../src/telegram/report/backtestCard.js', () => ({
  renderBacktestCard: vi.fn(async () => Buffer.from('fake-card-png')),
}));

const CHAT_ID = 1000;

function strategyEntry(id: string, name: string, scriptType: ScriptEntry['scriptType'] = 'strategy'): ScriptEntry {
  return { id, name, source: `//@version=5\nstrategy("${name}")`, scriptType, createdAt: 0, updatedAt: 0 };
}

function makeScripts(entries: ScriptEntry[]): ScriptFileManager {
  return {
    getById: vi.fn(async (id: string) => entries.find((e) => e.id === id)),
    getAll: vi.fn(async () => entries),
  } as unknown as ScriptFileManager;
}

/** Parse a callback-data string ("bt:strat:0") into action + params. */
function transportParse(prefix: string, data: string): { action: string; params: string } {
  const match = data.match(new RegExp(`^${prefix}(?::(.+))?$`));
  return { action: prefix, params: match?.[1] ?? '' };
}

function makeCtx(data: string, reply = vi.fn(), editMessage = vi.fn()) {
  const transport = transportParse('bt', data);
  const cb: CallbackContext = {
    data,
    action: transport.action,
    params: transport.params,
    chat: { id: CHAT_ID },
    from: { id: 1, username: 'tester' },
    reply,
    editMessage,
    answerCallback: vi.fn(),
  };
  return { cb, reply, editMessage };
}

function makeCommandCtx(): { ctx: FeatureCommandContext; reply: ReturnType<typeof vi.fn> } {
  const reply = vi.fn();
  const ctx: FeatureCommandContext = {
    chat: { id: CHAT_ID },
    from: { id: 1, username: 'tester' },
    reply,
  } as unknown as FeatureCommandContext;
  return { ctx, reply };
}

function makeWizard(opts: { entries?: ScriptEntry[] } = {}) {
  const scripts = makeScripts(opts.entries ?? []);
  const onPhoto = vi.fn(async () => true);
  const wizard = new BacktestWizard({
    scripts,
    getChatLanguage: () => 'en', // sync per contract BacktestWizardOptions
    onPhoto,
  });
  return { wizard, scripts, onPhoto };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderBacktestCard).mockResolvedValue(Buffer.from('fake-card-png'));
  // Default seam result — tests override with their own outcome.
  vi.mocked(runTelegramBacktest).mockResolvedValue({
    ok: false,
    error: { code: 'ENGINE_FAILED', message: 'mocked' },
  });
});

describe('BacktestWizard — session lifecycle', () => {
  it('empty library shows the localized empty message and creates no session', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [] });
    const { ctx, reply } = makeCommandCtx();
    await wizard.start(ctx);
    expect(reply).toHaveBeenCalledWith(t('en', 'backtestEmptyLibrary'));

    // No session → any callback is silently acked.
    const { cb } = makeCtx('bt:strat:0');
    await wizard.handleCallback(cb);
    expect(cb.answerCallback).toHaveBeenCalled();
    expect(cb.editMessage).not.toHaveBeenCalled();
    expect(onPhoto).not.toHaveBeenCalled();
  });

  it('full flow: strategy → symbol → timeframe → days → method → run → card + done', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross'), strategyEntry('s2', 'RSI Reversal')] });
    vi.mocked(runTelegramBacktest).mockResolvedValue({
      ok: true,
      result: {
        metrics: { totalTrades: 3 },
        equityCurve: [], drawdownCurve: [], trades: [], orders: [], equityPoints: [], monthlyReturns: {},
        buyHoldReturn: 5, barCount: 720, effectiveConfig: {} as never, warnings: [],
      },
    });

    const { ctx, reply } = makeCommandCtx();
    await wizard.start(ctx);
    expect(reply).toHaveBeenCalledWith(t('en', 'backtestStepStrategy'), expect.any(Object));

    await wizard.handleCallback(makeCtx('bt:strat:0').cb);
    await wizard.handleCallback(makeCtx('bt:sym:BTCUSDT').cb);
    const tf = makeCtx('bt:tf:60').cb;
    await wizard.handleCallback(tf);
    const days = makeCtx('bt:days:30').cb;
    await wizard.handleCallback(days);
    const method = makeCtx('bt:method:jupiter_manual').cb;
    await wizard.handleCallback(method);
    const runCb = makeCtx('bt:run').cb;
    await wizard.handleCallback(runCb);

    // Each step answers the previous keyboard; run is fire-and-forget.
    await vi.waitFor(() => expect(onPhoto).toHaveBeenCalledTimes(1));
    expect(tf.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepDays'), expect.any(Object));
    expect(days.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepMethod'), expect.any(Object));
    // The run step's text interpolates the localized summary.
    const runStepText = t('en', 'backtestStepRun', {
      summary: t('en', 'backtestRunSummary', {
        strategy: 'EMA Cross',
        symbol: 'BTCUSDT',
        timeframe: '60m',
        range: '30d',
        method: t('en', 'backtestMethodManual'),
      }),
    });
    expect(method.editMessage).toHaveBeenCalledWith(runStepText, expect.any(Object));

    expect(runTelegramBacktest).toHaveBeenCalledWith(
      { strategyId: 's1', symbol: 'BTCUSDT', timeframe: '60', daysBack: 30, commissionMethod: 'jupiter_manual' },
      expect.any(Object),
    );
    expect(onPhoto).toHaveBeenCalledWith(
      CHAT_ID,
      expect.any(Buffer),
      expect.stringContaining('EMA Cross'),
    );
    expect(onPhoto.mock.calls[0][2]).toContain('BTCUSDT 60m');

    // Done message replaces the running edit; session is cleaned → replay ignored.
    await vi.waitFor(() =>
      expect(runCb.editMessage).toHaveBeenCalledWith(t('en', 'backtestRunDone'), expect.any(Object)),
    );
    await wizard.handleCallback(makeCtx('bt:run').cb);
    expect(runTelegramBacktest).toHaveBeenCalledTimes(1);
  });

  it('Back re-opens the previous step; re-selection overwrites, not duplicates', async () => {
    const { wizard } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    await wizard.handleCallback(makeCtx('bt:strat:0').cb); // → symbol
    await wizard.handleCallback(makeCtx('bt:sym:BTCUSDT').cb); // → timeframe
    await wizard.handleCallback(makeCtx('bt:tf:60').cb); // → days
    await wizard.handleCallback(makeCtx('bt:days:30').cb); // → method
    await wizard.handleCallback(makeCtx('bt:method:jupiter_ultra').cb); // → run

    // Back from the run step re-opens the method step (session still alive —
    // no run has been triggered yet).
    const back = makeCtx('bt:back:method').cb;
    await wizard.handleCallback(back);
    expect(back.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepMethod'), expect.any(Object));

    // Overwrite the method choice (not jupiter_ultra this time).
    const manual = makeCtx('bt:method:jupiter_manual').cb;
    await wizard.handleCallback(manual);
    const runStepText = t('en', 'backtestStepRun', {
      summary: t('en', 'backtestRunSummary', {
        strategy: 'EMA Cross',
        symbol: 'BTCUSDT',
        timeframe: '60m',
        range: '30d',
        method: t('en', 'backtestMethodManual'),
      }),
    });
    expect(manual.editMessage).toHaveBeenCalledWith(runStepText, expect.any(Object));

    await wizard.handleCallback(makeCtx('bt:run').cb);
    await vi.waitFor(() => expect(runTelegramBacktest).toHaveBeenCalledTimes(1));
    expect(runTelegramBacktest).toHaveBeenCalledWith(
      { strategyId: 's1', symbol: 'BTCUSDT', timeframe: '60', daysBack: 30, commissionMethod: 'jupiter_manual' },
      expect.any(Object),
    );
  });

  it('Cancel confirms and ends the session', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    await wizard.handleCallback(makeCtx('bt:strat:0').cb);

    const cancel = makeCtx('bt:cancel').cb;
    await wizard.handleCallback(cancel);
    expect(cancel.editMessage).toHaveBeenCalledWith(t('en', 'backtestCancelConfirm'), expect.any(Object));

    // Session is gone: any follow-up is a silent ack.
    const after = makeCtx('bt:strat:0').cb;
    await wizard.handleCallback(after);
    expect(after.answerCallback).toHaveBeenCalled();
    expect(after.editMessage).not.toHaveBeenCalled();
    expect(onPhoto).not.toHaveBeenCalled();
  });

  it('Restart resets to the strategy step and wipes the current selection', async () => {
    const { wizard } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross'), strategyEntry('s2', 'RSI Reversal')] });
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    await wizard.handleCallback(makeCtx('bt:strat:0').cb);
    await wizard.handleCallback(makeCtx('bt:sym:BTCUSDT').cb);

    const restart = makeCtx('bt:restart').cb;
    await wizard.handleCallback(restart);
    expect(restart.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepStrategy'), expect.any(Object));

    // Stale symbol tap now ignored (fresh session still on strategy step).
    const stale = makeCtx('bt:sym:BTCUSDT').cb;
    await wizard.handleCallback(stale);
    expect(stale.answerCallback).toHaveBeenCalled();
    expect(stale.editMessage).not.toHaveBeenCalled();

    const pick2 = makeCtx('bt:strat:1').cb;
    await wizard.handleCallback(pick2);
    expect(pick2.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepSymbol'), expect.any(Object));
  });
});

describe('BacktestWizard — guard rails', () => {
  it('stale tap on a superseded step acks silently and preserves the session', async () => {
    const { wizard } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    const first = makeCtx('bt:strat:0').cb;
    await wizard.handleCallback(first);
    expect(first.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepSymbol'), expect.any(Object));

    const stale = makeCtx('bt:strat:0').cb;
    await wizard.handleCallback(stale);
    expect(stale.answerCallback).toHaveBeenCalled();
    expect(stale.editMessage).not.toHaveBeenCalled();

    // Session is still alive on the symbol step.
    const next = makeCtx('bt:sym:BTCUSDT').cb;
    await wizard.handleCallback(next);
    expect(next.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepTimeframe'), expect.any(Object));
  });

  it('invalid indices ack silently; unknown actions re-show the active step', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    for (const data of ['bt:strat:999', 'bt:strat:abc']) {
      const { cb } = makeCtx(data);
      await wizard.handleCallback(cb);
      expect(cb.answerCallback).toHaveBeenCalled();
      expect(cb.editMessage).not.toHaveBeenCalled();
    }
    // Unknown prefix falls into the default branch: ack + re-show the step.
    const unknown = makeCtx('bt:wat').cb;
    await wizard.handleCallback(unknown);
    expect(unknown.answerCallback).toHaveBeenCalled();
    expect(unknown.editMessage).toHaveBeenCalledWith(t('en', 'backtestStepStrategy'), expect.any(Object));
    expect(onPhoto).not.toHaveBeenCalled();
  });

  it('single-run guard: second Run while running is acked with backtestAlreadyRunning', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    vi.mocked(runTelegramBacktest).mockReturnValue(
      new Promise<TelegramBacktestResult>(() => {}), // never settles
    );
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    await wizard.handleCallback(makeCtx('bt:strat:0').cb);
    await wizard.handleCallback(makeCtx('bt:sym:BTCUSDT').cb);
    await wizard.handleCallback(makeCtx('bt:tf:60').cb);
    await wizard.handleCallback(makeCtx('bt:days:30').cb);
    await wizard.handleCallback(makeCtx('bt:method:jupiter_manual').cb);
    const run1 = makeCtx('bt:run').cb;
    await wizard.handleCallback(run1);

    const run2 = makeCtx('bt:run').cb;
    await wizard.handleCallback(run2);
    expect(run2.answerCallback).toHaveBeenCalledWith(t('en', 'backtestAlreadyRunning'));
    expect(run2.editMessage).not.toHaveBeenCalled();
    expect(runTelegramBacktest).toHaveBeenCalledTimes(1);
    expect(onPhoto).not.toHaveBeenCalled();
  });
});

describe('BacktestWizard — run outcomes', () => {
  async function walkToRun(wizard: BacktestWizard) {
    const { ctx } = makeCommandCtx();
    await wizard.start(ctx);
    await wizard.handleCallback(makeCtx('bt:strat:0').cb);
    await wizard.handleCallback(makeCtx('bt:sym:BTCUSDT').cb);
    await wizard.handleCallback(makeCtx('bt:tf:60').cb);
    await wizard.handleCallback(makeCtx('bt:days:30').cb);
    await wizard.handleCallback(makeCtx('bt:method:jupiter_manual').cb);
  }

  it('error result surfaces the localized error and still clears the session', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    vi.mocked(runTelegramBacktest).mockResolvedValue({
      ok: false,
      error: { code: 'TOO_MANY_BARS', message: '1500 bar cap exceeded' },
    });
    await walkToRun(wizard);
    const run = makeCtx('bt:run').cb;
    await wizard.handleCallback(run);

    await vi.waitFor(() =>
      expect(run.editMessage).toHaveBeenCalledWith(t('en', 'backtestErrTooManyBars'), expect.any(Object)),
    );
    expect(onPhoto).not.toHaveBeenCalled();

    // Session cleaned after failure → replay is ignored.
    await wizard.handleCallback(makeCtx('bt:run').cb);
    expect(runTelegramBacktest).toHaveBeenCalledTimes(1);
  });

  it('falls back to markdown text when photo transport fails', async () => {
    const { wizard, onPhoto } = makeWizard({ entries: [strategyEntry('s1', 'EMA Cross')] });
    onPhoto.mockResolvedValue(false);
    vi.mocked(runTelegramBacktest).mockResolvedValue({
      ok: true,
      result: {
        metrics: { totalTrades: 3 },
        equityCurve: [], drawdownCurve: [], trades: [], orders: [], equityPoints: [], monthlyReturns: {},
        buyHoldReturn: 5, barCount: 720, effectiveConfig: {} as never, warnings: [],
      },
    });
    await walkToRun(wizard);
    const run = makeCtx('bt:run').cb;
    await wizard.handleCallback(run);

    await vi.waitFor(() =>
      expect(run.reply).toHaveBeenCalledWith(expect.stringContaining('EMA Cross'), expect.objectContaining({ parse_mode: 'MarkdownV2' })),
    );
  });
});

describe('BacktestWizard keyboards — preset safety', () => {
  it('every day-preset × timeframe stays under the 1500-bar cap', () => {
    const barsPerDay: Record<string, number> = {
      '1': 1440, '3': 480, '5': 288, '15': 96, '30': 48, '60': 24, '120': 12, '240': 6, D: 1, W: 0.14, M: 0.047,
    };
    for (const tf of BACKTEST_TIMEFRAMES) {
      const worst = Math.max(...daysPresetsFor(tf));
      expect(worst * barsPerDay[tf]).toBeLessThanOrEqual(1500);
    }
    expect(daysPresetsFor('240')).toEqual([7, 30, 90, 250]);
    expect(daysPresetsFor('60')).toEqual([1, 7, 30, 60]);
  });

  it('exposes the canonical symbol set', () => {
    expect(BACKTEST_SYMBOLS).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']);
  });
});
