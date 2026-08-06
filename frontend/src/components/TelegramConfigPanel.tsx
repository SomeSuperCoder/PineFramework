import { useState, useEffect, useCallback } from 'react';
import type {
  TelegramConfig,
  TelegramChat,
  AlertConditionData,
  ProxyConfig,
  NotificationType,
  ChatLanguage,
} from '../types';
import { NOTIFICATION_TYPES } from '../types';

interface TelegramConfigPanelProps {
  alertConditions: AlertConditionData[];
  isOpen: boolean;
  onToggle: () => void;
}

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  trading: 'Trading',
  position_open: 'Position Open',
  position_close: 'Position Close',
  report: 'Report',
  daily: 'Daily',
  error: 'Error',
  bot_lifecycle: 'Bot Lifecycle',
};

const CHAT_LANGUAGES: ChatLanguage[] = ['en', 'es', 'ru'];
const CHAT_LANGUAGE_LABELS: Record<ChatLanguage, string> = {
  en: 'English',
  es: 'Español',
  ru: 'Русский',
};

async function fetchTelegramConfig(): Promise<TelegramConfig> {
  const res = await fetch('/api/settings/telegram');
  return res.json();
}

async function saveBotToken(token: string): Promise<void> {
  await fetch('/api/settings/telegram', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken: token }),
  });
}

async function sendTestMessage(): Promise<void> {
  await fetch('/api/telegram/test', { method: 'POST' });
}

async function fetchAlertPreference(chatId: number, alertId: string): Promise<boolean> {
  const res = await fetch(`/api/settings/alerts/${alertId}/telegram?chatId=${chatId}`);
  const data = await res.json();
  return data.enabled;
}

