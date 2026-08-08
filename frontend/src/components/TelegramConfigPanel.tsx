import { useState, useEffect, useCallback } from 'react';
import type {
  TelegramConfig,
  AlertConditionData,
  ProxyConfig,
  NotificationType,
  ChatLanguage,
} from '../types';
import { NOTIFICATION_TYPES } from '../types';
import { tokens } from '../theme/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TelegramConfigPanelProps {
  alertConditions: AlertConditionData[];
  onClose?: () => void;
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

async function linkChat(chatId: number): Promise<void> {
  await fetch(`/api/settings/telegram/chats/${chatId}/link`, { method: 'POST' });
}

async function unlinkChat(chatId: number): Promise<void> {
  await fetch(`/api/settings/telegram/chats/${chatId}/unlink`, { method: 'POST' });
}

export function TelegramConfigPanel({ alertConditions, onClose }: TelegramConfigPanelProps) {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle');
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
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config && alertConditions.length > 0 && config.chats.length > 0) {
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
  }, [config, alertConditions]);

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
    setTestStatus('idle');
    try {
      await sendTestMessage();
      setTestStatus('ok');
    } catch {
      setTestStatus('error');
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

  const formControlStyle = { color: tokens.colors.ink['2'], fontWeight: 600, margin: '0 0 8px', fontSize: 13 };

  return (
    <div
      className="telegram-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'auto',
        background: tokens.colors.surface['1'],
        border: `1px solid ${tokens.colors.hairline.default}`,
        borderRadius: '8px',
        padding: '20px',
        color: tokens.colors.ink['1'],
        fontSize: '13px',
      }}
    >
      <div className="flex items-center gap-2.5 mt-0 mb-4">
        {onClose && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label="Back to dashboard"
          >
            ← Back
          </Button>
        )}
        <h3 className="m-0 text-[16px] font-semibold">Telegram Configuration</h3>
      </div>

      {loading && <div style={{ color: tokens.colors.steel.muted }}>Loading...</div>}

      {!loading && (
        <>
          <div className="mb-4">
            <Label className="block mb-1 text-[13px] font-medium" style={{ color: tokens.colors.ink['2'] }}>Bot Token</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Enter your bot token"
                className="flex-1 h-9"
              />
              <Button type="button" onClick={handleSave} disabled={saving} aria-busy={saving} className="h-9 whitespace-nowrap">
                {saving ? '...' : 'Save'}
              </Button>
            </div>
            {saveStatus === 'saved' && (
              <div className="mt-1 text-[11px]" style={{ color: tokens.colors.semantic.success }}>Token saved</div>
            )}
            {saveStatus === 'error' && (
              <div className="mt-1 text-[11px]" style={{ color: tokens.colors.semantic.error }}>Failed to save</div>
            )}
          </div>

          <div className="mb-4">
            <Label className="block mb-1 text-[13px] font-medium" style={{ color: tokens.colors.ink['2'] }}>Test</Label>
            <Button type="button" onClick={handleTest} disabled={testSending || !botToken} aria-busy={testSending} className="h-9">
              {testSending ? 'Sending...' : 'Send Test Message'}
            </Button>
            {testStatus === 'ok' && (
              <div role="status" className="mt-1 text-[11px]" style={{ color: tokens.colors.semantic.success }}>
                Connected — test message sent.
              </div>
            )}
            {testStatus === 'error' && (
              <div role="status" className="mt-1 text-[11px]" style={{ color: tokens.colors.semantic.error }}>
                Failed — click Send Test Message to retry.
              </div>
            )}
          </div>

          <div className="mb-4 border-t pt-3" style={{ borderColor: tokens.colors.hairline.default }}>
            <Label className="block mb-2" style={{ color: tokens.colors.ink['2'] }}>
              HTTP Proxy (optional)
            </Label>
            <div className="flex gap-2 mb-1.5">
              <Input
                type="text"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                placeholder="Host (e.g., 127.0.0.1)"
                className="flex-1 h-9 text-[12px]"
              />
              <Input
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                placeholder="Port"
                min={1}
                max={65535}
                className="w-[80px] h-9 text-[12px]"
              />
            </div>
            <div className="flex gap-2 mb-1.5">
              <Input
                type="text"
                value={proxyUsername}
                onChange={(e) => setProxyUsername(e.target.value)}
                placeholder="Username (optional)"
                className="flex-1 h-11 text-[12px]"
              />
              <div className="relative flex-1">
                <Input
                  type={showProxyPassword ? 'text' : 'password'}
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  placeholder="Password (optional)"
                  className="w-full h-11 pr-11 text-[12px] box-border"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowProxyPassword(!showProxyPassword)}
                  aria-label={showProxyPassword ? 'Hide proxy password' : 'Show proxy password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 p-0 text-[12px]"
                  style={{ color: tokens.colors.steel.muted }}
                >
                  {showProxyPassword ? '🙈' : '👁'}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button type="button" variant="secondary" onClick={handleProxySave} disabled={proxySaving} aria-busy={proxySaving} className="h-9 whitespace-nowrap text-[12px]">
                {proxySaving ? '...' : 'Save Proxy'}
              </Button>
              {proxySaveStatus === 'saved' && (
                <span className="text-[11px]" style={{ color: tokens.colors.semantic.success }}>Proxy saved</span>
              )}
              {proxySaveStatus === 'error' && (
                <span className="text-[11px]" style={{ color: tokens.colors.semantic.error }}>Failed to save</span>
              )}
            </div>
          </div>

          {config && (
            <div className="mb-4">
              <div style={formControlStyle}>Admin</div>
              {config.admin ? (
                <div
                  className="rounded-md px-2 py-1.5 text-[12px]"
                  style={{ background: tokens.colors.canvas, color: tokens.colors.ink['1'] }}
                >
                  {'@'}
                  {config.admin.username || config.admin.userId}
                  <span style={{ color: tokens.colors.ink['2'] }}> (ID: {config.admin.userId})</span>
                </div>
              ) : (
                <div className="text-[12px]" style={{ color: tokens.colors.steel.muted }}>Not configured</div>
              )}
              <div className="flex gap-2 mt-1.5">
                <Input
                  type="number"
                  value={adminUserId}
                  onChange={(e) => setAdminUserId(e.target.value)}
                  placeholder="User ID"
                  aria-label="Admin Telegram user ID"
                  className="flex-1 h-9 text-[12px]"
                />
                <Input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="@username (optional)"
                  aria-label="Admin username (optional)"
                  className="flex-[1.5] h-9 text-[12px]"
                />
                <Button type="button" onClick={handleSetAdmin} disabled={busy['admin'] || !adminUserId.trim()} aria-busy={!!busy['admin']} className="h-9 whitespace-nowrap text-[12px]">
                  {busy['admin'] ? '...' : 'Set as Admin'}
                </Button>
              </div>
            </div>
          )}

          {config && (
            <div className="mb-4">
              <div style={formControlStyle}>Controller Requests ({config.requests.length})</div>
              {config.requests.length === 0 && (
                <div className="text-[12px]" style={{ color: tokens.colors.steel.muted }}>
                  No controller requests pending.
                </div>
              )}
              {config.requests.map((req) => (
                <div
                  key={req.userId}
                  className="rounded-md p-2 mb-1.5 border"
                  style={{ background: tokens.colors.canvas, borderColor: tokens.colors.hairline.default }}
                >
                  <div className="font-semibold" style={{ color: tokens.colors.ink['1'] }}>
                    @{req.username || req.userId}
                    {req.firstName && <span style={{ color: tokens.colors.steel.muted, fontWeight: 'normal' }}> · {req.firstName}</span>}
                  </div>
                  <div className="text-[11px] mb-1.5" style={{ color: tokens.colors.steel.muted }}>
                    ID: {req.userId}
                    {req.requestedAt ? ` · requested ${new Date(req.requestedAt).toLocaleString()}` : ''}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => handleApprove(req.userId)} disabled={busy[`approve:${req.userId}`]} aria-busy={!!busy[`approve:${req.userId}`]} className="h-10 px-2.5 text-[12px]">
                      {busy[`approve:${req.userId}`] ? '...' : 'Approve'}
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => handleDeny(req.userId)} disabled={busy[`deny:${req.userId}`]} aria-busy={!!busy[`deny:${req.userId}`]} className="h-10 px-2.5 text-[12px]">
                      {busy[`deny:${req.userId}`] ? '...' : 'Deny'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {config && (
            <div className="mb-4">
              <div style={formControlStyle}>Controllers ({config.controllers.length})</div>
              {config.controllers.length === 0 && (
                <div className="text-[12px]" style={{ color: tokens.colors.steel.muted }}>
                  No controllers yet.
                </div>
              )}
              {config.controllers.map((ctrl) => (
                <div
                  key={ctrl.userId}
                  className="flex justify-between items-center rounded-md px-2 py-1.5 mt-1 text-[12px]"
                  style={{ background: tokens.colors.canvas }}
                >
                  <span>
                    @{ctrl.username || ctrl.userId}
                    <span style={{ color: tokens.colors.ink['2'] }}> (ID: {ctrl.userId})</span>
                  </span>
                  <Button type="button" variant="destructive" onClick={() => handleRemoveController(ctrl.userId)} disabled={busy[`remove:${ctrl.userId}`]} aria-busy={!!busy[`remove:${ctrl.userId}`]} className="h-10 px-2 text-[11px]">
                    {busy[`remove:${ctrl.userId}`] ? '...' : 'Remove'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {config && (
            <div className="mb-4">
              <div style={formControlStyle}>Chats ({config.chats.length})</div>
              {config.chats.length === 0 && (
                <div className="text-[12px]" style={{ color: tokens.colors.steel.muted }}>
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
                    className="rounded-md p-2 mb-1.5 border"
                    style={{ background: tokens.colors.canvas, borderColor: tokens.colors.hairline.default }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span
                          className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            background: chat.type === 'group' ? '#5c6bc0' : '#26a69a',
                            color: tokens.colors.ink.default,
                          }}
                        >
                          {chat.type === 'group' ? 'Group' : 'Private'}
                        </span>
                        <span className="font-semibold ml-1.5" style={{ color: tokens.colors.ink['1'] }}>
                          {chat.title || `Chat ${chat.chatId}`}
                        </span>
                      </div>
                      {chat.type === 'group' && (
                        <Button
                          type="button"
                          variant={chat.linked ? 'destructive' : 'default'}
                          onClick={() => (chat.linked ? handleUnlink(chat.chatId) : handleLink(chat.chatId))}
                          disabled={busy[`${chat.linked ? 'unlink' : 'link'}:${chat.chatId}`]}
                          aria-busy={!!busy[`${chat.linked ? 'unlink' : 'link'}:${chat.chatId}`]}
                          className="h-10 px-2 text-[11px] whitespace-nowrap"
                        >
                          {busy[`${chat.linked ? 'unlink' : 'link'}:${chat.chatId}`] ? '...' : chat.linked ? 'Unlink' : 'Link'}
                        </Button>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]"
                      style={{ color: tokens.colors.steel.muted }}
                    >
                      <span>Chat ID: {chat.chatId}</span>
                      <span>· {chat.type === 'group' ? chat.linked ? 'Linked' : 'Not linked' : 'Always linked'}</span>
                      <span>· Language:</span>
                      <Select
                        value={chat.language}
                        onValueChange={(v) => handleChatLanguage(chat.chatId, v as ChatLanguage)}
                        disabled={busy[`lang:${chat.chatId}`]}
                      >
                        <SelectTrigger className="h-8 text-[11px]" aria-label={`Language for chat ${chat.chatId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_LANGUAGES.map((lang) => (
                            <SelectItem key={lang} value={lang}>
                              {CHAT_LANGUAGE_LABELS[lang]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {chat.type === 'group' && members.length === 0 && (
                      <div className="text-[11px] mt-1.5" style={{ color: tokens.colors.steel.muted }}>
                        No members yet.
                      </div>
                    )}

                    {members.map((memberId) => (
                      <div key={memberId} className="mt-2">
                        <div className="text-[11px] mb-1" style={{ color: tokens.colors.ink['2'] }}>
                          {chat.type === 'group' ? `Member ${memberId}` : 'Notifications'}
                        </div>
                        <div className="text-[11px] mb-1" style={{ color: tokens.colors.steel.muted }}>
                          Manage via the bot: /subscribe /unsubscribe
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {NOTIFICATION_TYPES.map((type) => {
                            const sub = chat.memberSubscriptions[memberId] ?? [];
                            const enabled = sub.includes(type);
                            return (
                              <label
                                key={type}
                                className="flex items-center gap-1 text-[11px] cursor-default"
                                style={{ color: tokens.colors.ink['3'] }}
                              >
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  disabled
                                  className="cursor-not-allowed opacity-70"
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
              <div style={formControlStyle}>Per-Alert Telegram Toggles</div>
              {alertConditions.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-md p-2 mb-1.5 border"
                  style={{ background: tokens.colors.canvas, borderColor: tokens.colors.hairline.default }}
                >
                  <div className="font-semibold mb-1" style={{ color: tokens.colors.ink['1'] }}>
                    {alert.title}
                  </div>
                  <div className="text-[11px] mb-1" style={{ color: tokens.colors.steel.muted }}>
                    {alert.message}
                  </div>
                  {config.chats.map((chat) => {
                    const enabled = alertPrefs[alert.id]?.[chat.chatId] ?? true;
                    return (
                      <div
                        key={chat.chatId}
                        className="flex items-center gap-1.5 mt-0.5 text-[12px] cursor-pointer"
                        style={{ color: tokens.colors.ink['2'] }}
                      >
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => toggleAlert(chat.chatId, alert.id, enabled)}
                          className="scale-90"
                        />
                        Notify Chat {chat.chatId}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}