/**
 * Hook tests for useTelegramSettings — the state owner of the redesigned
 * Telegram settings panel. The telegramApi module is mocked at the boundary
 * so all actions are fast and deterministic (no network).
 *
 * Covers: initial load seeding, dirty flags, saveBotToken (success/failure/
 * in-flight busy), proxy port validation (no API call on bad port), saveProxy
 * payload shape, toggleAlert optimistic rollback, sendTest statuses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTelegramSettings } from '../components/TelegramConfigPanel/useTelegramSettings';
import type { TelegramConfig, ProxyConfig } from '../types';

const api = vi.hoisted(() => ({
  fetchTelegramConfig: vi.fn(),
  fetchProxyConfig: vi.fn(),
  saveBotToken: vi.fn(),
  sendTestMessage: vi.fn(),
  saveProxyConfig: vi.fn(),
  setAlertPreference: vi.fn(),
}));

vi.mock('../components/TelegramConfigPanel/telegramApi', () => api);

const CONFIG: TelegramConfig = {
  botToken: 'tok-1',
  admin: null,
  controllers: [],
  requests: [],
  chats: [],
};

const PROXY: ProxyConfig = { host: '127.0.0.1', port: 8080, username: 'alice' };

beforeEach(() => {
  api.fetchTelegramConfig.mockResolvedValue(CONFIG);
  api.fetchProxyConfig.mockResolvedValue(PROXY);
  api.saveBotToken.mockResolvedValue(undefined);
  api.saveProxyConfig.mockResolvedValue(undefined);
  api.sendTestMessage.mockResolvedValue(undefined);
  api.setAlertPreference.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useTelegramSettings', () => {
  it('loads config + proxy on mount and seeds botToken + proxy fields', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchTelegramConfig).toHaveBeenCalledTimes(1);
    expect(api.fetchProxyConfig).toHaveBeenCalledTimes(1);
    expect(result.current.botToken).toBe('tok-1');
    expect(result.current.proxy).toEqual({
      host: '127.0.0.1',
      port: '8080',
      username: 'alice',
      password: '',
    });
    expect(result.current.botTokenDirty).toBe(false);
    expect(result.current.proxyDirty).toBe(false);
  });

  it('dirty flags flip when the draft diverges from the saved state', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setBotToken('new-token'));
    expect(result.current.botTokenDirty).toBe(true);

    act(() => result.current.setProxyField('host', '10.0.0.1'));
    expect(result.current.proxyDirty).toBe(true);
  });

  it('saveBotToken calls the api with the draft and reports saved', async () => {
    // First call = initial load; refreshConfig after save returns the updated token.
    api.fetchTelegramConfig.mockResolvedValueOnce(CONFIG);
    api.fetchTelegramConfig.mockResolvedValue({ ...CONFIG, botToken: 'tok-2' });
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setBotToken('tok-2'));
    await act(async () => {
      await result.current.actions.saveBotToken();
    });

    expect(api.saveBotToken).toHaveBeenCalledWith('tok-2');
    expect(result.current.status.saveToken).toBe('saved');
    expect(result.current.busy.saveToken).toBe(false);
    expect(result.current.data?.botToken).toBe('tok-2');
  });

  it('saveBotToken failure sets error status without a crash', async () => {
    api.saveBotToken.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setBotToken('tok-3'));
    await act(async () => {
      await result.current.actions.saveBotToken();
    });

    expect(result.current.status.saveToken).toBe('error');
    expect(result.current.busy.saveToken).toBe(false);
  });

  it('busy.saveToken is true while saveBotToken is in flight', async () => {
    let resolveSave!: () => void;
    api.saveBotToken.mockImplementationOnce(
      () => new Promise<void>((res) => (resolveSave = res)),
    );
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setBotToken('tok-4'));
    let promise!: Promise<void>;
    act(() => {
      promise = result.current.actions.saveBotToken();
    });
    expect(result.current.busy.saveToken).toBe(true);

    await act(async () => {
      resolveSave();
      await promise;
    });
    expect(result.current.busy.saveToken).toBe(false);
  });

  it('rejects an out-of-range proxy port with error status and NO api call', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setProxyField('host', '10.0.0.1');
      result.current.setProxyField('port', '70000');
    });
    await act(async () => {
      await result.current.actions.saveProxy();
    });

    expect(result.current.status.proxy).toBe('error');
    expect(api.saveProxyConfig).not.toHaveBeenCalled();
    expect(result.current.busy.proxy).toBe(false);
  });

  it('saves a valid proxy with the parsed payload and reports saved', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setProxyField('host', ' 10.0.0.1 ');
      result.current.setProxyField('port', '3128');
    });
    await act(async () => {
      await result.current.actions.saveProxy();
    });

    expect(api.saveProxyConfig).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 3128,
      // Loaded proxy seeded username 'alice'; only host/port were edited.
      username: 'alice',
      password: undefined,
    });
    expect(result.current.status.proxy).toBe('saved');
    expect(result.current.busy.proxy).toBe(false);
  });

  it('clears the proxy by PUTting null when the host is blank', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setProxyField('host', ''));
    await act(async () => {
      await result.current.actions.saveProxy();
    });

    expect(api.saveProxyConfig).toHaveBeenCalledWith(null);
    expect(result.current.status.proxy).toBe('saved');
  });

  it('toggleAlert flips optimistically and rolls back on API failure', async () => {
    api.setAlertPreference.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.actions.toggleAlert(1, 'a1', false);
    });
    // Optimistic flip is visible immediately.
    expect(result.current.getAlertPref(1, 'a1')).toBe(true);
    expect(api.setAlertPreference).toHaveBeenCalledWith(1, 'a1', true);

    // After the rejection lands, the pref reverts to the previous value.
    await waitFor(() => expect(result.current.getAlertPref(1, 'a1')).toBe(false));
  });

  it('sendTest reports ok on success and error on failure', async () => {
    const { result } = renderHook(() => useTelegramSettings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.sendTest();
    });
    expect(api.sendTestMessage).toHaveBeenCalledTimes(1);
    expect(result.current.status.test).toBe('ok');

    api.sendTestMessage.mockRejectedValueOnce(new Error('net'));
    await act(async () => {
      await result.current.actions.sendTest();
    });
    expect(result.current.status.test).toBe('error');
  });
});