async function setAlertPreference(chatId: number, alertId: string, enabled: boolean): Promise<void> {
  await fetch(`/api/settings/alerts/${alertId}/telegram?chatId=${chatId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

async function fetchProxyConfig(): Promise<ProxyConfig | null> {
  const res = await fetch('/api/settings/telegram/proxy');
  const data = await res.json();
  return data;
}

async function saveProxyConfig(proxy: { host: string; port: number; username?: string; password?: string } | null): Promise<void> {
  await fetch('/api/settings/telegram/proxy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxy),
  });
}

async function putJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function setAdmin(userId: number, username?: string): Promise<void> {
  await putJson('/api/settings/telegram/admin', username ? { userId, username } : { userId });
}

async function approveControlRequest(userId: number): Promise<void> {
  await fetch(`/api/settings/telegram/requests/${userId}/approve`, { method: 'POST' });
}

async function denyControlRequest(userId: number): Promise<void> {
  await fetch(`/api/settings/telegram/requests/${userId}/deny`, { method: 'POST' });
}

async function removeController(userId: number): Promise<void> {
  await fetch(`/api/settings/telegram/controllers/${userId}`, { method: 'DELETE' });
}

async function updateChatLanguage(chatId: number, language: ChatLanguage): Promise<void> {
  await putJson(`/api/settings/telegram/chats/${chatId}/language`, { language });
}

async function updateSubscriptions(chatId: number, memberId: string, types: NotificationType[]): Promise<void> {
  await putJson(`/api/settings/telegram/chats/${chatId}/subscriptions/${memberId}`, { types });
}

async function linkChat(chatId: number): Promise<void> {
  await fetch(`/api/settings/telegram/chats/${chatId}/link`, { method: 'POST' });
}

async function unlinkChat(chatId: number): Promise<void> {
  await fetch(`/api/settings/telegram/chats/${chatId}/unlink`, { method: 'POST' });
}

export function TelegramConfigPanel({ alertConditions, isOpen }: TelegramConfigPanelProps) {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [alertPrefs, setAlertPrefs] = useState<Record<string, Record<number, boolean>>>({});
  const [, setProxy] = useState<ProxyConfig | null>(null);
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [showProxyPassword, setShowProxyPassword] = useState(false);
  const [proxySaving, setProxySaving] = useState(false);
  const [proxySaveStatus, setProxySaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [adminUserId, setAdminUserId] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetchTelegramConfig();
      setConfig(cfg);
      setBotToken(cfg.botToken || '');
      const proxyCfg = await fetchProxyConfig();
      setProxy(proxyCfg);
      setProxyHost(proxyCfg?.host || '');
      setProxyPort(proxyCfg?.port ? String(proxyCfg.port) : '');
      setProxyUsername(proxyCfg?.username || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  /** Re-pull just the control-panel state after a mutation, without the loading overlay. */
  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await fetchTelegramConfig();
      setConfig(cfg);
      setBotToken(cfg.botToken || '');
    } catch {
      // keep last state on failure
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadConfig();
  }, [isOpen, loadConfig]);

  useEffect(() => {
    if (isOpen && config && alertConditions.length > 0 && config.chats.length > 0) {
      const loadPrefs = async () => {
        const prefs: Record<string, Record<number, boolean>> = {};
        for (const alert of alertConditions) {
          prefs[alert.id] = {};
          for (const chat of config.chats) {
            try {
              const enabled = await fetchAlertPreference(chat.chatId, alert.id);
              prefs[alert.id][chat.chatId] = enabled;
            } catch {
              prefs[alert.id][chat.chatId] = true;
            }
          }
        }
        setAlertPrefs(prefs);
      };
      loadPrefs();
    }
  }, [isOpen, config, alertConditions]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
      await refreshConfig();
    } catch {
      await refreshConfig();
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await saveBotToken(botToken);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestSending(true);
    try {
      await sendTestMessage();
    } catch {
      // ignore
    } finally {
      setTestSending(false);
    }
  };

  const handleProxySave = async () => {
    setProxySaving(true);
    setProxySaveStatus('idle');
    try {
      if (proxyHost.trim()) {
        const port = parseInt(proxyPort, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          setProxySaveStatus('error');
          setProxySaving(false);
          return;
        }
        await saveProxyConfig({
          host: proxyHost.trim(),
          port,
          username: proxyUsername || undefined,
          password: proxyPassword || undefined,
        });
      } else {
        await saveProxyConfig(null);
      }
      setProxySaveStatus('saved');
      setTimeout(() => setProxySaveStatus('idle'), 2000);
    } catch {
      setProxySaveStatus('error');
    } finally {
      setProxySaving(false);
    }
  };

  const handleSetAdmin = async () => {
    const userId = parseInt(adminUserId, 10);
    if (Number.isNaN(userId) || userId <= 0) return;
    await runAction('admin', () => setAdmin(userId, adminUsername.trim() || undefined));
  };

  const handleApprove = (userId: number) => runAction(`approve:${userId}`, () => approveControlRequest(userId));
  const handleDeny = (userId: number) => runAction(`deny:${userId}`, () => denyControlRequest(userId));
  const handleRemoveController = (userId: number) => runAction(`remove:${userId}`, () => removeController(userId));

  const handleChatLanguage = (chatId: number, language: ChatLanguage) =>
    runAction(`lang:${chatId}`, async () => {
      setConfig((prev) =>
        prev
          ? { ...prev, chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, language } : c)) }
          : prev,
      );
      await updateChatLanguage(chatId, language);
    });

  const handleLink = (chatId: number) =>
    runAction(`link:${chatId}`, async () => {
      setConfig((prev) =>
        prev
          ? { ...prev, chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, linked: true } : c)) }
          : prev,
      );
      await linkChat(chatId);
    });

  const handleUnlink = (chatId: number) =>
    runAction(`unlink:${chatId}`, async () => {
      setConfig((prev) =>
        prev
          ? { ...prev, chats: prev.chats.map((c) => (c.chatId === chatId ? { ...c, linked: false } : c)) }
          : prev,
      );
      await unlinkChat(chatId);
    });

  const handleMemberType = (chat: TelegramChat, memberId: string, type: NotificationType) => {
    const current = chat.memberSubscriptions[memberId] ?? [];
    const enabled = current.includes(type);
    const next = enabled ? current.filter((t) => t !== type) : [...current, type];
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            chats: prev.chats.map((c) =>
              c.chatId === chat.chatId
                ? { ...c, memberSubscriptions: { ...c.memberSubscriptions, [memberId]: next } }
                : c,
            ),
          }
        : prev,
    );
    updateSubscriptions(chat.chatId, memberId, next).catch(() => refreshConfig());
  };

  const toggleAlert = async (chatId: number, alertId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    setAlertPrefs((prev) => ({
      ...prev,
      [alertId]: { ...prev[alertId], [chatId]: newEnabled },
    }));
    try {
      await setAlertPreference(chatId, alertId, newEnabled);
    } catch {
      setAlertPrefs((prev) => ({
        ...prev,
        [alertId]: { ...prev[alertId], [chatId]: currentEnabled },
      }));
    }
  };

  return isOpen ? (
    <div
      className="telegram-panel"
      style={{
        position: 'fixed',
        top: '60px',
        right: '20px',
        width: '420px',
        maxHeight: 'calc(100vh - 180px)',
        overflowY: 'auto',
        background: '#0f1520',
        border: '1px solid #111128',
        borderRadius: '8px',
        padding: '20px',
        zIndex: 99,
        color: '#e0e0e0',
        fontSize: '13px',
      }}
    >
      <h3 style={{ margin: '0 0 16px', color: '#2196f3' }}>Telegram Configuration</h3>

      {loading && <div style={{ color: '#888' }}>Loading...</div>}

      {!loading && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Bot Token</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Enter your bot token"
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#0d0d18',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  background: saving ? '#333' : '#2196f3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? '...' : 'Save'}
              </button>
            </div>
            {saveStatus === 'saved' && (
              <div style={{ marginTop: '4px', color: '#4caf50', fontSize: '11px' }}>Token saved</div>
            )}
            {saveStatus === 'error' && (
              <div style={{ marginTop: '4px', color: '#e94560', fontSize: '11px' }}>Failed to save</div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Test</label>
            <button
              onClick={handleTest}
              disabled={testSending || !botToken}
              style={{
                padding: '6px 12px',
                background: testSending ? '#333' : '#4caf50',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: testSending || !botToken ? 'not-allowed' : 'pointer',
              }}
            >
              {testSending ? 'Sending...' : 'Send Test Message'}
            </button>
          </div>

          <div style={{ marginBottom: '16px', borderTop: '1px solid #111128', paddingTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>
              SOCKS5 Proxy (optional)
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <input
                type="text"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                placeholder="Host (e.g., 127.0.0.1)"
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#0d0d18',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
              <input
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                placeholder="Port"
                min={1}
                max={65535}
                style={{
                  width: '80px',
                  padding: '6px',
                  background: '#0d0d18',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <input
                type="text"
                value={proxyUsername}
                onChange={(e) => setProxyUsername(e.target.value)}
                placeholder="Username (optional)"
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#0d0d18',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showProxyPassword ? 'text' : 'password'}
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  placeholder="Password (optional)"
                  style={{
                    width: '100%',
                    padding: '6px',
                    paddingRight: '28px',
                    background: '#0d0d18',
                    color: '#e0e0e0',
                    border: '1px solid #111128',
                    borderRadius: '4px',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowProxyPassword(!showProxyPassword)}
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 4px',
                  }}
                >
                  {showProxyPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleProxySave}
                disabled={proxySaving}
                style={{
                  padding: '6px 12px',
                  background: proxySaving ? '#333' : '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: proxySaving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '12px',
                }}
              >
                {proxySaving ? '...' : 'Save Proxy'}
              </button>
              {proxySaveStatus === 'saved' && (
                <span style={{ color: '#4caf50', fontSize: '11px' }}>Proxy saved</span>
              )}
              {proxySaveStatus === 'error' && (
                <span style={{ color: '#e94560', fontSize: '11px' }}>Failed to save</span>
              )}
            </div>
          </div>

          {config && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>
                Admin
              </div>
              {config.admin ? (
                <div
                  style={{
                    padding: '6px 8px',
                    background: '#0d0d18',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#e0e0e0',
                  }}
                >
                  {'@'}
                  {config.admin.username || config.admin.userId}
                  <span style={{ color: '#aaa' }}> (ID: {config.admin.userId})</span>
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '12px' }}>Not configured</div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="number"
                  value={adminUserId}
                  onChange={(e) => setAdminUserId(e.target.value)}
                  placeholder="User ID"
                  aria-label="Admin Telegram user ID"
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: '#0d0d18',
                    color: '#e0e0e0',
                    border: '1px solid #111128',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                />
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="@username (optional)"
                  aria-label="Admin username (optional)"
                  style={{
                    flex: 1.5,
                    padding: '6px',
                    background: '#0d0d18',
                    color: '#e0e0e0',
                    border: '1px solid #111128',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                />
                <button
                  onClick={handleSetAdmin}
                  disabled={busy['admin'] || !adminUserId.trim()}
                  style={{
                    padding: '6px 10px',
                    background: busy['admin'] ? '#333' : '#2196f3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: busy['admin'] || !adminUserId.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                  }}
                >
                  {busy['admin'] ? '...' : 'Set as Admin'}
                </button>
              </div>
            </div>
          )}

          {config && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>
                Controller Requests ({config.requests.length})
              </div>
              {config.requests.length === 0 && (
                <div style={{ color: '#888', fontSize: '12px' }}>
                  No controller requests pending.
                </div>
              )}
              {config.requests.map((req) => (
                <div
                  key={req.userId}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: '#0d0d18',
                    borderRadius: '4px',
                    border: '1px solid #111128',
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#e0e0e0' }}>
                    @{req.username || req.userId}
                    {req.firstName && <span style={{ color: '#888', fontWeight: 'normal' }}> · {req.firstName}</span>}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px' }}>
                    ID: {req.userId}
                    {req.requestedAt ? ` · requested ${new Date(req.requestedAt).toLocaleString()}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleApprove(req.userId)}
                      disabled={busy[`approve:${req.userId}`]}
                      style={{
                        padding: '4px 10px',
                        background: busy[`approve:${req.userId}`] ? '#333' : '#4caf50',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: busy[`approve:${req.userId}`] ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {busy[`approve:${req.userId}`] ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleDeny(req.userId)}
                      disabled={busy[`deny:${req.userId}`]}
                      style={{
                        padding: '4px 10px',
                        background: busy[`deny:${req.userId}`] ? '#333' : '#e94560',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: busy[`deny:${req.userId}`] ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {busy[`deny:${req.userId}`] ? '...' : 'Deny'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {config && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>
                Controllers ({config.controllers.length})
              </div>
              {config.controllers.length === 0 && (
                <div style={{ color: '#888', fontSize: '12px' }}>
                  No controllers yet.
                </div>
              )}
              {config.controllers.map((ctrl) => (
                <div
                  key={ctrl.userId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    marginTop: '4px',
                    background: '#0d0d18',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <span>
                    @{ctrl.username || ctrl.userId}
                    <span style={{ color: '#aaa' }}> (ID: {ctrl.userId})</span>
                  </span>
                  <button
                    onClick={() => handleRemoveController(ctrl.userId)}
                    disabled={busy[`remove:${ctrl.userId}`]}
                    style={{
                      padding: '3px 8px',
                      background: busy[`remove:${ctrl.userId}`] ? '#333' : '#e94560',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: busy[`remove:${ctrl.userId}`] ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {busy[`remove:${ctrl.userId}`] ? '...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {config && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>
                Chats ({config.chats.length})
              </div>
              {config.chats.length === 0 && (
                <div style={{ color: '#888', fontSize: '12px' }}>
                  No chats yet. Start the bot to link chats.
                </div>
              )}
              {config.chats.map((chat) => {
                const members =
                  chat.type === 'private'
                    ? [String(chat.chatId)]
                    : Object.keys(chat.memberSubscriptions);
                return (
                  <div
                    key={chat.chatId}
                    style={{
                      padding: '8px',
                      marginBottom: '6px',
                      background: '#0d0d18',
                      borderRadius: '4px',
                      border: '1px solid #111128',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: chat.type === 'group' ? '#5c6bc0' : '#26a69a',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                          }}
                        >
                          {chat.type === 'group' ? 'Group' : 'Private'}
                        </span>
                        <span style={{ fontWeight: 'bold', marginLeft: '6px', color: '#e0e0e0' }}>
                          {chat.title || `Chat ${chat.chatId}`}
                        </span>
                      </div>
                      {chat.type === 'group' && (
                        <button
                          onClick={() => (chat.linked ? handleUnlink(chat.chatId) : handleLink(chat.chatId))}
                          disabled={busy[`${chat.linked ? 'unlink' : 'link'}:${chat.chatId}`]}
                          style={{
                            padding: '3px 8px',
                            background: chat.linked
                              ? busy[`unlink:${chat.chatId}`]
                                ? '#333'
                                : '#e94560'
                              : busy[`link:${chat.chatId}`]
                                ? '#333'
                                : '#4caf50',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {busy[`${chat.linked ? 'unlink' : 'link'}:${chat.chatId}`] ? '...' : chat.linked ? 'Unlink' : 'Link'}
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        color: '#888',
                        fontSize: '11px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>Chat ID: {chat.chatId}</span>
                      <span>· {chat.type === 'group' ? chat.linked ? 'Linked' : 'Not linked' : 'Always linked'}</span>
                      <span>· Language:</span>
                      <select
                        value={chat.language}
                        onChange={(e) => handleChatLanguage(chat.chatId, e.target.value as ChatLanguage)}
                        disabled={busy[`lang:${chat.chatId}`]}
                        aria-label={`Language for chat ${chat.chatId}`}
                        style={{
                          padding: '3px 4px',
                          background: '#0d0d18',
                          color: '#e0e0e0',
                          border: '1px solid #111128',
                          borderRadius: '4px',
                          fontSize: '11px',
                        }}
                      >
                        {CHAT_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {CHAT_LANGUAGE_LABELS[lang]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {chat.type === 'group' && members.length === 0 && (
                      <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
                        No members yet.
                      </div>
                    )}

                    {members.map((memberId) => (
                      <div key={memberId} style={{ marginTop: '8px' }}>
                        <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
                          {chat.type === 'group' ? `Member ${memberId}` : 'Notifications'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {NOTIFICATION_TYPES.map((type) => {
                            const sub = chat.memberSubscriptions[memberId] ?? [];
                            const enabled = sub.includes(type);
                            return (
                              <label
                                key={type}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  color: '#aaa',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => handleMemberType(chat, memberId, type)}
                                />
                                {NOTIFICATION_TYPE_LABELS[type]}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {alertConditions.length > 0 && config && config.chats.length > 0 && (
            <div>
              <div style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>
                Per-Alert Telegram Toggles
              </div>
              {alertConditions.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: '#0d0d18',
                    borderRadius: '4px',
                    border: '1px solid #111128',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#e0e0e0' }}>
                    {alert.title}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                    {alert.message}
                  </div>
                  {config.chats.map((chat) => {
                    const enabled = alertPrefs[alert.id]?.[chat.chatId] ?? true;
                    return (
                      <label
                        key={chat.chatId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '2px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#aaa',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleAlert(chat.chatId, alert.id, enabled)}
                        />
                        Notify Chat {chat.chatId}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  ) : null;
}