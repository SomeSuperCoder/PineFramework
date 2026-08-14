import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ARTIFACTS_DIR = path.join(import.meta.dirname, 'artifacts');

/**
 * QA ACCEPTANCE — backtest-parity-trust: user-facing trust surface.
 * (OpenSpec: EffectiveConfigSummary "what actually ran" strip + WarningsStrip
 *  + commission selector contract — jupiter_manual/jupiter_ultra only.)
 *
 * User journeys under test:
 *   1. User opens the Backtest panel → commission selector offers ONLY
 *      "Jupiter Swap" + "Jupiter Ultra" (no legacy/pseudo methods) → user picks
 *      "Jupiter Swap" → runs → results show EffectiveConfigSummary ("what
 *      actually ran": resolved date range, Fees label "Jupiter Swap", margin,
 *      pyramiding, qty, capital, SOL price) + WarningsStrip with the
 *      long-only-suppression warning rendered in amber (warning tone).
 *   2. Same flow with "Jupiter Ultra" → Fees label reads "Jupiter Ultra".
 *   3. Defensive render: legacy result payload (no effectiveConfig, no
 *      warnings) → stat grid / chart / trade table still render, no crash,
 *      no empty boxes for the strip sections.
 *   4. Warnings-only: fee-decision (non-suppression) warning → strip renders
 *      as a normal notice (info tone), NOT amber.
 *   5. Parity sanity: the payload POSTed to /api/backtest contains ONLY
 *      contract fields (no commission/commissionType/currency/useCustomRate/
 *      useCustom).
 *   6. Null-metrics run (all-win, grossLoss=0): the API sanitizes the
 *      infinite ratios to null → Profit Factor / Sharpe / Sortino tiles render
 *      the house em-dash '—' (never 'NaN'/'undefined'/'Infinity') and the
 *      panel does not crash.
 *
 * House integration-test safety rule: EVERY /api/** request is route-mocked
 * and the WebSocket is stubbed in-page — the real backend is never queried and
 * no real data can be touched. Nothing needs cleanup because nothing persists.
 */

const FRONTEND = 'http://localhost:3000';
const JOB_ID = 'qa-parity-trust-job';

const STRATEGY_SOURCE =
  "//@version=5\nstrategy('QA Parity Trust Strategy', initial_capital=10000)\nif close > open\n    strategy.entry('long', strategy.long)";

/** Deterministic run window echoed by the fixture — Jul 1 → Jul 30, 2026 (UTC). */
const RUN_START_MS = Date.UTC(2026, 6, 1);
const RUN_END_MS = Date.UTC(2026, 6, 30);

/** Daily equity/drawdown points for a realistic multi-point chart. */
function makeEquityPoints(count = 20, startMs = RUN_START_MS) {
  const points = [];
  let equity = 10000;
  for (let i = 0; i < count; i++) {
    equity = equity + (i % 3 === 0 ? 120 : i % 3 === 1 ? -40 : 80);
    points.push({
      time: startMs + i * 86_400_000,
      equity: Math.round(equity * 100) / 100,
      drawdown: i > 4 ? -Math.round((i - 4) * 25 * 100) / 100 : 0,
      balance: Math.round(equity * 100) / 100,
    });
  }
  return points;
}

