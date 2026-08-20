import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:3000';

test('diag — timer identities via schedule-time stacks', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__timerLog = [];
    const origSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: any[]) => {
      const delay = ms ?? 0;
      const schedAt = performance.now();
      const stack = new Error().stack ?? '';
      const id = origSetTimeout(() => {
        (window as any).__timerLog.push({
          delay: Math.round(delay),
          schedAt: Math.round(schedAt),
          firedAt: Math.round(performance.now()),
          src: stack.split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').slice(0, 90)).join(' | '),
        });
        if (typeof fn === 'function') (fn as any)(...args);
        else (0, eval)(fn);
      }, delay, ...args);
      return id;
    }) as any;
    class FakeWebSocket { url: string; readyState = 0; static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3; onopen: (()=>void)|null=null; onmessage: ((ev:{data:string})=>void)|null=null; onclose: (()=>void)|null=null; onerror: ((ev:unknown)=>void)|null=null;
      constructor(url: string) { this.url = url; if (url.includes('/ws/bot')) { setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ channel: 'bot:snapshot', type: 'snapshot', data: { status: { state: 'Idle', strategyName: 'E2E Strategy', dex: 'jupiter-swap', walletPublicKey: null, startedAt: null, uptimeMs: 0, balance: 0, realizedPnl: 0, unrealizedPnl: 0, positions: [], exposure: 0, errors: [] }, chaosSignals: [], chaosHeartbeat: null } }) }); }, 0); } }
      send() {} close() {} addEventListener() {} removeEventListener() {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });
  await page.route('**/api/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
  await page.goto(FRONTEND);
  await expect(page.getByRole('heading', { name: 'Write it in PineScript. Trade it live.' })).toBeVisible();
  const clickT = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Get Started' }).first().click();
  await page.waitForTimeout(3200);
  const log = await page.evaluate((t0) => (window as any).__timerLog.map((e: any) => ({ ...e, relClick: e.schedAt - t0, relFire: e.firedAt - t0 })), clickT);
  const interesting = log.filter((e: any) => e.delay >= 100);
  console.log('TIMERS:', JSON.stringify(interesting, null, 1));
});
