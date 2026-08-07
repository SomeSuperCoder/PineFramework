/**
 * BUG-REPRO — notification-state truthiness (Bug Hunter wave).
 *
 * USER REPORT: "When a bot is first added to a group or a new user opens it,
 * all notifications are disabled by default, that can be seen on the control
 * panel in the frontend. But the user when first opening the notifications
 * menu sees all notifications on with green check marks next to them, but
 * they're actually off until the user clicks 'Enable all'; IT LIES!"
 *
 * Three sources of truth that must agree:
 *   1. STORE RAW — chat.memberSubscriptions[memberId]  (what the web panel reads)
 *   2. BOT MENU  — buildTypeKeyboard(getMemberSubscription(...))  (✅/⬜ glyphs)
 *   3. DELIVERY  — collectRecipientChats → isMemberSubscribed(...)
 *
 * Hypothesis under test:
 *   - PRIVATE fresh chat: raw map is EMPTY (panel shows all off) but
 *     getMemberSubscription defaults to ALL → bot menu shows every type ✅
 *     → menu and panel disagree (the LIE). Delivery uses the SAME effective
 *     default → a fresh private chat ACTUALLY receives every type before
 *     "Enable all" (contradicting the user's "nothing arrives" for private).
 *   - GROUP fresh chat: raw map empty AND getMemberSubscription defaults to []
 *     → bot menu shows every type ⬜ (no lie) and delivery sends NOTHING
 *     (matches the user's "nothing arrives", gated additionally by `linked`).
 *
 * Tests named `REPRO:` assert a truthfulness invariant and FAIL (RED) against
 * the current source where the bug lives. Tests named `truth:` assert current
 * deterministic behavior and PASS — they are the delivery-truth evidence.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TelegramConfigStore, NOTIFICATION_TYPES } from '../../src/store/TelegramConfigStore.js';
import {
  TelegramBotFeature,
  type CallbackContext,
} from '../../src/telegram/TelegramBotFeature.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `truthiness-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** Replica of the REAL transport parse (TelegramService.attachCallback). */
function transportParse(actionPrefix: string, data: string): { action: string; params: string } {
  const re = new RegExp(`^${actionPrefix}(?::(.+))?$`);
  const match = data.match(re);
  return { action: actionPrefix, params: match?.[1] ?? '' };
}

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  edit: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  filePath: string;
  cb: (data: string, overrides?: Partial<CallbackContext>) => CallbackContext;
  /** Button TEXTS (✅/⬜) of the last edit's inline keyboard, type-toggles only. */
  lastToggleTexts: () => string[];
}

function makeHarness(opts: { chatId?: number; type?: 'private' | 'group'; fromId?: number } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const chatId = opts.chatId ?? 1000;
  const type = opts.type ?? 'private';
  const fromId = opts.fromId ?? 1000;
  const edit = vi.fn().mockResolvedValue(undefined);
  const onMessage = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats: null,
    getEngine: () => null,
    onMessage,
  });

  const cb = (data: string, overrides: Partial<CallbackContext> = {}): CallbackContext => {
    const { params } = transportParse('notif', data);
    return {
      from: { id: fromId, username: 'tester', first_name: 'Tester' },
      chat: { id: chatId, type },
      message: { text: '' },
      reply: vi.fn().mockResolvedValue(true),
      callbackQueryId: 'cb-truthiness',
      data,
      action: 'notif',
      params,
      answerCallback: vi.fn().mockResolvedValue(undefined),
      editMessage: edit,
      ...overrides,
    };
  };

  const lastToggleTexts = (): string[] => {
    const last = edit.mock.calls[edit.mock.calls.length - 1]?.[1] as
      | { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } }
      | undefined;
    // Type toggles only — exclude the bulk rows ("✅ Enable all" / "❌ Disable all").
    return (last?.reply_markup?.inline_keyboard ?? [])
      .flat()
      .map((b) => b.text)
      .filter((t) => toggles.some((type) => t.endsWith(type)));
  };

  return { store, feature, edit, onMessage, filePath, cb, lastToggleTexts };
}

function cleanHarness(h: Harness): void {
  try { fs.unlinkSync(h.filePath); } catch { /* ignore */ }
}