/** Everything a modern result payload carries — minus the parity extension. */
const BASE_RESULT = {
  metrics: {
    totalTrades: 3,
    winningTrades: 2,
    losingTrades: 1,
    winRate: 66.67,
    profitFactor: 1.85,
    totalPnl: 123.4,
    totalPnlPercent: 1.23,
    maxDrawdown: 150,
    maxDrawdownPercent: 1.5,
    sharpeRatio: 1.2,
    sortinoRatio: 1.1,
    averageWin: 80,
    averageLoss: -40,
    largestWin: 100,
    largestLoss: -50,
    averageTradeDuration: 12,
    commission: 4.2,
  },
  equityCurve: [10000, 10120, 10080, 10160, 10240, 10360],
  drawdownCurve: [0, 0, 0, 0, 0, -25],
  trades: [
    {
      id: 't-pt-1',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 110,
      entryTime: RUN_START_MS + 86_400_000,
      exitTime: RUN_START_MS + 2 * 86_400_000,
      quantity: 1,
      pnl: 10,
      pnlPercent: 10,
      commission: 0.5,
      entryName: 'long',
      exitName: 'long',
      mae: -2,
      mfe: 4,
      barsHeld: 8,
    },
    {
      id: 't-pt-2',
      direction: 'long',
      entryPrice: 50,
      exitPrice: 45,
      entryTime: RUN_START_MS + 3 * 86_400_000,
      exitTime: RUN_START_MS + 4 * 86_400_000,
      quantity: 1,
      pnl: -5,
      pnlPercent: -10,
      commission: 0.5,
      entryName: 'long',
      exitName: 'long',
      mae: -3,
      mfe: 1,
      barsHeld: 5,
    },
    {
      id: 't-pt-3',
      direction: 'long',
      entryPrice: 30,
      exitPrice: 28,
      entryTime: RUN_START_MS + 5 * 86_400_000,
      exitTime: RUN_START_MS + 6 * 86_400_000,
      quantity: 2,
      pnl: -4,
      pnlPercent: -6.67,
      commission: 0.5,
      entryName: 'long',
      exitName: 'long',
      mae: -3,
      mfe: 1,
      barsHeld: 10,
    },
  ],
  orders: [],
  equityPoints: makeEquityPoints(),
  monthlyReturns: { '2026-07': 1.23 },
  buyHoldReturn: 1.5,
  barCount: 100,
};

/**
 * The default warning set — mirrors the REAL backend's richer producer set:
 * long-only suppression (amber) + fee-decision (info) + live-fee-cache (info).
 */
const SUPPRESSION_AND_FEE_WARNINGS = [
  {
    type: 'long-only-suppression',
    message: 'Strategy only produces long entries — short trades were suppressed.',
    context: { suppression: 'long-only', suppressedTrades: 0 },
  },
  {
    type: 'fee-decision',
    message: 'No explicit fee settings — used the method default (25 bps).',
    context: { source: 'default', bps: 25 },
  },
  {
    type: 'live-fee-cache',
    message: 'Live fee fetch returned a stale cache — using the cached rate.',
    context: { source: 'cache', ageMs: 60_000, bps: 25 },
  },
];

/** "What actually ran" echo — method mirrors the POSTed commissionMethod. */
function effectiveConfigFor(method: 'jupiter_manual' | 'jupiter_ultra') {
  return {
    commissionMethod: method,
    commissionMethodSettings: { solPriceUsd: 150 },
    startDate: RUN_START_MS,
    endDate: RUN_END_MS,
    marginLong: 1,
    marginShort: 1,
    pyramiding: 0,
    defaultQty: 1,
    defaultQtyType: 'contracts',
    initialCapital: 10000,
    currency: 'USD',
  };
}

type ResultBuilder = (postBody: Record<string, unknown>) => Record<string, unknown>;

/** Stub the WebSocket in-page and mock every /api/** request (house pattern). */
async function installApiMocks(
  page: Page,
  resultBuilder: ResultBuilder,
  onPost?: (body: Record<string, unknown>) => void,
) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      url: string;
      readyState = 0;
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        if (url.includes('/ws/bot')) {
          setTimeout(() => {
            if (this.onopen) this.onopen();
            if (this.onmessage) {
              this.onmessage({
                data: JSON.stringify({
                  channel: 'bot:snapshot',
                  type: 'snapshot',
                  data: {
                    status: {
                      state: 'Idle',
                      strategyName: 'E2E Strategy',
                      dex: 'jupiter-swap',
                      walletPublicKey: null,
                      startedAt: null,
                      uptimeMs: 0,
                      balance: 0,
                      realizedPnl: 0,
                      unrealizedPnl: 0,
                      positions: [],
                      exposure: 0,
                      errors: [],
                    },
                    chaosSignals: [],
                    chaosHeartbeat: null,
                  },
                }),
              });
            }
          }, 0);
        }
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  let lastPostBody: Record<string, unknown> = {};

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    switch (path) {
      case '/api/backtest': {
        if (route.request().method() === 'POST') {
          lastPostBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
          onPost?.(lastPostBody);
          return respond({ job_id: JOB_ID });
        }
        return respond({ success: true });
      }
      case `/api/backtest/${JOB_ID}`:
        return respond({
          status: 'completed',
          progress: 100,
          phase: 'Building results',
          result_url: `/api/backtest/${JOB_ID}/result`,
        });
      case `/api/backtest/${JOB_ID}/result`:
        return respond(resultBuilder(lastPostBody));
      case '/api/backtest/dex-fee':
        return respond({ dexFeeBps: 25, source: 'mock', solPriceUsd: 150 });
      case '/api/backtest/export':
        return respond({ success: true, export_path: '/tmp/mock-export.json' });
      case '/api/bot/wallet/status':
        return respond({ success: true, hasWallet: false, locked: false });
      case '/api/bot/config':
        return respond({
          success: true,
          strategySource: '//@version=5\nstrategy("x")',
          dex: 'jupiter-swap',
          risk: { maxDailyLoss: 1 },
          autoSelect: true,
        });
      case '/api/ohlcv':
      case '/api/ohlcv/seed':
        return respond({ data: [], hasMore: false });
      case '/api/scripts':
      case '/api/scripts/built-in':
        return respond({ scripts: [] });
      case '/api/indicators':
        return respond({ indicators: [] });
      default:
        return respond({ success: true });
    }
  });
}

