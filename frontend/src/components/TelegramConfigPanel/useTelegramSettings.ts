import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertConditionData, ChatLanguage, TelegramConfig } from '../../types';
import * as api from './telegramApi';

export type SaveStatus = 'idle' | 'saved' | 'error';
export type TestStatus = 'idle' | 'ok' | 'error';

export interface TelegramStatus {
  saveToken: SaveStatus;
  test: TestStatus;
  proxy: SaveStatus;
  admin: SaveStatus;
}

export interface ProxyDraft {
  host: string;
  port: string;
  username: string;
  password: string;
}

export type ProxyField = keyof ProxyDraft;

export interface AdminDraft {
  userId: string;
  username: string;
}

export interface TelegramSettingsResult {
  data: TelegramConfig | null;
  loading: boolean;
  error: string | null;
  botToken: string;
  setBotToken: (value: string) => void;
  botTokenDirty: boolean;
  proxy: ProxyDraft;
  setProxyField: (field: ProxyField, value: string) => void;
  proxyDirty: boolean;
  showProxyPassword: boolean;
  toggleShowProxyPassword: () => void;
  admin: AdminDraft;
  setAdminField: (field: keyof AdminDraft, value: string) => void;
  alertPrefs: Record<string, Record<number, boolean>>;
  getAlertPref: (chatId: number, alertId: string) => boolean;
  busy: Record<string, boolean>;
  status: TelegramStatus;
  actions: {
    loadConfig: () => Promise<void>;
    refreshConfig: () => Promise<void>;
    saveBotToken: () => Promise<void>;
    sendTest: () => Promise<void>;
    saveProxy: () => Promise<void>;
    setAdmin: () => Promise<void>;
    approveRequest: (userId: number) => Promise<void>;
    denyRequest: (userId: number) => Promise<void>;
    removeController: (userId: number) => Promise<void>;
    updateChatLanguage: (chatId: number, language: ChatLanguage) => Promise<void>;
    linkChat: (chatId: number) => Promise<void>;
    unlinkChat: (chatId: number) => Promise<void>;
    toggleAlert: (chatId: number, alertId: string, currentEnabled: boolean) => Promise<void>;
  };
}

const STATUS_RESET_MS = 2000;
const EMPTY_PROXY: ProxyDraft = { host: '', port: '', username: '', password: '' };

interface SavedProxyState {
  host: string;
  port: number;
  username: string;
  password: string;
}

/**
 * Owns every bit of Telegram panel state and all API mutations. Cards receive
 * slices of this result; the panel calls it exactly once.
 */
