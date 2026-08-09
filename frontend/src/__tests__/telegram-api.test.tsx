/**
 * Unit tests for the Telegram panel API layer (telegramApi.ts) — the first
 * coverage for this module (redesigned Telegram settings screen).
 *
 * Asserts the fetch contract per helper (endpoint, method, headers, body)
 * plus error propagation through ensureOk. Fetch is stubbed at the global
 * boundary — the module under test is the real adapter, not a mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchTelegramConfig,
  saveBotToken,
  sendTestMessage,
  fetchAlertPreference,
  setAlertPreference,
  fetchProxyConfig,
  saveProxyConfig,
  setAdmin,
  approveControlRequest,
  denyControlRequest,
  removeController,
  updateChatLanguage,
  linkChat,
  unlinkChat,
} from '../components/TelegramConfigPanel/telegramApi';

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function errorResponse(status: number, body?: unknown): Response {
  return {
    ok: false,
    status,
    json: () =>
      body === undefined
        ? Promise.reject(new Error('not json'))
        : Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('GET helpers', () => {
  it('fetchTelegramConfig GETs /api/settings/telegram and returns the parsed config', async () => {
    const cfg = { botToken: 'abc', admin: null, controllers: [], requests: [], chats: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse(cfg));
    await expect(fetchTelegramConfig()).resolves.toEqual(cfg);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram');
  });

  it('fetchProxyConfig GETs /api/settings/telegram/proxy (null-safe)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    await expect(fetchProxyConfig()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/proxy');
  });

  it('fetchAlertPreference GETs the chat-scoped route and returns data.enabled', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: false }));
    await expect(fetchAlertPreference(42, 'alert-1')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/alerts/alert-1/telegram?chatId=42');
  });
});

describe('PUT helpers', () => {
  it('saveBotToken PUTs { botToken } with JSON headers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(saveBotToken('tok-123')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'tok-123' }),
    });
  });

  it('setAlertPreference PUTs { enabled } to the chat-scoped route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await setAlertPreference(7, 'a2', true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/alerts/a2/telegram?chatId=7',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true }) }),
    );
  });

  it('saveProxyConfig PUTs the full proxy payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await saveProxyConfig({ host: '127.0.0.1', port: 8080, username: 'u', password: 'p' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/telegram/proxy',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ host: '127.0.0.1', port: 8080, username: 'u', password: 'p' }),
      }),
    );
  });

  it('saveProxyConfig PUTs null when clearing the proxy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await saveProxyConfig(null);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/telegram/proxy',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(null) }),
    );
  });

  it('setAdmin PUTs userId + username when a username is provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await setAdmin(99, 'alice');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/telegram/admin',
      expect.objectContaining({ body: JSON.stringify({ userId: 99, username: 'alice' }) }),
    );
  });

  it('setAdmin omits username when undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await setAdmin(99);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/telegram/admin',
      expect.objectContaining({ body: JSON.stringify({ userId: 99 }) }),
    );
  });

  it('updateChatLanguage PUTs { language } to the chat language route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await updateChatLanguage(3, 'es');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/telegram/chats/3/language',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ language: 'es' }) }),
    );
  });
});

describe('POST / DELETE helpers', () => {
  it('sendTestMessage POSTs /api/telegram/test', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await sendTestMessage();
    expect(fetchMock).toHaveBeenCalledWith('/api/telegram/test', { method: 'POST' });
  });

  it('approveControlRequest POSTs the approve route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await approveControlRequest(11);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/requests/11/approve', {
      method: 'POST',
    });
  });

  it('denyControlRequest POSTs the deny route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await denyControlRequest(12);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/requests/12/deny', {
      method: 'POST',
    });
  });

  it('removeController DELETEs the controller route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await removeController(13);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/controllers/13', {
      method: 'DELETE',
    });
  });

  it('linkChat POSTs the chat link route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await linkChat(5);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/chats/5/link', { method: 'POST' });
  });

  it('unlinkChat POSTs the chat unlink route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await unlinkChat(6);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/telegram/chats/6/unlink', {
      method: 'POST',
    });
  });
});

describe('error propagation (ensureOk)', () => {
  it('throws with the JSON detail message on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(400, { message: 'invalid token' }));
    await expect(saveBotToken('x')).rejects.toThrow('Telegram API 400: invalid token');
  });

  it('throws the generic status message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchTelegramConfig()).rejects.toThrow('Telegram API request failed (500)');
  });

  it('does not throw on a successful response with an empty body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(sendTestMessage()).resolves.toBeUndefined();
  });
});