/** Open the Backtest panel (app boot path). */
async function openBacktestPanel(page: Page) {
  await page.goto(FRONTEND);
  await page.getByRole('button', { name: 'Backtest panel' }).click();
  await expect(page.getByText('Backtest Settings')).toBeVisible();
}

/**
 * Walk the 5-step wizard. On the Commission step, assert the selector offers
 * EXACTLY "Jupiter Swap" + "Jupiter Ultra" (no legacy/pseudo methods), pick the
 * requested method, wait out the mocked fee fetch, then run.
 */
async function runBacktest(
  page: Page,
  method: 'jupiter_manual' | 'jupiter_ultra' = 'jupiter_manual',
) {
  // Step 1 — Strategy: paste raw source (deterministic; no script-list dependency).
  await page.getByRole('button', { name: 'Paste raw source' }).click();
  await page.locator('textarea').fill(STRATEGY_SOURCE);
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 2 — Market (defaults: BTCUSDT / 60).
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 3 — Capital & Date Range (defaults: $10k, last 30 days).
  await page.getByRole('button', { name: /Next/ }).click();

  // Step 4 — Commission: ONLY the two Jupiter methods may be offered.
  await page.getByTitle('Commission model used for the backtest').click();
  const options = page.locator('[role="option"]');
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: 'Jupiter Swap' })).toBeVisible();
  await expect(options.filter({ hasText: 'Jupiter Ultra' })).toBeVisible();

  const label = method === 'jupiter_manual' ? 'Jupiter Swap' : 'Jupiter Ultra';
  await page.getByRole('option', { name: label, exact: true }).click();

  const nextBtn = page.getByRole('button', { name: /Next/ });
  await expect(nextBtn).toBeEnabled({ timeout: 10_000 });
  await nextBtn.click();

  // Step 5 — Review & Run.
  await page.getByRole('button', { name: 'Run Backtest' }).click();
}

/** The results dialog + the strips inside it. */
function resultsDialog(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'Backtest Results' });
}

/** The "What actually ran" summary strip (EffectiveConfigSummary). */
function summaryStrip(dialog: ReturnType<typeof resultsDialog>) {
  return dialog.getByText('What actually ran').locator('..').locator('..');
}

