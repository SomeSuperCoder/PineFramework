/**
 * Tests for TelegramBotFeature — the policy layer of the Telegram bot.
 *
 * Drives handlers with fabricated `FeatureCommandContext` objects (the
 * transport-agnostic design), asserting behavior through the i18n replies the
 * user sees, not implementation details. Uses a real TelegramConfigStore on a
 * tmpdir so the full store→feature round-trip is exercised.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import { TelegramBotFeature, type FeatureCommandContext } from '../src/telegram/TelegramBotFeature.js';
import type { StatsService } from '../src/services/StatsService.js';
import type { SessionSummary } from '../src/services/StatsService.js';

type Reply = ReturnType<typeof vi.fn>;

function tmpFile(): string {
  return path.join(os.tmpdir(), `feat-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

/** Builds a fabricated context whose reply is the SAME spy the harness asserts on. */
type CtxOverrides = Partial<FeatureCommandContext> & { reply?: Reply };

interface Harness {
  store: TelegramConfigStore;
  feature: TelegramBotFeature;
  reply: Reply;
  ctx: (overrides?: CtxOverrides) => FeatureCommandContext;
}

function makeHarness(opts: { stats?: Partial<StatsService> | null; engine?: unknown } = {}): Harness {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    stats:
      opts.stats !== undefined
        ? opts.stats
        : ({
            getSessionSummary: vi.fn(() => ({
              totalTrades: 0,
              winRate: 0,
              netPnl: 0,
              totalFees: 0,
              profitFactor: 0,
              bestTrade: 0,
              worstTrade: 0,
              maxDrawdown: 0,
              recent: [],
            })),
          } as Partial<StatsService> as StatsService),
    getEngine: () => (opts.engine !== undefined ? opts.engine : null) as never,
    onMessage: async () => true,
  });
  const ctx = (overrides: CtxOverrides = {}): FeatureCommandContext => ({
    from: overrides.from ?? { id: 1000, username: 'tester', first_name: 'Tester' },
    chat: overrides.chat ?? { id: 1000, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
  });
  (feature as unknown as { __tk: string }).__tk = filePath;
  return { store, feature, reply, ctx };
}

function cleanHarness(h: Harness): void {
  const tk = (h.feature as unknown as { __tk?: string }).__tk;
  if (tk) { try { fs.unlinkSync(tk); } catch { /* ignore */ } }
}