export function useTelegramSettings(alertConditions: AlertConditionData[]): TelegramSettingsResult {
  const [data, setData] = useState<TelegramConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botToken, setBotToken] = useState('');
  const [proxy, setProxy] = useState<ProxyDraft>(EMPTY_PROXY);
  const [savedProxy, setSavedProxy] = useState<SavedProxyState | null>(null);
  const [showProxyPassword, setShowProxyPassword] = useState(false);
  const [admin, setAdminDraft] = useState<AdminDraft>({ userId: '', username: '' });
  const [alertPrefs, setAlertPrefs] = useState<Record<string, Record<number, boolean>>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<TelegramStatus>({
    saveToken: 'idle',
    test: 'idle',
    proxy: 'idle',
    admin: 'idle',
  });
  const statusTimers = useRef<number[]>([]);

  const scheduleStatusReset = useCallback((key: 'saveToken' | 'proxy' | 'admin') => {
    const timer = window.setTimeout(() => {
      setStatus((prev) => ({ ...prev, [key]: 'idle' }));
    }, STATUS_RESET_MS);
    statusTimers.current.push(timer);
  }, []);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.fetchTelegramConfig();
      setData(cfg);
      setBotToken(cfg.botToken || '');
      const proxyCfg = await api.fetchProxyConfig();
      if (proxyCfg) {
        setSavedProxy({
          host: proxyCfg.host,
          port: proxyCfg.port,
          username: proxyCfg.username,
          password: '',
        });
        setProxy({
          host: proxyCfg.host,
          port: String(proxyCfg.port),
          username: proxyCfg.username,
          password: '',
        });
      } else {
        setSavedProxy(null);
        setProxy(EMPTY_PROXY);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Telegram settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Re-pull just the control-panel state after a mutation, without the loading overlay. */
  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.fetchTelegramConfig();
      setData(cfg);
      setBotToken(cfg.botToken || '');
    } catch {
      // Keep the last known state when a background refresh fails.
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!data || alertConditions.length === 0 || data.chats.length === 0) return;
    let cancelled = false;
    const loadPrefs = async () => {
      const prefs: Record<string, Record<number, boolean>> = {};
      for (const alert of alertConditions) {
        prefs[alert.id] = {};
        for (const chat of data.chats) {
          try {
            const enabled = await api.fetchAlertPreference(chat.chatId, alert.id);
            if (!cancelled) prefs[alert.id][chat.chatId] = enabled;
          } catch {
            if (!cancelled) prefs[alert.id][chat.chatId] = true;
          }
        }
      }
      if (!cancelled) setAlertPrefs(prefs);
    };
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [data, alertConditions]);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy((prev) => ({ ...prev, [key]: true }));
      try {
        await fn();
        await refreshConfig();
      } catch {
        await refreshConfig();
      } finally {
        setBusy((prev) => ({ ...prev, [key]: false }));
      }
    },
    [refreshConfig],
  );

  const botTokenDirty = botToken !== (data?.botToken ?? '');

  const proxyDirty =
    proxy.host !== (savedProxy?.host ?? '') ||
    proxy.port !== (savedProxy ? String(savedProxy.port) : '') ||
    proxy.username !== (savedProxy?.username ?? '') ||
    proxy.password !== (savedProxy?.password ?? '');

  const saveBotToken = useCallback(async () => {
    setBusy((prev) => ({ ...prev, saveToken: true }));
    setStatus((prev) => ({ ...prev, saveToken: 'idle' }));
    try {
      await api.saveBotToken(botToken);
      setData((prev) => (prev ? { ...prev, botToken } : prev));
      setStatus((prev) => ({ ...prev, saveToken: 'saved' }));
      scheduleStatusReset('saveToken');
    } catch {
      setStatus((prev) => ({ ...prev, saveToken: 'error' }));
    } finally {
      setBusy((prev) => ({ ...prev, saveToken: false }));
    }
  }, [botToken, scheduleStatusReset]);

  const sendTest = useCallback(async () => {
    setBusy((prev) => ({ ...prev, test: true }));
    setStatus((prev) => ({ ...prev, test: 'idle' }));
    try {
      await api.sendTestMessage();
      setStatus((prev) => ({ ...prev, test: 'ok' }));
    } catch {
      setStatus((prev) => ({ ...prev, test: 'error' }));
    } finally {
      setBusy((prev) => ({ ...prev, test: false }));
    }
  }, []);

  const saveProxy = useCallback(async () => {
    setBusy((prev) => ({ ...prev, proxy: true }));
    setStatus((prev) => ({ ...prev, proxy: 'idle' }));
    try {
      if (proxy.host.trim()) {
        const port = Number.parseInt(proxy.port, 10);
        if (Number.isNaN(port) || port <= 0 || port > 65535) {
          setStatus((prev) => ({ ...prev, proxy: 'error' }));
          return;
        }
        const payload = {
          host: proxy.host.trim(),
          port,
          username: proxy.username || undefined,
          password: proxy.password || undefined,
        };
        await api.saveProxyConfig(payload);
        setSavedProxy({
          host: payload.host,
          port,
          username: payload.username ?? '',
          password: payload.password ?? '',
        });
      } else {
        await api.saveProxyConfig(null);
        setSavedProxy(null);
      }
      setStatus((prev) => ({ ...prev, proxy: 'saved' }));
      scheduleStatusReset('proxy');
    } catch {
      setStatus((prev) => ({ ...prev, proxy: 'error' }));
    } finally {
      setBusy((prev) => ({ ...prev, proxy: false }));
    }
  }, [proxy, scheduleStatusReset]);

  const setAdmin = useCallback(async () => {
    const userId = Number.parseInt(admin.userId, 10);
    if (Number.isNaN(userId) || userId <= 0) return;
    setBusy((prev) => ({ ...prev, admin: true }));
    setStatus((prev) => ({ ...prev, admin: 'idle' }));
    try {
      await api.setAdmin(userId, admin.username.trim() || undefined);
      await refreshConfig();
      setStatus((prev) => ({ ...prev, admin: 'saved' }));
      scheduleStatusReset('admin');
    } catch {
      setStatus((prev) => ({ ...prev, admin: 'error' }));
    } finally {
      setBusy((prev) => ({ ...prev, admin: false }));
    }
  }, [admin, refreshConfig, scheduleStatusReset]);

  const approveRequest = useCallback(
    (userId: number) => runAction(`approve:${userId}`, () => api.approveControlRequest(userId)),
    [runAction],
  );

  const denyRequest = useCallback(
    (userId: number) => runAction(`deny:${userId}`, () => api.denyControlRequest(userId)),
    [runAction],
  );

  const removeController = useCallback(
    (userId: number) => runAction(`remove:${userId}`, () => api.removeController(userId)),
    [runAction],
  );

  const updateChatLanguage = useCallback(
    (chatId: number, language: ChatLanguage) =>
      runAction(`lang:${chatId}`, async () => {
        setData((prev) =>
          prev
            ? {
                ...prev,
                chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, language } : c)),
              }
            : prev,
        );
        await api.updateChatLanguage(chatId, language);
      }),
    [runAction],
  );

  const linkChat = useCallback(
    (chatId: number) =>
      runAction(`link:${chatId}`, async () => {
        setData((prev) =>
          prev
            ? {
                ...prev,
                chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, linked: true } : c)),
              }
            : prev,
        );
        await api.linkChat(chatId);
      }),
    [runAction],
  );

  const unlinkChat = useCallback(
    (chatId: number) =>
      runAction(`unlink:${chatId}`, async () => {
        setData((prev) =>
          prev
            ? {
                ...prev,
                chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, linked: false } : c)),
              }
            : prev,
        );
        await api.unlinkChat(chatId);
      }),
    [runAction],
  );

  const toggleAlert = useCallback(
    async (chatId: number, alertId: string, currentEnabled: boolean) => {
      const newEnabled = !currentEnabled;
      setAlertPrefs((prev) => ({
        ...prev,
        [alertId]: { ...prev[alertId], [chatId]: newEnabled },
      }));
      try {
        await api.setAlertPreference(chatId, alertId, newEnabled);
      } catch {
        setAlertPrefs((prev) => ({
          ...prev,
          [alertId]: { ...prev[alertId], [chatId]: currentEnabled },
        }));
      }
    },
    [],
  );

  const getAlertPref = useCallback(
    (chatId: number, alertId: string) => alertPrefs[alertId]?.[chatId] ?? true,
    [alertPrefs],
  );

  const setProxyField = useCallback((field: ProxyField, value: string) => {
    setProxy((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setAdminField = useCallback((field: keyof AdminDraft, value: string) => {
    setAdminDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleShowProxyPassword = useCallback(() => {
    setShowProxyPassword((prev) => !prev);
  }, []);

  return {
    data,
    loading,
    error,
    botToken,
    setBotToken,
    botTokenDirty,
    proxy,
    setProxyField,
    proxyDirty,
    showProxyPassword,
    toggleShowProxyPassword,
    admin,
    setAdminField,
    alertPrefs,
    getAlertPref,
    busy,
    status,
    actions: {
      loadConfig,
      refreshConfig,
      saveBotToken,
      sendTest,
      saveProxy,
      setAdmin,
      approveRequest,
      denyRequest,
      removeController,
      updateChatLanguage,
      linkChat,
      unlinkChat,
      toggleAlert,
    },
  };
}