const toggles = NOTIFICATION_TYPES.filter((t) => t !== 'all' && t !== 'none');

describe('REPRO — fresh PRIVATE chat: bot menu must agree with raw store state', () => {
  let h: Harness;
  afterEach(() => cleanHarness(h));

  it('REPRO: after notif:menu on a fresh private chat, every toggle must be ⬜ (raw is empty)', async () => {
    h = makeHarness({ type: 'private', chatId: 1000 });
    h.store.addChat(1000, 'private'); // /start already registered the chat
    // Web panel reads the RAW map: chat.memberSubscriptions[memberId] ?? [] → all OFF.
    const raw = h.store.getChat(1000)!.memberSubscriptions;
    expect(raw).toEqual({}); // panel truth: nothing stored → panel shows all disabled

    await h.feature.handleNotificationsCallback(h.cb('notif:menu'));

    // Truthfulness invariant: the menu must not show ON for types the raw store
    // has never persisted. Current source FAILS this: effective default-ALL.
    expect(h.lastToggleTexts()).toHaveLength(toggles.length);
    for (const text of h.lastToggleTexts()) {
      expect(text).toContain('⬜');
    }
  });
});

describe('truth — DELIVERY for a fresh PRIVATE chat (before Enable all)', () => {
  let h: Harness;
  afterEach(() => cleanHarness(h));

  it('truth: a fresh private chat DOES receive every type via deliver()', async () => {
    h = makeHarness({ type: 'private', chatId: 1000 });
    h.store.addChat(1000, 'private'); // /start already registered the chat
    const n = await h.feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(1);
    expect(h.onMessage).toHaveBeenCalledWith(1000, 'msg[en]');
    // ⚠️ This contradicts the user's "nothing arrives until Enable all" for the
    // private case: delivery uses the effective default (ALL), not the raw map.
  });
});

describe('truth — DELIVERY for a fresh GROUP chat (before Enable all)', () => {
  let h: Harness;
  afterEach(() => cleanHarness(h));

  it('truth: fresh unlinked group delivers NOTHING', async () => {
    h = makeHarness({ type: 'group', chatId: -1001, fromId: 500 });
    h.store.addChat(-1001, 'group');
    const n = await h.feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(0);
    expect(h.onMessage).not.toHaveBeenCalled();
  });

  it('truth: fresh group AFTER linking still delivers NOTHING (no member subscribed)', async () => {
    h = makeHarness({ type: 'group', chatId: -1001, fromId: 500 });
    h.store.addChat(-1001, 'group');
    h.store.linkChat(-1001, 1);
    const n = await h.feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(0);
    expect(h.onMessage).not.toHaveBeenCalled();
  });

  it('truth: group menu shows ⬜ (no lie) before any subscription', async () => {
    h = makeHarness({ type: 'group', chatId: -1001, fromId: 500 });
    await h.feature.handleNotificationsCallback(h.cb('notif:menu'));
    for (const text of h.lastToggleTexts()) {
      expect(text).toContain('⬜');
    }
  });
});

describe('truth — Enable all persists state and aligns menu with raw (the fix target)', () => {
  let h: Harness;
  afterEach(() => cleanHarness(h));

  it('truth: notif:all on a fresh private chat writes the raw key; menu ✅; delivery still ON', async () => {
    h = makeHarness({ type: 'private', chatId: 1000 });
    await h.feature.handleNotificationsCallback(h.cb('notif:all'));
    const raw = h.store.getChat(1000)!.memberSubscriptions[String(1000)];
    expect(raw).toEqual([...NOTIFICATION_TYPES]); // raw persisted → panel now shows all ON
    for (const text of h.lastToggleTexts()) {
      expect(text).toContain('✅');
    }
    const n = await h.feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(1);
  });

  it('truth: notif:all on a fresh GROUP still delivers NOTHING until the group is linked', async () => {
    h = makeHarness({ type: 'group', chatId: -1001, fromId: 500 });
    await h.feature.handleNotificationsCallback(h.cb('notif:all'));
    expect(h.store.getChat(-1001)!.memberSubscriptions[String(500)]).toEqual([...NOTIFICATION_TYPES]);
    const n = await h.feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(0); // linked gate still blocks
  });
});
