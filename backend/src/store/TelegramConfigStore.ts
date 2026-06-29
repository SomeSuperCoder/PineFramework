import { JsonStore } from './JsonStore.js';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface TelegramSubscriber {
  chatId: number;
  username: string;
  subscribedAt: number;
  alerts: Array<{
    id: string;
    title: string;
    enabled: boolean;
  }>;
}

export interface TelegramSettings {
  proxy?: ProxyConfig;
  [key: string]: unknown;
}

export interface TelegramData {
  botToken: string;
  subscribers: TelegramSubscriber[];
  settings: TelegramSettings;
  [key: string]: unknown;
}

const DEFAULT_TELEGRAM_DATA: TelegramData = {
  botToken: '',
  subscribers: [],
  settings: {},
};

function validateTelegramData(data: unknown): data is TelegramData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.botToken !== 'string') return false;
  if (!Array.isArray(obj.subscribers)) return false;
  if (typeof obj.settings !== 'object' || obj.settings === null) return false;
  for (const sub of obj.subscribers) {
    if (!sub || typeof sub !== 'object') return false;
    const s = sub as Record<string, unknown>;
    if (typeof s.chatId !== 'number' || typeof s.username !== 'string' || typeof s.subscribedAt !== 'number') return false;
    if (!Array.isArray(s.alerts)) return false;
    for (const alert of s.alerts) {
      if (!alert || typeof alert !== 'object') return false;
      const a = alert as Record<string, unknown>;
      if (typeof a.id !== 'string' || typeof a.title !== 'string' || typeof a.enabled !== 'boolean') return false;
    }
  }
  return true;
}

export class TelegramConfigStore {
  private store: JsonStore<TelegramData>;

  constructor(filePath: string) {
    this.store = new JsonStore<TelegramData>(filePath, {
      defaultData: DEFAULT_TELEGRAM_DATA,
      validate: validateTelegramData,
    });
  }

  getBotToken(): string {
    return this.store.read().botToken;
  }

  setBotToken(token: string): void {
    this.store.patch({ botToken: token });
  }

  getSubscribers(): TelegramSubscriber[] {
    return this.store.read().subscribers;
  }

  addSubscriber(chatId: number, username: string): void {
    const data = this.store.read();
    const existing = data.subscribers.find((s) => s.chatId === chatId);
    if (existing) return;
    data.subscribers.push({
      chatId,
      username,
      subscribedAt: Date.now(),
      alerts: [],
    });
    this.store.write(data);
  }

  removeSubscriber(chatId: number): boolean {
    const data = this.store.read();
    const idx = data.subscribers.findIndex((s) => s.chatId === chatId);
    if (idx === -1) return false;
    data.subscribers.splice(idx, 1);
    this.store.write(data);
    return true;
  }

  getAlertPreference(chatId: number, alertId: string): boolean {
    const data = this.store.read();
    const sub = data.subscribers.find((s) => s.chatId === chatId);
    if (!sub) return true;
    const alert = sub.alerts.find((a) => a.id === alertId);
    return alert ? alert.enabled : true;
  }

  setAlertPreference(chatId: number, alertId: string, enabled: boolean): void {
    const data = this.store.read();
    const sub = data.subscribers.find((s) => s.chatId === chatId);
    if (!sub) return;
    const existing = sub.alerts.find((a) => a.id === alertId);
    if (existing) {
      existing.enabled = enabled;
    } else {
      sub.alerts.push({ id: alertId, title: alertId, enabled });
    }
    this.store.write(data);
  }

  getProxy(): ProxyConfig | undefined {
    return this.store.read().settings.proxy;
  }

  setProxy(proxy: ProxyConfig | undefined): void {
    const data = this.store.read();
    if (proxy) {
      if (typeof proxy.host !== 'string' || proxy.host.trim() === '') {
        throw new Error('proxy.host must be a non-empty string');
      }
      if (typeof proxy.port !== 'number' || proxy.port <= 0 || proxy.port > 65535) {
        throw new Error('proxy.port must be a number between 1 and 65535');
      }
      data.settings.proxy = {
        host: proxy.host.trim(),
        port: proxy.port,
        username: proxy.username || undefined,
        password: proxy.password || undefined,
      };
    } else {
      delete data.settings.proxy;
    }
    this.store.write(data);
  }

  getAll(): TelegramData {
    return this.store.read();
  }
}
