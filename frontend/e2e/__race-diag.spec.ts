import { test, expect } from '@playwright/test';

const FRONTEND = 'http://localhost:3000';

test('diag — About click during the tunnel (pre-onReady) race', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeWebSocket { url: string; readyState = 0; static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3; onopen: (()=>void)|null=null; onmessage: ((ev:{data:string})=>void)|null=null; onclose: (()=>void)|null=null; onerror: ((ev:unknown)=>void)|null=null;
      constructor(url: string) { this.url = url; if (url.includes('/ws/bot')) { setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ channel: 'bot:snapshot', type: 'snapshot', data: { status: { state: 'Idle', strategyName: 'E2E Strategy', dex: 'jupiter-swap', walletPublicKey: null, startedAt: null, uptimeMs: 0, balance: 0, realizedPnl: 0, unrealizedPnl: 0, positions: [], exposure: 0, errors: [] }, chaosSignals: [], chaosHeartbeat: null } }) }); }, 0); } }
      send() {} close() {} addEventListener() {} removeEventListener() {}
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });
  await page.route('**/api/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
  await page.goto(FRONTEND);
  await expect(page.getByRole('heading', { name: 'Write it in PineScript. Trade it live.' })).toBeVisible();

  // Click About IMMEDIATELY after Get Started — well inside the 400ms P1 window.
  await page.getByRole('button', { name: 'Get Started' }).first().click();
  await page.getByRole('button', { name: 'About' }).click({ timeout: 3000 });

  // Wait out the whole transition + settle.
  await page.waitForTimeout(2600);
  const state = await page.evaluate(() => ({
    hero: !!document.getElementById('landing-title'),
    topbar: !!document.querySelector('[data-testid="topbar"]'),
    overlay: !!document.querySelector('[data-testid="tunnel-overlay"]'),
    flag: localStorage.getItem('pine-landing-entered'),
  }));
  console.log('RACE:', JSON.stringify(state));
});