test.describe('backtest parity trust — user-facing acceptance', () => {
  test('Jupiter Swap: "what actually ran" strip + amber long-only-suppression warning', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await installApiMocks(page, (postBody) => ({
      ...BASE_RESULT,
      effectiveConfig: effectiveConfigFor('jupiter_manual'),
      warnings: SUPPRESSION_AND_FEE_WARNINGS,
    }));

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_manual');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // ── EffectiveConfigSummary: "what actually ran" ──
    const summary = summaryStrip(dialog);
    await expect(summary).toBeVisible();
    // Resolved date range rendered (locale-safe: contains the year + the arrow).
    await expect(summary.getByText('Range').locator('..')).toContainText(/2026/);
    await expect(summary.getByText('Range').locator('..')).toContainText('→');
    // Commission label — the user's pick echoed back as "Jupiter Swap".
    await expect(summary.getByText('Fees').locator('..')).toContainText('Jupiter Swap');
    // Effective settings: margin, pyramiding, qty, capital, currency, SOL price.
    await expect(summary.getByText('Margin (L/S)').locator('..')).toContainText('1 / 1');
    await expect(summary.getByText('Pyramiding').locator('..')).toContainText('0');
    await expect(summary.getByText('Qty').locator('..')).toContainText('1 contracts');
    await expect(summary.getByText('Capital').locator('..')).toContainText('10,000');
    await expect(summary.getByText('SOL').locator('..')).toContainText('$150.00');

    // ── WarningsStrip: long-only suppression → AMBER (warning tone) ──
    const warnings = dialog.getByRole('status');
    await expect(warnings).toHaveCount(1);
    await expect(warnings).toHaveClass(/border-yellow-500/);
    await expect(warnings).toContainText('Long-only suppression');
    await expect(warnings).toContainText(
      'Strategy only produces long entries — short trades were suppressed.',
    );
    await expect(warnings).toContainText('Fee decision');
    await expect(warnings).toContainText('used the method default (25 bps)');
    // Live-fee-cache (info) renders inside the amber strip alongside the others.
    await expect(warnings).toContainText('Live fee cache');
    await expect(warnings).toContainText('Live fee fetch returned a stale cache — using the cached rate.');

    // Stat grid + chart + trade table still render under the strips.
    await expect(dialog.getByText('Net Profit')).toBeVisible();
    await expect(dialog.locator('[data-slot="chart"] .recharts-line-curve')).toHaveCount(2);
    await expect(dialog.getByRole('cell', { name: 'L' }).first()).toBeVisible();

    // No uncaught page errors.
    expect(pageErrors).toEqual([]);

    // Evidence screenshot.
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await dialog.screenshot({ path: path.join(ARTIFACTS_DIR, 'parity-trust-jupiter-swap.png') });
  });

  test('Jupiter Ultra: commission label reads "Jupiter Ultra" in the strip', async ({ page }) => {
    await installApiMocks(page, (postBody) => ({
      ...BASE_RESULT,
      effectiveConfig: effectiveConfigFor('jupiter_ultra'),
      warnings: SUPPRESSION_AND_FEE_WARNINGS,
    }));

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_ultra');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const summary = summaryStrip(dialog);
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Fees').locator('..')).toContainText('Jupiter Ultra');
    await expect(summary.getByText('Fees').locator('..')).not.toContainText('Jupiter Swap');

    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await dialog.screenshot({ path: path.join(ARTIFACTS_DIR, 'parity-trust-jupiter-ultra.png') });
  });

  test('legacy payload (no effectiveConfig/warnings) renders defensively — no crash, no empty boxes', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    // Legacy result: the parity extension keys are entirely absent.
    await installApiMocks(page, () => ({ ...BASE_RESULT }));

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_manual');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Core results surface intact: stat grid, chart, trade table.
    await expect(dialog.getByText('Net Profit')).toBeVisible();
    await expect(dialog.getByText('Win Rate')).toBeVisible();
    await expect(dialog.locator('[data-slot="chart"] .recharts-line-curve')).toHaveCount(2);
    await expect(dialog.getByRole('cell', { name: 'L' }).first()).toBeVisible();

    // No strip sections, and no empty boxes for them either.
    await expect(dialog.getByText('What actually ran')).toHaveCount(0);
    await expect(dialog.getByRole('status')).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });

  test('fee-decision warning (non-suppression) renders as a normal notice, NOT amber', async ({
    page,
  }) => {
    await installApiMocks(page, () => ({
      ...BASE_RESULT,
      effectiveConfig: effectiveConfigFor('jupiter_manual'),
      warnings: [
        {
          type: 'fee-decision',
          message: 'Live fee fetch failed — used the cached fallback rate.',
          context: { source: 'fallback', bps: 10 },
        },
      ],
    }));

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_manual');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const warnings = dialog.getByRole('status');
    await expect(warnings).toHaveCount(1);
    await expect(warnings).toContainText('Fee decision');
    await expect(warnings).toContainText('Live fee fetch failed — used the cached fallback rate.');
    // Info tone — a normal notice: muted border, NO amber/yellow.
    await expect(warnings).toHaveClass(/border-border/);
    await expect(warnings).not.toHaveClass(/yellow/);
  });

  test('parity sanity: POST payload carries ONLY contract fields — no legacy keys', async ({
    page,
  }) => {
    let postedBody: Record<string, unknown> | null = null;

    await installApiMocks(
      page,
      (postBody) => ({
        ...BASE_RESULT,
        effectiveConfig: effectiveConfigFor(
          postBody.commissionMethod === 'jupiter_ultra' ? 'jupiter_ultra' : 'jupiter_manual',
        ),
        warnings: SUPPRESSION_AND_FEE_WARNINGS,
      }),
      (body) => {
        postedBody = body;
      },
    );

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_manual');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // The POST happened (dialog only opens after the job is accepted).
    expect(postedBody).not.toBeNull();
    const body = postedBody!;

    // Contract fields present.
    expect(body.commissionMethod).toBe('jupiter_manual');
    expect(body.initialCapital).toBe(10000);
    expect(typeof body.symbol).toBe('string');
    expect(typeof body.timeframe).toBe('string');
    expect(typeof body.script).toBe('string');
    expect(typeof body.startDate).toBe('string');
    expect(typeof body.endDate).toBe('string');

    // Legacy / pseudo / UI-state keys are ABSENT — contract-unknown fields stripped.
    for (const legacyKey of [
      'commission',
      'commissionType',
      'currency',
      'useCustomRate',
      'useCustom',
    ]) {
      expect(Object.keys(body), `legacy key ${legacyKey} must be absent`).not.toContain(legacyKey);
    }
    expect(body.commissionMethodSettings).toBeUndefined();
  });

  test('all-win run (grossLoss=0): Profit Factor / Sharpe / Sortino render the em-dash "—", panel does not crash', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    // All-win fixture: grossLoss=0 makes the ratios infinite, so the backend
    // sanitizes them to null. The results panel must render the house em-dash
    // on the three ratio tiles — never 'NaN'/'Infinity'/'undefined' — and the
    // stat grid, strips, chart and trade table all still render.
    await installApiMocks(page, () => ({
      ...BASE_RESULT,
      metrics: {
        ...BASE_RESULT.metrics,
        totalTrades: 5,
        winningTrades: 5,
        losingTrades: 0,
        winRate: 100,
        profitFactor: null,
        sharpeRatio: null,
        sortinoRatio: null,
        averageLoss: 0,
      },
      trades: [1, 2, 3, 4, 5].map((i) => ({
        id: `t-allwin-${i}`,
        direction: 'long',
        entryPrice: 100,
        exitPrice: 100 + i,
        entryTime: RUN_START_MS + i * 86_400_000,
        exitTime: RUN_START_MS + (i + 1) * 86_400_000,
        quantity: 1,
        pnl: i * 10,
        pnlPercent: i * 10,
        commission: 0.5,
        entryName: 'long',
        exitName: 'long',
        mae: -1,
        mfe: 5,
        barsHeld: 8,
      })),
      effectiveConfig: effectiveConfigFor('jupiter_manual'),
      warnings: SUPPRESSION_AND_FEE_WARNINGS,
    }));

    await openBacktestPanel(page);
    await runBacktest(page, 'jupiter_manual');

    const dialog = resultsDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // ── The three ratio tiles show the house em-dash, and nothing else ──
    const DASH = '\u2014';
    for (const label of ['Profit Factor', 'Sharpe', 'Sortino']) {
      // StatCard DOM: label (h3) → CardHeader → Card (contains the value div).
      const card = dialog.getByText(label).locator('..').locator('..');
      await expect(card).toContainText(DASH);
      await expect(card.locator('.tabular-nums')).toHaveText(DASH);
      await expect(card).not.toContainText('NaN');
      await expect(card).not.toContainText('undefined');
      await expect(card).not.toContainText('Infinity');
    }

    // ── The rest of the results surface still renders ──
    await expect(dialog.getByText('Net Profit')).toBeVisible();
    await expect(dialog.getByText('Win Rate')).toBeVisible();
    await expect(dialog.getByText('100.0%')).toBeVisible();
    await expect(dialog.getByText('What actually ran')).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveCount(1);
    await expect(dialog.locator('[data-slot="chart"] .recharts-line-curve')).toHaveCount(2);
    await expect(dialog.getByRole('cell', { name: 'L' }).first()).toBeVisible();

    // No uncaught page errors — the null-metrics fix must not crash the panel.
    expect(pageErrors).toEqual([]);

    // Evidence screenshot.
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await dialog.screenshot({ path: path.join(ARTIFACTS_DIR, 'parity-trust-allwin-null-metrics.png') });
  });
});