describe('TelegramBotFeature auth gate', () => {
  it('denies non-controller, non-admin with permDeniedControl', async () => {
    const h = makeHarness();
    await h.feature.handleStats(h.ctx({ from: { id: 500, username: 'nobody' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized operator'));
    cleanHarness(h);
  });

  it('allows the admin through the gate', async () => {
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ symbol: 'X' }] }, positions: [], emergencyStop: vi.fn(), stop: vi.fn() } });
    h.store.setAdmin(1, 'admin');
    await h.feature.handleStats(h.ctx({ from: { id: 1, username: 'admin' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Engine state'));
    cleanHarness(h);
  });

  it('allows an approved controller through the gate', async () => {
    const h = makeHarness({ engine: { state: 'Stopped', config: {}, positions: [], stop: vi.fn(), emergencyStop: vi.fn() } });
    h.store.addController(777, 'oper', 1);
    await h.feature.handleStats(h.ctx({ from: { id: 777, username: 'oper' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Engine state'));
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /request', () => {
  it('submits a request and persists it', async () => {
    const h = makeHarness();
    await h.feature.handleRequest(h.ctx({ from: { id: 50, username: 'newbie', first_name: 'New' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('submitted'));
    expect(h.store.getRequests()).toHaveLength(1);
    expect(h.store.getRequests()[0]!.username).toBe('newbie');
    cleanHarness(h);
  });

  it('rejects a duplicate pending request', async () => {
    const h = makeHarness();
    h.store.addRequest(50, 'newbie', 'New');
    await h.feature.handleRequest(h.ctx({ from: { id: 50, username: 'newbie' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('pending'));
    cleanHarness(h);
  });

  it('tells existing controllers/admin they are already granted', async () => {
    const h = makeHarness();
    h.store.addController(50, 'c', 1);
    await h.feature.handleRequest(h.ctx({ from: { id: 50, username: 'c' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('already granted access') as string);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /subscribe & /unsubscribe', () => {
  it('M1: already-all private chat reports failure, not fake success', async () => {
    // A fresh private chat defaults to ALL types, so subscribing to 'trading'
    // changes nothing — the reply must be subscribeFailure (M1), not a claim of
    // a subscription that was already present.
    const h = makeHarness();
    await h.feature.handleSubscribe(h.ctx({ message: { text: '/subscribe trading' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Could not subscribe'));
    cleanHarness(h);
  });

  it('M1: a chat that actually gains a type reports success', async () => {
    // A GROUP chat defaults to NO subscriptions (empty list), so subscribing a
    // group member to a type genuinely adds it → subscribeSuccess.
    const h = makeHarness();
    await h.feature.handleSubscribe(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      message: { text: '/subscribe error' },
    }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('subscribed'));
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    cleanHarness(h);
  });

  it('subscribes to ALL when no type given', async () => {
    const h = makeHarness();
    await h.feature.handleSubscribe(h.ctx({ message: { text: '/subscribe' } }));
    expect(h.store.getMemberSubscription(1000, 1000)).toEqual([
      'trading', 'position_open', 'position_close', 'report', 'daily', 'error', 'bot_lifecycle',
    ]);
    cleanHarness(h);
  });

  it('rejects an invalid type', async () => {
    const h = makeHarness();
    await h.feature.handleSubscribe(h.ctx({ message: { text: '/subscribe bogus' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringMatching(/Invalid args|Invalid arguments/));
    cleanHarness(h);
  });

  it('subscribes a group member by member id (not chat id)', async () => {
    const h = makeHarness();
    await h.feature.handleSubscribe(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'member' },
      message: { text: '/subscribe error' },
    }));
    const chat = h.store.getChat(7000)!;
    expect(chat.type).toBe('group');
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    cleanHarness(h);
  });

  it('unsubscribes a specific type and drops the key when empty', async () => {
    // Use a GROUP chat so the empty-key default is [] (not the private ALL default).
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading']);
    await h.feature.handleUnsubscribe(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'm' },
      message: { text: '/unsubscribe trading' },
    }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Unsubscribed'));
    // Group empty default ⇒ nothing.
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual([]);
    cleanHarness(h);
  });

  it('rejects invalid unsubscribe type', async () => {
    const h = makeHarness();
    await h.feature.handleUnsubscribe(h.ctx({ message: { text: '/unsubscribe nope' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringMatching(/Invalid args|Invalid arguments/));
    cleanHarness(h);
  });

  it('M1: unsubscribe reports failure when nothing was actually removed', async () => {
    // The member has no explicit subscriptions on a group → nothing to remove.
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    await h.feature.handleUnsubscribe(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'm' },
      message: { text: '/unsubscribe trading' },
    }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Could not unsubscribe'));
    cleanHarness(h);
  });

  it('M1: unsubscribe reports success when a type was removed', async () => {
    const h = makeHarness();
    h.store.addChat(7000, 'group');
    h.store.memberSubscribe(7000, 1200, ['trading', 'error']);
    await h.feature.handleUnsubscribe(h.ctx({
      chat: { id: 7000, type: 'group' },
      from: { id: 1200, username: 'm' },
      message: { text: '/unsubscribe trading' },
    }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Unsubscribed'));
    expect(h.store.getMemberSubscription(7000, 1200)).toEqual(['error']);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /lang', () => {
  it('reports usage when no language given', async () => {
    const h = makeHarness();
    await h.feature.handleLang(h.ctx());
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('/lang'));
    cleanHarness(h);
  });

  it('sets a valid language', async () => {
    const h = makeHarness();
    await h.feature.handleLang(h.ctx({ message: { text: '/lang es' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('es'));
    expect(h.store.getChatLanguage(1000)).toBe('es');
    cleanHarness(h);
  });

  it('rejects an invalid language', async () => {
    const h = makeHarness();
    await h.feature.handleLang(h.ctx({ message: { text: '/lang de' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
    expect(h.store.getChatLanguage(1000)).toBe('en');
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /report', () => {
  it('explains when no stats service is attached', async () => {
    const h = makeHarness({ stats: null });
    await h.feature.handleReport(h.ctx());
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    cleanHarness(h);
  });

  it('reports empty summary when there are no trades', async () => {
    const h = makeHarness({
      stats: ({ getSessionSummary: vi.fn(() => ({ totalTrades: 0, recent: [] })) } as Partial<StatsService> as StatsService),
    });
    await h.feature.handleReport(h.ctx());
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('No trades'));
    cleanHarness(h);
  });

  it('renders a report with trade rows', async () => {
    const h = makeHarness({
      stats: ({
        getSessionSummary: vi.fn(() => ({
          totalTrades: 2,
          winRate: 50,
          netPnl: 10,
          totalFees: 0,
          profitFactor: 1,
          bestTrade: 10,
          worstTrade: -5,
          maxDrawdown: 5,
          recent: [
            { symbol: 'BTCUSDC', side: 'buy', realizedPnl: 10.5 },
            { symbol: 'ETHUSDC', side: 'sell', realizedPnl: -2 },
          ],
        } as unknown as SessionSummary)),
      } as Partial<StatsService> as StatsService),
    });
    await h.feature.handleReport(h.ctx());
    const replyText = (h.reply.mock.calls[0]![0] as string);
    expect(replyText).toContain('BTCUSDC');
    expect(replyText).toContain('ETHUSDC');
    expect(replyText).toContain('10.50');
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /stats /stop /emergency (operator only)', () => {
  it('M1: /stop does NOT stop immediately — it asks for confirmation', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ p: 1 }] }, positions: [{ p: 1 }], stop, emergencyStop: vi.fn() } });
    h.store.addController(2, 'op', 1);
    await h.feature.handleStop(h.ctx({ from: { id: 2, username: 'op' } }));
    // Two-step: engine must NOT be stopped on the first command.
    expect(stop).not.toHaveBeenCalled();
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Confirm engine stop'));
    cleanHarness(h);
  });

  it('M1: confirming with "yes" runs engine.stop() and reports success', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const h = makeHarness({ engine: { state: 'Running', config: { pairs: [{ p: 1 }] }, positions: [{ p: 1 }], stop, emergencyStop: vi.fn() } });
    h.store.addController(2, 'op', 1);
    await h.feature.handleStop(h.ctx({ from: { id: 2, username: 'op' } }));
    // The next plain text from the same chat confirms.
    await h.feature.handleText(h.ctx({ message: { text: 'yes' } }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Engine stopped'));
    cleanHarness(h);
  });

  it.each(['y', 'Y', 'confirm', 'да', 'Si', 'YES'])(
    'M1: accepts "%s" (case-insensitive) as confirmation',
    async (word) => {
      const stop = vi.fn().mockResolvedValue(undefined);
      const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
      h.store.setAdmin(1, 'boss');
      await h.feature.handleStop(h.ctx({ from: { id: 1 } }));
      await h.feature.handleText(h.ctx({ message: { text: word } }));
      expect(stop).toHaveBeenCalledTimes(1);
      cleanHarness(h);
    },
  );

  it('M1: non-confirmation text cancels the stop', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    h.store.setAdmin(1, 'boss');
    await h.feature.handleStop(h.ctx({ from: { id: 1 } }));
    await h.feature.handleText(h.ctx({ message: { text: 'no' } }));
    expect(stop).not.toHaveBeenCalled();
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    // The pending entry was consumed — a later "yes" no longer stops.
    await h.feature.handleText(h.ctx({ message: { text: 'yes' } }));
    expect(stop).not.toHaveBeenCalled();
    cleanHarness(h);
  });

  it('M1: stale confirmations older than 60s are ignored', async () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn();
      const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
      h.store.setAdmin(1, 'boss');
      await h.feature.handleStop(h.ctx({ from: { id: 1 } }));
      // Advance past the 60s TTL.
      vi.advanceTimersByTime(61_000);
      await h.feature.handleText(h.ctx({ message: { text: 'yes' } }));
      expect(stop).not.toHaveBeenCalled();
      cleanHarness(h);
    } finally {
      vi.useRealTimers();
    }
  });

  it('M1: /stop with a missing engine reports engine-not-initialized', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    await h.feature.handleStop(h.ctx({ from: { id: 1 } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    cleanHarness(h);
  });

  it('stop denies a non-operator', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    await h.feature.handleStop(h.ctx());
    expect(stop).not.toHaveBeenCalled();
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized'));
    cleanHarness(h);
  });

  it('emergency calls engine.emergencyStop() for an operator', async () => {
    const emergencyStop = vi.fn();
    const h = makeHarness({ engine: { state: 'Error', config: {}, positions: [], stop: vi.fn(), emergencyStop } });
    h.store.setAdmin(1, 'boss');
    await h.feature.handleEmergency(h.ctx({ from: { id: 1 } }));
    expect(emergencyStop).toHaveBeenCalled();
    cleanHarness(h);
  });

  it('M1: confirmation replies cancelled when engine.stop() throws', async () => {
    const stop = vi.fn().mockRejectedValue(new Error('boom'));
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    h.store.setAdmin(1, 'boss');
    await h.feature.handleStop(h.ctx({ from: { id: 1 } }));
    await h.feature.handleText(h.ctx({ message: { text: 'yes' } }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    cleanHarness(h);
  });

  it('M1: plain text with no pending confirmation is ignored', async () => {
    const stop = vi.fn();
    const h = makeHarness({ engine: { state: 'Running', config: {}, positions: [], stop, emergencyStop: vi.fn() } });
    await h.feature.handleText(h.ctx({ message: { text: 'yes' } }));
    expect(stop).not.toHaveBeenCalled();
    // No reply was emitted for a stray text.
    expect(h.reply).not.toHaveBeenCalled();
    cleanHarness(h);
  });
});

describe('TelegramBotFeature /link and /unlink (group gating)', () => {
  it('link succeeds on a group for an operator', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    await h.feature.handleLink(h.ctx({ chat: { id: 7000, type: 'group' }, from: { id: 1 } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('linked'));
    expect(h.store.isLinked(7000)).toBe(true);
    cleanHarness(h);
  });

  it('link is refused in a private chat', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    await h.feature.handleLink(h.ctx({ from: { id: 1 } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('group chat'));
    cleanHarness(h);
  });

  it('link is denied to a non-operator', async () => {
    const h = makeHarness();
    await h.feature.handleLink(h.ctx({ chat: { id: 7000, type: 'group' } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Only an authorized'));
    cleanHarness(h);
  });

  it('unlink unlinks a group', async () => {
    const h = makeHarness();
    h.store.setAdmin(1, 'boss');
    h.store.addChat(7000, 'group');
    await h.feature.handleUnlink(h.ctx({ chat: { id: 7000, type: 'group' }, from: { id: 1 } }));
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Group unlinked'));
    expect(h.store.isLinked(7000)).toBe(false);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature unknown command', () => {
  it('responds with the unknown-command message', async () => {
    const h = makeHarness();
    await h.feature.handleUnknown(h.ctx());
    expect(h.reply).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    cleanHarness(h);
  });
});

describe('B2 — install() transport seam', () => {
  it('registers every supported command on the transport', async () => {
    const h = makeHarness();
    const registered: string[] = [];
    const registerBotCommand = vi.fn((cmd: string) => { registered.push(cmd); });
    const registerBotText = vi.fn();
    h.feature.install({ registerBotCommand, registerBotText });
    for (const cmd of ['request', 'subscribe', 'unsubscribe', 'lang', 'report', 'stats', 'stop', 'emergency', 'link', 'unlink']) {
      expect(registered).toContain(cmd);
    }
    expect(registerBotCommand).toHaveBeenCalledTimes(10);
    cleanHarness(h);
  });

  it('wires the text seam when the transport exposes registerBotText', async () => {
    const h = makeHarness();
    const registerBotText = vi.fn();
    h.feature.install({ registerBotCommand: vi.fn(), registerBotText });
    // The two-step /stop confirmation relies on this catch-all text handler.
    expect(registerBotText).toHaveBeenCalledTimes(1);
    cleanHarness(h);
  });

  it('still works on a command-only transport (no text seam)', async () => {
    const h = makeHarness();
    const registerBotCommand = vi.fn();
    h.feature.install({ registerBotCommand });
    expect(registerBotCommand).toHaveBeenCalledTimes(10);
    cleanHarness(h);
  });
});

describe('TelegramBotFeature.deliver routing', () => {
  let filePath: string;
  let store: TelegramConfigStore;
  let feature: TelegramBotFeature;
  let onMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filePath = tmpFile();
    store = new TelegramConfigStore(filePath);
    onMessage = vi.fn().mockResolvedValue(true);
    feature = new TelegramBotFeature({ store, stats: null, getEngine: () => null, onMessage });
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  });

  it('delivers to a private subscribed chat', async () => {
    store.addChat(9000, 'private');
    const n = await feature.deliver('trading', (lang) => `msg[${lang}]`);
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledWith(9000, 'msg[en]');
  });

  it('does NOT deliver when a chat is not subscribed to the type', async () => {
    // A linked group with NO member subscriptions defaults to [] — nothing
    // subscribed ⇒ no delivery (private chats always default to ALL, so they
    // can never be "not subscribed" to everything).
    store.addChat(7000, 'group');
    store.linkChat(7000, 1);
    const n = await feature.deliver('trading', () => 'x');
    expect(n).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('delivers to a group only when it is linked', async () => {
    store.addChat(7000, 'group');
    store.memberSubscribe(7000, 55, ['trading']);
    // unlinked
    await feature.deliver('trading', () => 'x');
    expect(onMessage).not.toHaveBeenCalled();

    // linked
    store.linkChat(7000, 1);
    const n = await feature.deliver('trading', (l) => `g[${l}]`);
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledWith(7000, 'g[en]');
  });

  it('routes a single chat when chatId is given', async () => {
    store.addChat(9000, 'private');
    store.addChat(9001, 'private');
    const n = await feature.deliver('error', () => 'e', { chatId: 9001 });
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(9001, 'e');
  });

  it('passes each chat its own per-chat language', async () => {
    store.addChat(9000, 'private');
    store.addChat(9001, 'private');
    store.setChatLanguage(9000, 'es');
    store.setChatLanguage(9001, 'ru');
    const langs: string[] = [];
    const n = await feature.deliver('trading', (lang) => { langs.push(lang); return lang; });
    expect(n).toBe(2);
    expect(langs.sort()).toEqual(['es', 'ru']);
  });

  it('dedupes a group to a single delivery even with multiple subscribed members', async () => {
    store.addChat(7000, 'group');
    store.linkChat(7000, 1);
    store.memberSubscribe(7000, 10, ['trading']);
    store.memberSubscribe(7000, 20, ['trading']);
    const n = await feature.deliver('trading', () => 'x');
    expect(n).toBe(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('returns 0 and calls nothing when onMessage is absent', async () => {
    const noTransport = new TelegramBotFeature({ store, stats: null, getEngine: () => null });
    const n = await noTransport.deliver('trading', () => 'x');
    expect(n).toBe(0);
  });
});