import fs from 'node:fs';
import path from 'node:path';
import { JsonStore } from './JsonStore.js';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** Telegram chat scope: a private 1:1 or a group. */
export type ChatType = 'private' | 'group';

/** Locale the bot should use when talking to a chat. */
export type ChatLanguage = 'en' | 'es' | 'ru';

/**
 * The closed set of notification categories a member can subscribe to.
 * Kept in this file so i18n / feature / routes modules reuse the same set.
 */
export const NOTIFICATION_TYPES = [
  'trading',
  'position_open',
  'position_close',
  'report',
  'daily',
  'error',
  'bot_lifecycle',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface TelegramSettings {
  proxy?: ProxyConfig;
  [key: string]: unknown;
}

export interface TelegramAdmin {
  userId: number;
  username: string;
  configuredAt: number;
}

export interface TelegramController {
  userId: number;
  username: string;
  grantedAt: number;
  grantedBy: number;
}

export interface TelegramControlRequest {
  userId: number;
  username: string;
  firstName: string;
  requestedAt: number;
}

export interface TelegramChat {
  chatId: number;
  type: ChatType;
  title?: string;
  linked: boolean;
  linkedAt?: number;
  linkedBy?: number;
  language: ChatLanguage;
  /** memberId (string) -> notification types that member opted into. */
  memberSubscriptions: Record<string, NotificationType[]>;
  /** Legacy per-alert prefs (memberId -> {id,title,enabled}), from the old schema. */
  memberAlertPrefs?: Record<string, Array<{ id: string; title: string; enabled: boolean }>>;
}

export interface TelegramData {
  botToken: string;
  admin?: TelegramAdmin;
  controllers: TelegramController[];
  requests: TelegramControlRequest[];
  chats: TelegramChat[];
  settings: TelegramSettings;
  [key: string]: unknown;
}

/** Legacy subscriber shape (pre-chat model). Only consumed by the migration. */
interface TelegramSubscriber {
  chatId: number;
  username: string;
  subscribedAt: number;
  alerts: Array<{ id: string; title: string; enabled: boolean }>;
}

const DEFAULT_TELEGRAM_DATA: TelegramData = {
  botToken: '',
  controllers: [],
  requests: [],
  chats: [],
  settings: {},
};

const CHAT_LANGUAGES: readonly ChatLanguage[] = ['en', 'es', 'ru'];
const VALID_NOTIFICATION_TYPES: readonly string[] = NOTIFICATION_TYPES;

/** Returns true iff `memberSubscriptions` maps every key to an array of valid types. */
function isValidSubscriptions(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  for (const key of Object.keys(map)) {
    const types = map[key];
    if (!Array.isArray(types)) return false;
    for (const t of types) {
      if (typeof t !== 'string' || !VALID_NOTIFICATION_TYPES.includes(t)) return false;
    }
  }
  return true;
}

function validateTelegramData(data: unknown): data is TelegramData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.botToken !== 'string') return false;
  if (!Array.isArray(obj.controllers)) return false;
  if (!Array.isArray(obj.requests)) return false;
  if (!Array.isArray(obj.chats)) return false;
  if (typeof obj.settings !== 'object' || obj.settings === null) return false;

  // `admin` is optional; when present it must be well-shaped.
  if (obj.admin !== undefined) {
    if (!obj.admin || typeof obj.admin !== 'object') return false;
    const a = obj.admin as Record<string, unknown>;
    if (typeof a.userId !== 'number' || typeof a.username !== 'string' || typeof a.configuredAt !== 'number') {
      return false;
    }
  }

  for (const controller of obj.controllers) {
    if (!controller || typeof controller !== 'object') return false;
    const c = controller as Record<string, unknown>;
    if (
      typeof c.userId !== 'number' ||
      typeof c.username !== 'string' ||
      typeof c.grantedAt !== 'number' ||
      typeof c.grantedBy !== 'number'
    ) {
      return false;
    }
  }

  for (const request of obj.requests) {
    if (!request || typeof request !== 'object') return false;
    const r = request as Record<string, unknown>;
    if (
      typeof r.userId !== 'number' ||
      typeof r.username !== 'string' ||
      typeof r.firstName !== 'string' ||
      typeof r.requestedAt !== 'number'
    ) {
      return false;
    }
  }

  for (const chat of obj.chats) {
    if (!chat || typeof chat !== 'object') return false;
    const ch = chat as Record<string, unknown>;
    if (typeof ch.chatId !== 'number') return false;
    if (ch.type !== 'private' && ch.type !== 'group') return false;
    if (typeof ch.linked !== 'boolean') return false;
    if (typeof ch.language !== 'string' || !CHAT_LANGUAGES.includes(ch.language as ChatLanguage)) return false;
    if (!isValidSubscriptions(ch.memberSubscriptions)) return false;
  }
  return true;
}

