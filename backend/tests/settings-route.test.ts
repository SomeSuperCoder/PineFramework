/**
 * Route-level tests for the Telegram control-panel endpoints
 * (backend/src/routes/settings.ts).
 *
 * House style (see bot-route.test.ts / trade-history-route.test.ts): a real
 * express app on an ephemeral port + native fetch, with the router wired to a
 * mutable mock deps object so each endpoint's validation, delegation, and
 * status codes are asserted without touching real storage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSettingsRouter } from '../src/routes/settings.js';
import type {
  TelegramAdmin,
  TelegramChat,
  TelegramControlRequest,
  TelegramController,
} from '../src/store/TelegramConfigStore.js';

// Mocks are typed against the REAL SettingsDeps signatures so the inferred
// return types (undefined / never[]) don't fight mockReturnValue(...) below.
function makeDepsDef() {
  return {
    getBotToken: vi.fn(() => ''),
    setBotToken: vi.fn(),
    getAlertPreference: vi.fn(() => true),
    setAlertPreference: vi.fn(),
    getProxy: vi.fn(() => undefined),
    setProxy: vi.fn(),
    getAdmin: vi.fn((): TelegramAdmin | undefined => undefined),
    setAdmin: vi.fn(),
    getControllers: vi.fn((): TelegramController[] => []),
    addController: vi.fn(() => true),
    removeController: vi.fn(() => true),
    getRequests: vi.fn((): TelegramControlRequest[] => []),
    removeRequest: vi.fn(() => true),
    getChats: vi.fn((): TelegramChat[] => []),
    setChatLanguage: vi.fn(),
    setMemberSubscriptions: vi.fn(),
    linkChat: vi.fn(() => true),
    unlinkChat: vi.fn(() => true),
  };
}

describe('GET /settings/telegram', () => {
  let server: Server;
  let baseUrl: string;
  let deps: ReturnType<typeof makeDepsDef>;

  beforeEach(async () => {
    deps = makeDepsDef();
    const app = express();
    app.use(express.json());
    app.use('/api', createSettingsRouter(deps as never));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('returns the full telegram snapshot', async () => {
    deps.getBotToken.mockReturnValue('tok');
    deps.getAdmin.mockReturnValue({ userId: 7, username: 'admin', configuredAt: 0 });
    deps.getControllers.mockReturnValue([{ userId: 8, username: 'op', grantedAt: 1, grantedBy: 7 }]);
    deps.getRequests.mockReturnValue([{ userId: 9, username: 'req', firstName: 'R', requestedAt: 2 }]);
    deps.getChats.mockReturnValue([{ chatId: 5, type: 'private', linked: true, language: 'en', memberSubscriptions: {} }]);

    const res = await fetch(`${baseUrl}/settings/telegram`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.botToken).toBe('tok');
    expect(body.admin).toEqual({ userId: 7, username: 'admin' });
    expect(body.controllers).toHaveLength(1);
    expect(body.requests).toHaveLength(1);
    expect(body.chats).toHaveLength(1);
  });

  it('puts the new endpoint shape with admin/subscribers defaulting', async () => {
    // PUT botToken
    const res = await fetch(`${baseUrl}/settings/telegram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 't2' }),
    });
    expect(res.status).toBe(200);
    expect(deps.setBotToken).toHaveBeenCalledWith('t2');

    // PUT with non-string botToken → 400
    const bad = await fetch(`${baseUrl}/settings/telegram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 42 }),
    });
    expect(bad.status).toBe(400);
  });
});

describe('PUT /settings/telegram/admin', () => {
  let server: Server;
  let baseUrl: string;
  let deps: ReturnType<typeof makeDepsDef>;

  beforeEach(async () => {
    deps = makeDepsDef();
    const app = express();
    app.use(express.json());
    app.use('/api', createSettingsRouter(deps as never));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('accepts a numeric admin userId', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/admin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 7, username: 'admin' }),
    });
    expect(res.status).toBe(200);
    expect(deps.setAdmin).toHaveBeenCalledWith(7, 'admin');
  });

  it('rejects a non-numeric userId', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/admin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '7' }),
    });
    expect(res.status).toBe(400);
    expect(deps.setAdmin).not.toHaveBeenCalled();
  });
});

describe('controllers & requests endpoints', () => {
  let server: Server;
  let baseUrl: string;
  let deps: ReturnType<typeof makeDepsDef>;

  beforeEach(async () => {
    deps = makeDepsDef();
    deps.getRequests.mockReturnValue([{ userId: 9, username: 'req', firstName: 'R', requestedAt: 2 }]);
    const app = express();
    app.use(express.json());
    app.use('/api', createSettingsRouter(deps as never));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('DELETE removes a controller (numeric id)', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/controllers/12`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(deps.removeController).toHaveBeenCalledWith(12);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.removed).toBe(true);
  });

  it('DELETE rejects a non-numeric controller id', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/controllers/abc`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(deps.removeController).not.toHaveBeenCalled();
  });

  it('POST approve moves a request to a controller, reusing the username', async () => {
    deps.getAdmin.mockReturnValue({ userId: 7, username: 'admin', configuredAt: 0 });
    const res = await fetch(`${baseUrl}/settings/telegram/requests/9/approve`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(deps.removeRequest).toHaveBeenCalledWith(9);
    // username resolved from the request record, grantedBy = admin id.
    expect(deps.addController).toHaveBeenCalledWith(9, 'req', 7);
  });

  it('POST approve returns 404 when there is no pending request (H1)', async () => {
    // H1: never grant a controller without a pending /request — doing so would
    // bypass the operator-approval whitelist entirely.
    deps.getRequests.mockReturnValue([]);
    const res = await fetch(`${baseUrl}/settings/telegram/requests/99/approve`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'No pending request for this user' });
    expect(deps.addController).not.toHaveBeenCalled();
    expect(deps.removeRequest).not.toHaveBeenCalled();
  });

  it('POST approve keeps granting an existing request with the reused username (H1 guard)', async () => {
    deps.getRequests.mockReturnValue([{ userId: 9, username: 'req', firstName: 'R', requestedAt: 2 }]);
    const res = await fetch(`${baseUrl}/settings/telegram/requests/9/approve`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(deps.addController).toHaveBeenCalledWith(9, 'req', 0);
  });

  it('POST deny removes the request', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/requests/9/deny`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(deps.removeRequest).toHaveBeenCalledWith(9);
  });
});

describe('chats endpoints', () => {
  let server: Server;
  let baseUrl: string;
  let deps: ReturnType<typeof makeDepsDef>;

  beforeEach(async () => {
    deps = makeDepsDef();
    const app = express();
    app.use(express.json());
    app.use('/api', createSettingsRouter(deps as never));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('GET returns the chats list', async () => {
    deps.getChats.mockReturnValue([]);
    const res = await fetch(`${baseUrl}/settings/telegram/chats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('PUT language accepts en/es/ru and rejects others', async () => {
    for (const lang of ['en', 'es', 'ru']) {
      const res = await fetch(`${baseUrl}/settings/telegram/chats/5/language`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      expect(res.status).toBe(200);
      expect(deps.setChatLanguage).toHaveBeenCalledWith(5, lang);
    }
    const bad = await fetch(`${baseUrl}/settings/telegram/chats/5/language`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'de' }),
    });
    expect(bad.status).toBe(400);
    expect(deps.setChatLanguage).toHaveBeenCalledTimes(3);
  });

  it('PUT subscriptions validates types', async () => {
    const ok = await fetch(`${baseUrl}/settings/telegram/chats/5/subscriptions/9`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types: ['trading', 'error'] }),
    });
    expect(ok.status).toBe(200);
    expect(deps.setMemberSubscriptions).toHaveBeenCalledWith(5, 9, ['trading', 'error']);

    const bad = await fetch(`${baseUrl}/settings/telegram/chats/5/subscriptions/9`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types: ['bogus'] }),
    });
    expect(bad.status).toBe(400);
  });

  it('POST link and unlink a chat', async () => {
    const link = await fetch(`${baseUrl}/settings/telegram/chats/5/link`, { method: 'POST' });
    expect(link.status).toBe(200);
    expect(deps.linkChat).toHaveBeenCalledWith(5, 0);

    const unlink = await fetch(`${baseUrl}/settings/telegram/chats/5/unlink`, { method: 'POST' });
    expect(unlink.status).toBe(200);
    expect(deps.unlinkChat).toHaveBeenCalledWith(5);
  });
});

describe('B3 — signed chatId vs non-negative userId parsing', () => {
  let server: Server;
  let baseUrl: string;
  let deps: ReturnType<typeof makeDepsDef>;

  beforeEach(async () => {
    deps = makeDepsDef();
    const app = express();
    app.use(express.json());
    app.use('/api', createSettingsRouter(deps as never));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  const NEG = '-1001234567890';

  it('accepts a NEGATIVE chatId for the language route and delegates it', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/chats/${NEG}/language`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'es' }),
    });
    expect(res.status).toBe(200);
    expect(deps.setChatLanguage).toHaveBeenCalledWith(-1001234567890, 'es');
  });

  it('accepts a NEGATIVE chatId and memberId for the subscriptions route', async () => {
    const res = await fetch(
      `${baseUrl}/settings/telegram/chats/${NEG}/subscriptions/${NEG}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: ['error'] }),
      },
    );
    expect(res.status).toBe(200);
    expect(deps.setMemberSubscriptions).toHaveBeenCalledWith(-1001234567890, -1001234567890, ['error']);
  });

  it('accepts a NEGATIVE chatId for link and unlink', async () => {
    const link = await fetch(`${baseUrl}/settings/telegram/chats/${NEG}/link`, { method: 'POST' });
    expect(link.status).toBe(200);
    expect(deps.linkChat).toHaveBeenCalledWith(NEG === '-1001234567890' ? -1001234567890 : 0, 0);

    const unlink = await fetch(`${baseUrl}/settings/telegram/chats/${NEG}/unlink`, { method: 'POST' });
    expect(unlink.status).toBe(200);
    expect(deps.unlinkChat).toHaveBeenCalledWith(-1001234567890);
  });

  it('REJECTS a negative id on the controller DELETE route (userId must be non-negative)', async () => {
    const res = await fetch(`${baseUrl}/settings/telegram/controllers/${NEG}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(deps.removeController).not.toHaveBeenCalled();
  });

  it('REJECTS a negative id on the approve and deny routes (userId must be non-negative)', async () => {
    const approve = await fetch(`${baseUrl}/settings/telegram/requests/${NEG}/approve`, { method: 'POST' });
    expect(approve.status).toBe(400);
    expect(deps.addController).not.toHaveBeenCalled();

    const deny = await fetch(`${baseUrl}/settings/telegram/requests/${NEG}/deny`, { method: 'POST' });
    expect(deny.status).toBe(400);
    expect(deps.removeRequest).not.toHaveBeenCalled();
  });
});