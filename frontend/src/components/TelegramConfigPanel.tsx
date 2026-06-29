import { useState, useEffect, useCallback } from 'react';
import type { TelegramConfig, AlertConditionData } from '../types';

interface TelegramConfigPanelProps {
  alertConditions: AlertConditionData[];
}

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

export function TelegramConfigPanel({ alertConditions }: TelegramConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [alertPrefs, setAlertPrefs] = useState<Record<string, Record<number, boolean>>>({});

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetchTelegramConfig();
      setConfig(cfg);
      setBotToken(cfg.botToken || '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadConfig();
  }, [isOpen, loadConfig]);

  useEffect(() => {
    if (isOpen && config && alertConditions.length > 0 && config.subscribers.length > 0) {
      const loadPrefs = async () => {
        const prefs: Record<string, Record<number, boolean>> = {};
        for (const alert of alertConditions) {
          prefs[alert.id] = {};
          for (const sub of config.subscribers) {
            try {
              const enabled = await fetchAlertPreference(sub.chatId, alert.id);
              prefs[alert.id][sub.chatId] = enabled;
            } catch {
              prefs[alert.id][sub.chatId] = true;
            }
          }
        }
        setAlertPrefs(prefs);
      };
      loadPrefs();
    }
  }, [isOpen, config, alertConditions]);

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

  return (
    <>
      <button
        className="telegram-button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '140px',
          right: '20px',
          zIndex: 100,
          padding: '10px 16px',
          background: '#0f3460',
          color: '#e0e0e0',
          border: '1px solid #2196f3',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {isOpen ? '✕ Close Telegram' : '🔔 Telegram'}
      </button>

      {isOpen && (
        <div
          className="telegram-panel"
          style={{
            position: 'fixed',
            top: '60px',
            right: '20px',
            width: '420px',
            maxHeight: 'calc(100vh - 180px)',
            overflowY: 'auto',
            background: '#16213e',
            border: '1px solid #0f3460',
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
                      background: '#1a1a2e',
                      color: '#e0e0e0',
                      border: '1px solid #0f3460',
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

              {config && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
                    Subscribers ({config.subscribers.length})
                  </label>
                  {config.subscribers.length === 0 && (
                    <div style={{ color: '#888', fontSize: '12px' }}>
                      No subscribers yet. Start the bot and send /subscribe to get started.
                    </div>
                  )}
                  {config.subscribers.map((sub) => (
                    <div
                      key={sub.chatId}
                      style={{
                        padding: '6px 8px',
                        marginTop: '4px',
                        background: '#1a1a2e',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      Chat ID: {sub.chatId}
                    </div>
                  ))}
                </div>
              )}

              {alertConditions.length > 0 && config && config.subscribers.length > 0 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>
                    Per-Alert Telegram Toggles
                  </label>
                  {alertConditions.map((alert) => (
                    <div
                      key={alert.id}
                      style={{
                        padding: '8px',
                        marginBottom: '6px',
                        background: '#1a1a2e',
                        borderRadius: '4px',
                        border: '1px solid #0f3460',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#e0e0e0' }}>
                        {alert.title}
                      </div>
                      <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
                        {alert.message}
                      </div>
                      {config.subscribers.map((sub) => {
                        const enabled = alertPrefs[alert.id]?.[sub.chatId] ?? true;
                        return (
                          <label
                            key={sub.chatId}
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
                              onChange={() => toggleAlert(sub.chatId, alert.id, enabled)}
                            />
                            Notify Chat {sub.chatId}
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
      )}
    </>
  );
}
