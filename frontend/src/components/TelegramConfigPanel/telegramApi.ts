import type {
  ChatLanguage,
  ProxyConfig,
  TelegramConfig,
} from '../../types';

/** Re-exported API payload shapes so cards never import ../../types directly. */
export type { ProxyConfig };

export interface AlertPref {
  enabled: boolean;
}

export interface ProxyInput {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let detail = '';
  try {
    const body: unknown = await res.json();
    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof (body as { message?: unknown }).message === 'string'
    ) {
      detail = (body as { message: string }).message;
    }
  } catch {
    // Non-JSON error body — fall back to the generic status message.
  }
  throw new Error(
    detail
      ? `Telegram API ${res.status}: ${detail}`
      : `Telegram API request failed (${res.status})`,
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  await ensureOk(res);
  return res.json() as Promise<T>;
}

async function sendJson(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  await ensureOk(res);
}

async function putJson(url: string, body: unknown): Promise<void> {
  await sendJson(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchTelegramConfig(): Promise<TelegramConfig> {
  return getJson<TelegramConfig>('/api/settings/telegram');
}

export async function saveBotToken(token: string): Promise<void> {
  await putJson('/api/settings/telegram', { botToken: token });
}

export async function sendTestMessage(): Promise<void> {
  await sendJson('/api/telegram/test', { method: 'POST' });
}

export async function fetchAlertPreference(chatId: number, alertId: string): Promise<boolean> {
  const data = await getJson<AlertPref>(
    `/api/settings/alerts/${alertId}/telegram?chatId=${chatId}`,
  );
  return data.enabled;
}

export async function setAlertPreference(
  chatId: number,
  alertId: string,
  enabled: boolean,
): Promise<void> {
  await putJson(`/api/settings/alerts/${alertId}/telegram?chatId=${chatId}`, { enabled });
}

export async function fetchProxyConfig(): Promise<ProxyConfig | null> {
  return getJson<ProxyConfig | null>('/api/settings/telegram/proxy');
}

export async function saveProxyConfig(proxy: ProxyInput | null): Promise<void> {
  await putJson('/api/settings/telegram/proxy', proxy);
}

export async function setAdmin(userId: number, username?: string): Promise<void> {
  await putJson('/api/settings/telegram/admin', username ? { userId, username } : { userId });
}

export async function approveControlRequest(userId: number): Promise<void> {
  await sendJson(`/api/settings/telegram/requests/${userId}/approve`, { method: 'POST' });
}

export async function denyControlRequest(userId: number): Promise<void> {
  await sendJson(`/api/settings/telegram/requests/${userId}/deny`, { method: 'POST' });
}

export async function removeController(userId: number): Promise<void> {
  await sendJson(`/api/settings/telegram/controllers/${userId}`, { method: 'DELETE' });
}

export async function updateChatLanguage(chatId: number, language: ChatLanguage): Promise<void> {
  await putJson(`/api/settings/telegram/chats/${chatId}/language`, { language });
}

export async function linkChat(chatId: number): Promise<void> {
  await sendJson(`/api/settings/telegram/chats/${chatId}/link`, { method: 'POST' });
}

export async function unlinkChat(chatId: number): Promise<void> {
  await sendJson(`/api/settings/telegram/chats/${chatId}/unlink`, { method: 'POST' });
}