export class TelegramConfigStore {
  private store: JsonStore<TelegramData>;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.store = new JsonStore<TelegramData>(filePath, {
      defaultData: DEFAULT_TELEGRAM_DATA,
      validate: validateTelegramData,
    });
    // A legacy (subscriber-model) file fails the new validation, so `store.read()`
    // would fall back to defaults and the migration would never see the old data.
    // Read the raw file directly (same layer as JsonStore) and rewrite it once.
    this.migrateLegacyFile();
  }

  // ---- Token ---------------------------------------------------------------

  getBotToken(): string {
    return this.store.read().botToken;
  }

  setBotToken(token: string): void {
    this.store.patch({ botToken: token });
  }

  // ---- Admin ---------------------------------------------------------------

  getAdmin(): TelegramAdmin | undefined {
    return this.store.read().admin;
  }

  setAdmin(userId: number, username: string): void {
    const data = this.store.read();
    data.admin = { userId, username, configuredAt: Date.now() };
    this.store.write(data);
  }

  // ---- Controllers ---------------------------------------------------------

  getControllers(): TelegramController[] {
    return this.store.read().controllers;
  }

  /** Adds a controller; boolean=false if the user is already one (idempotent). */
  addController(userId: number, username: string, grantedBy: number): boolean {
    const data = this.store.read();
    if (data.controllers.some((c) => c.userId === userId)) return false;
    data.controllers.push({ userId, username, grantedAt: Date.now(), grantedBy });
    this.store.write(data);
    return true;
  }

  removeController(userId: number): boolean {
    const data = this.store.read();
    const idx = data.controllers.findIndex((c) => c.userId === userId);
    if (idx === -1) return false;
    data.controllers.splice(idx, 1);
    this.store.write(data);
    return true;
  }

  isController(userId: number): boolean {
    return this.store.read().controllers.some((c) => c.userId === userId);
  }

  // ---- Control requests ----------------------------------------------------

  getRequests(): TelegramControlRequest[] {
    return this.store.read().requests;
  }

  /**
   * Adds a control request. Returns false (no-op) when the user has already
   * requested access OR is already a controller.
   */
  addRequest(userId: number, username: string, firstName: string): boolean {
    const data = this.store.read();
    if (data.requests.some((r) => r.userId === userId)) return false;
    if (data.controllers.some((c) => c.userId === userId)) return false;
    data.requests.push({ userId, username, firstName, requestedAt: Date.now() });
    this.store.write(data);
    return true;
  }

  removeRequest(userId: number): boolean {
    const data = this.store.read();
    const idx = data.requests.findIndex((r) => r.userId === userId);
    if (idx === -1) return false;
    data.requests.splice(idx, 1);
    this.store.write(data);
    return true;
  }

  // ---- Chats ---------------------------------------------------------------

  getChats(): TelegramChat[] {
    return this.store.read().chats;
  }

  getChat(chatId: number): TelegramChat | undefined {
    return this.store.read().chats.find((c) => c.chatId === chatId);
  }

  /** Creates (or returns an existing) chat. Private chats start linked, groups unlinked. */
  addChat(chatId: number, type: ChatType, title?: string): TelegramChat {
    const data = this.store.read();
    const existing = data.chats.find((c) => c.chatId === chatId);
    if (existing) return existing;
    const chat = this.buildChat(chatId, type, title);
    data.chats.push(chat);
    this.store.write(data);
    return chat;
  }

  /** Applies `updater` to an existing chat; boolean is false when the chat doesn't exist. */
  updateChat(chatId: number, updater: (chat: TelegramChat) => TelegramChat): boolean {
    const data = this.store.read();
    const idx = data.chats.findIndex((c) => c.chatId === chatId);
    if (idx === -1) return false;
    data.chats[idx] = updater(data.chats[idx]);
    this.store.write(data);
    return true;
  }

  private buildChat(chatId: number, type: ChatType, title?: string): TelegramChat {
    return {
      chatId,
      type,
      title,
      linked: type === 'private',
      language: 'en',
      memberSubscriptions: {},
    };
  }

  // ---- Membership / subscriptions ------------------------------------------

  /**
   * Subscribes a member to extra notification types (union with existing).
   * Creates the chat as 'private' if it doesn't exist yet.
   *
   * The union is computed against the EFFECTIVE subscription
   * (getMemberSubscription), not the raw map: a member who has never set
   * anything in a private chat is effectively subscribed to ALL, so a first
   * subscribe must not silently drop the other default-on types. Once written,
   * this entry becomes the member's explicit, authoritative state.
   */
  memberSubscribe(chatId: number, memberId: number, types: NotificationType[]): void {
    const data = this.store.read();
    let chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat) {
      chat = this.buildChat(chatId, 'private');
      data.chats.push(chat);
    }
    const key = String(memberId);
    // For a chat created just above, getMemberSubscription re-reads the store
    // (which doesn't contain the new chat yet) and returns [] — so a brand-new
    // chat is seeded with exactly `types`, matching the pre-existing behavior.
    const current = this.getMemberSubscription(chatId, memberId);
    chat.memberSubscriptions[key] = [...new Set([...current, ...types])];
    this.store.write(data);
  }

  /**
   * Removes notification types from a member's subscription.
   *
   * Diffs against the EFFECTIVE subscription (getMemberSubscription) so the
   * first toggle-off in a fresh private chat (raw key unset) actually works.
   * The result is ALWAYS persisted — including an explicit empty array: an
   * empty array is truthy, so getMemberSubscription returns it instead of
   * falling back to the private-chat default-ALL. Deleting the key here would
   * resurrect ALL and keep delivering notifications to an unsubscribed member.
   */
  memberUnsubscribe(chatId: number, memberId: number, types: NotificationType[]): void {
    const data = this.store.read();
    const chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat) return;
    const key = String(memberId);
    const remaining = this.getMemberSubscription(chatId, memberId).filter((t) => !types.includes(t));
    chat.memberSubscriptions[key] = remaining;
    this.store.write(data);
  }

  /**
   * A member's current subscriptions. When never explicitly set, private chats
   * default to ALL types on; groups default to nothing. An explicitly stored
   * empty array is authoritative and returns [] — it is NOT treated as unset.
   */
  getMemberSubscription(chatId: number, memberId: number): NotificationType[] {
    const chat = this.store.read().chats.find((c) => c.chatId === chatId);
    if (!chat) return [];
    const member = chat.memberSubscriptions[String(memberId)];
    if (member) return member;
    return chat.type === 'private' ? [...NOTIFICATION_TYPES] : [];
  }

  isMemberSubscribed(chatId: number, memberId: number, type: NotificationType): boolean {
    return this.getMemberSubscription(chatId, memberId).includes(type);
  }

  // ---- Language ------------------------------------------------------------

  getChatLanguage(chatId: number): ChatLanguage {
    return this.store.read().chats.find((c) => c.chatId === chatId)?.language ?? 'en';
  }

  setChatLanguage(chatId: number, lang: ChatLanguage): void {
    const data = this.store.read();
    const chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat) return;
    chat.language = lang;
    this.store.write(data);
  }

  // ---- Linking -------------------------------------------------------------

  /** Links a chat. Only group chats can be linked (private chats are always considered linked). */
  linkChat(chatId: number, byUserId: number): boolean {
    const data = this.store.read();
    const chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat || chat.type !== 'group') return false;
    chat.linked = true;
    chat.linkedAt = Date.now();
    chat.linkedBy = byUserId;
    this.store.write(data);
    return true;
  }

  unlinkChat(chatId: number): boolean {
    const data = this.store.read();
    const chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat) return false;
    chat.linked = false;
    delete chat.linkedAt;
    delete chat.linkedBy;
    this.store.write(data);
    return true;
  }

  /** Private chats are always treated as linked. */
  isLinked(chatId: number): boolean {
    const chat = this.store.read().chats.find((c) => c.chatId === chatId);
    if (!chat) return false;
    return chat.type === 'private' ? true : chat.linked;
  }

  // ---- Legacy alert preferences --------------------------------------------

  /**
   * Per-alert preference for a private chat's own member prefs. Defaults to
   * true when the chat or the alert is unknown.
   */
  getAlertPreference(chatId: number, alertId: string): boolean {
    const chat = this.store.read().chats.find((c) => c.chatId === chatId);
    if (!chat) return true;
    const prefs = chat.memberAlertPrefs?.[String(chatId)];
    if (!prefs) return true;
    const alert = prefs.find((a) => a.id === alertId);
    return alert ? alert.enabled : true;
  }

  /** Persists an alert preference for a private chat, creating the chat if missing. */
  setAlertPreference(chatId: number, alertId: string, enabled: boolean): void {
    const data = this.store.read();
    let chat = data.chats.find((c) => c.chatId === chatId);
    if (!chat) {
      chat = this.buildChat(chatId, 'private');
      data.chats.push(chat);
    }
    chat.memberAlertPrefs ??= {};
    const memberKey = String(chatId);
    const list = (chat.memberAlertPrefs[memberKey] ??= []);
    const existing = list.find((a) => a.id === alertId);
    if (existing) {
      existing.enabled = enabled;
    } else {
      list.push({ id: alertId, title: alertId, enabled });
    }
    this.store.write(data);
  }

  // ---- Proxy ---------------------------------------------------------------

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

  // ---- Migration (legacy subscriber model -> chats) -------------------------

  /**
   * Upgrades a pre-chat-model file in place, once. Idempotent: after the first
   * run the `subscribers` key is gone, so later runs are no-ops. Skips when the
   * subscriber list is empty or chats already exist (avoids duplicate pushes).
   */
  private migrateLegacyFile(): void {
    const raw = this.readRawJson();
    if (!raw) return;

    const subscribers = raw.subscribers;
    const chats = raw.chats;
    const hasLegacySubscribers = Array.isArray(subscribers) && subscribers.length > 0;
    const alreadyHasChats = Array.isArray(chats) && chats.length > 0;
    if (!hasLegacySubscribers || alreadyHasChats) return;

    const legacy = subscribers as unknown as TelegramSubscriber[];
    const migrated: TelegramData = {
      ...DEFAULT_TELEGRAM_DATA,
      botToken: typeof raw.botToken === 'string' ? raw.botToken : DEFAULT_TELEGRAM_DATA.botToken,
      settings: this.normalizeSettings(raw.settings),
      chats: legacy.map((s) => ({
        chatId: s.chatId,
        type: 'private',
        linked: true,
        language: 'en',
        memberSubscriptions: { [String(s.chatId)]: [...NOTIFICATION_TYPES] },
        memberAlertPrefs: { [String(s.chatId)]: Array.isArray(s.alerts) ? s.alerts : [] },
      })),
    };
    // write() re-validates and persists the new shape, dropping `subscribers`.
    this.store.write(migrated);
  }

  private readRawJson(): Record<string, unknown> | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null; // corrupt / unreadable file -> leave it to JsonStore's fallback
    }
  }

  private normalizeSettings(value: unknown): TelegramSettings {
    if (!value || typeof value !== 'object') return {};
    return { ...(value as Record<string, unknown>) } as TelegramSettings;
  }
}