/**
 * Tests for the new TelegramConfigStore data model (OpenSpec change:
 * telegram-bot-enhancements).
 *
 * Covers the chat/member/subscription model, controller/request access
 * management, admin, per-chat language, linking, and the legacy
 * subscriber-model file migration.
 *
 * The store persists to a real tmpdir file (follows the JsonStore + proper-lock
 * patterns the real service uses), so every assertion runs against the true
 * on-disk round-trip.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TelegramConfigStore,
  NOTIFICATION_TYPES,
  type TelegramData,
} from '../src/store/TelegramConfigStore.js';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `telegram-config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('TelegramConfigStore data model', () => {
  let filePath: string;
  let store: TelegramConfigStore;

  beforeEach(() => {
    filePath = tmpFile();
    store = new TelegramConfigStore(filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('NOTIFICATION_TYPES is the closed, ordered category set', () => {
    expect(NOTIFICATION_TYPES).toEqual([
      'trading',
      'position_open',
      'position_close',
      'report',
      'daily',
      'error',
      'bot_lifecycle',
    ]);
  });

  describe('chats', () => {
    it('creates a private chat as linked and en, with empty subscriptions', () => {
      const chat = store.addChat(9001, 'private');
      expect(chat.chatId).toBe(9001);
      expect(chat.type).toBe('private');
      expect(chat.linked).toBe(true);
      expect(chat.language).toBe('en');
      expect(chat.memberSubscriptions).toEqual({});
      expect(store.isLinked(9001)).toBe(true);
    });

    it('creates a group chat as UNLINKED', () => {
      const chat = store.addChat(7000, 'group', 'My Group');
      expect(chat.type).toBe('group');
      expect(chat.linked).toBe(false);
      expect(chat.title).toBe('My Group');
      expect(store.isLinked(7000)).toBe(false);
    });

    it('addChat is idempotent for an existing chat', () => {
      store.addChat(9001, 'private');
      const again = store.addChat(9001, 'group');
      expect(again.chatId).toBe(9001);
      expect(again.type).toBe('private'); // original preserved
      expect(store.getChats()).toHaveLength(1);
    });

    it('links and unlinks group chats, and only groups', () => {
      store.addChat(7000, 'group');
      expect(store.linkChat(7000, 42)).toBe(true);
      expect(store.isLinked(7000)).toBe(true);
      const linked = store.getChat(7000)!;
      expect(linked.linkedAt).toBeGreaterThan(0);
      expect(linked.linkedBy).toBe(42);

      expect(store.unlinkChat(7000)).toBe(true);
      expect(store.isLinked(7000)).toBe(false);
      const unlinked = store.getChat(7000)!;
      expect(unlinked.linkedAt).toBeUndefined();
      expect(unlinked.linkedBy).toBeUndefined();
    });

    it('linkChat refuses on a private chat (always linked) and on unknown chats', () => {
      store.addChat(9001, 'private');
      expect(store.linkChat(9001, 1)).toBe(false);
      expect(store.linkChat(99999, 1)).toBe(false);
      expect(store.unlinkChat(99999)).toBe(false);
    });
  });

  describe('membership / subscriptions', () => {
    it('private chats default to ALL types; groups default to nothing', () => {
      store.addChat(9001, 'private');
      store.addChat(7000, 'group');
      expect(store.getMemberSubscription(9001, 9001)).toEqual([...NOTIFICATION_TYPES]);
      expect(store.getMemberSubscription(7000, 123)).toEqual([]);
      expect(store.getMemberSubscription(9001, 999)).toEqual([...NOTIFICATION_TYPES]);
    });

    it('memberSubscribe unions and dedupes types, creating a private chat if missing', () => {
      store.memberSubscribe(5555, 1200, ['trading']);
      const chat = store.getChat(5555)!;
      expect(chat.type).toBe('private');

      expect(store.getMemberSubscription(5555, 1200)).toEqual(['trading']);
      store.memberSubscribe(5555, 1200, ['trading', 'error']); // dup trading
      expect(store.getMemberSubscription(5555, 1200)).toEqual(['trading', 'error']);
    });

    it('memberUnsubscribe removes types, and deletes the key when nothing remains', () => {
      store.memberSubscribe(5555, 1200, ['trading', 'error']);
      store.memberUnsubscribe(5555, 1200, ['trading']);
      expect(store.getMemberSubscription(5555, 1200)).toEqual(['error']);
      store.memberUnsubscribe(5555, 1200, ['error']);
      // Key fully removed on a private chat ⇒ falls back to the ALL default.
      expect(store.getMemberSubscription(5555, 1200)).toEqual([...NOTIFICATION_TYPES]);
    });

    it('memberUnsubscribe is a no-op for unknown chats or unsubscribed members', () => {
      store.memberUnsubscribe(99999, 1, ['trading']); // unknown chat
      store.addChat(9001, 'private');
      store.memberUnsubscribe(9001, 500, ['trading']); // member not in the map
      expect(store.getChats()).toHaveLength(1); // only addChat(9001) created a chat
      expect(store.getMemberSubscription(9001, 500)).toEqual([...NOTIFICATION_TYPES]);
    });

    it('isMemberSubscribed reflects the effective default', () => {
      store.addChat(9001, 'private');
      store.addChat(7000, 'group');
      expect(store.isMemberSubscribed(9001, 9001, 'trading')).toBe(true);
      expect(store.isMemberSubscribed(7000, 10, 'trading')).toBe(false);
    });
  });

  describe('language', () => {
    it('defaults to en and reads/sets per chat', () => {
      expect(store.getChatLanguage(123)).toBe('en'); // unknown chat
      store.addChat(9001, 'private');
      expect(store.getChatLanguage(9001)).toBe('en');
      store.setChatLanguage(9001, 'es');
      expect(store.getChatLanguage(9001)).toBe('es');
      store.setChatLanguage(9001, 'ru');
      expect(store.getChatLanguage(9001)).toBe('ru');
    });

    it('setChatLanguage is a no-op on an unknown chat', () => {
      store.setChatLanguage(9876, 'es');
      expect(store.getChatLanguage(9876)).toBe('en');
    });
  });

  describe('controllers', () => {
    it('addController is idempotent per user', () => {
      expect(store.addController(1, 'alice', 9)).toBe(true);
      expect(store.addController(1, 'alice', 9)).toBe(false);
      expect(store.getControllers()).toHaveLength(1);
      expect(store.isController(1)).toBe(true);
      expect(store.isController(2)).toBe(false);
    });

    it('removeController removes and reports missing users', () => {
      store.addController(1, 'alice', 9);
      expect(store.removeController(1)).toBe(true);
      expect(store.removeController(1)).toBe(false);
      expect(store.isController(1)).toBe(false);
    });
  });

  describe('control requests', () => {
    it('addRequest dedupes against requests AND controllers', () => {
      store.addRequest(5, 'bob', 'Bob');
      expect(store.addRequest(5, 'bob', 'Bob')).toBe(false); // already pending
      store.addController(6, 'carol', 9);
      expect(store.addRequest(6, 'carol', 'C')).toBe(false); // already controller
      expect(store.getRequests()).toHaveLength(1);
    });

    it('removeRequest removes and returns false when absent', () => {
      store.addRequest(5, 'bob', 'Bob');
      expect(store.removeRequest(5)).toBe(true);
      expect(store.removeRequest(5)).toBe(false);
    });
  });

  describe('admin', () => {
    it('setAdmin and getAdmin round-trip', () => {
      expect(store.getAdmin()).toBeUndefined();
      store.setAdmin(999, 'admin_user');
      const admin = store.getAdmin();
      expect(admin?.userId).toBe(999);
      expect(admin?.username).toBe('admin_user');
      expect(admin?.configuredAt).toBeGreaterThan(0);
      store.setAdmin(111, 'new_admin');
      expect(store.getAdmin()?.userId).toBe(111);
    });
  });
});

describe('TelegramConfigStore legacy migration', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpFile();
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  const LEGACY_FILE = {
    botToken: 'legacy-token',
    subscribers: [
      { chatId: 111, username: 'alice', subscribedAt: 123, alerts: [{ id: 'a1', title: 'A1', enabled: false }] },
      { chatId: 222, username: 'bob', subscribedAt: 456, alerts: [] },
    ],
    settings: { proxy: { host: '10.0.0.1', port: 8080 } },
  };

  it('migrates old subscriber model into private chats', () => {
    fs.writeFileSync(filePath, JSON.stringify(LEGACY_FILE), 'utf-8');
    const store = new TelegramConfigStore(filePath);

    // botToken + settings preserved.
    expect(store.getBotToken()).toBe('legacy-token');
    expect(store.getProxy()?.host).toBe('10.0.0.1');

    // Old subscribers became private, linked chats with a subscription for
    // their own member and the legacy alert prefs carried over.
    const chats = store.getChats();
    expect(chats).toHaveLength(2);
    const c1 = store.getChat(111)!;
    expect(c1.type).toBe('private');
    expect(c1.linked).toBe(true);
    expect(c1.language).toBe('en');
    expect(store.getMemberSubscription(111, 111)).toEqual([...NOTIFICATION_TYPES]);
    expect(store.getAlertPreference(111, 'a1')).toBe(false);

    const c2 = store.getChat(222)!;
    expect(c2.type).toBe('private');
    expect(c2.linked).toBe(true);
    expect(store.getAlertPreference(222, 'a1')).toBe(true);
  });

  it('drops the subscribers key on the rewritten file', () => {
    fs.writeFileSync(filePath, JSON.stringify(LEGACY_FILE), 'utf-8');
    // eslint-disable-next-line no-new
    new TelegramConfigStore(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw).not.toHaveProperty('subscribers');
    expect(Array.isArray(raw.chats)).toBe(true);
    expect(raw.chats).toHaveLength(2);
  });

  it('is idempotent — a second read does not re-migrate', () => {
    fs.writeFileSync(filePath, JSON.stringify(LEGACY_FILE), 'utf-8');
    // First construct migrates and rewrites.
    // eslint-disable-next-line no-new
    new TelegramConfigStore(filePath);
    // Second construct sees a valid (already new-model) file and must not push
    // duplicate chats.
    const store2 = new TelegramConfigStore(filePath);
    expect(store2.getChats()).toHaveLength(2);
    // And a third-time raw read still holds exactly the migrated chats.
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TelegramDataLike;
    expect(raw.chats).toHaveLength(2);
  });

  it('skips migration when there are no legacy subscribers', () => {
    const data = { botToken: 't', subscribers: [], controllers: [], requests: [], chats: [], settings: {} };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    const store = new TelegramConfigStore(filePath);
    expect(store.getChats()).toEqual([]);
    expect(store.getBotToken()).toBe('t');
  });

  it('skips migration when chats already exist (no duplicate pushes)', () => {
    const data = {
      botToken: 't',
      subscribers: [{ chatId: 1, username: 'u', subscribedAt: 1, alerts: [] }],
      controllers: [],
      requests: [],
      chats: [
        { chatId: 1, type: 'private', linked: true, language: 'en', memberSubscriptions: {} },
      ],
      settings: {},
    };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    const store = new TelegramConfigStore(filePath);
    expect(store.getChats()).toHaveLength(1);
  });
});

type TelegramDataLike = {
  botToken: string;
  chats: unknown[];
  [key: string]: unknown;
};