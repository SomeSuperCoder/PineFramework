/**
 * telegram-keyboard-localization.test.ts — The /start dashboard keyboard labels
 * must localize to the chat's language.
 *
 * `buildDashboardKeyboard(isOperator, lang)` resolves every button label through
 * `t(lang, dashBtn*)`. This is user-visible: a Spanish chat sees "📊 Informe",
 * not "📊 Report". We drive the PUBLIC handler (handleStart) with a store chat
 * language set to 'es' and 'ru', then assert the rendered inline-button label
 * strings match the human strings in the matching dictionary.
 *
 * Uses a real TelegramConfigStore on a tmp file so the store→feature round-trip
 * (chatLang → dashboard) is exercised end-to-end.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import { TelegramConfigStore } from '../src/store/TelegramConfigStore.js';
import {
  TelegramBotFeature,
  type FeatureCommandContext,
  type CallbackContext,
} from '../src/telegram/TelegramBotFeature.js';
import { t } from '../src/telegram/i18n.js';

function tmpFile(): string {
  return path.join(os.tmpdir(), `kbd-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

const CHAT_ID = 42;

function makeHarness() {
  const filePath = tmpFile();
  const store = new TelegramConfigStore(filePath);
  const reply = vi.fn().mockResolvedValue(true);
  const feature = new TelegramBotFeature({
    store,
    getEngine: () => null,
    onMessage: async () => true,
  });
  const ctx = (overrides: Partial<FeatureCommandContext> = {}): FeatureCommandContext => ({
    from: overrides.from ?? { id: CHAT_ID, username: 'num', first_name: 'Num' },
    chat: overrides.chat ?? { id: CHAT_ID, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
  });
  const cbCtx = (overrides: Partial<CallbackContext> = {}): CallbackContext => ({
    from: overrides.from ?? { id: CHAT_ID, username: 'num', first_name: 'Num' },
    chat: overrides.chat ?? { id: CHAT_ID, type: 'private' },
    message: overrides.message ?? { text: '' },
    reply: overrides.reply ?? reply,
    callbackQueryId: overrides.callbackQueryId ?? 'cb',
    data: overrides.data ?? 'start:menu',
    action: overrides.action ?? 'start',
    params: overrides.params ?? 'menu',
    answerCallback: overrides.answerCallback ?? vi.fn().mockResolvedValue(undefined),
    editMessage: overrides.editMessage ?? vi.fn().mockResolvedValue(undefined),
  });
  const clean = () => { try { fs.unlinkSync(filePath); } catch { /* ignore */ } };
  return { store, feature, reply, ctx, cbCtx, clean };
}

/** Flatten a telegram inline_keyboard into the human button labels. */
function buttonLabels(markup: { reply_markup: { inline_keyboard: { text: string }[][] } }): string[] {
  return markup.reply_markup.inline_keyboard.flat().map((b) => b.text);
}

type Markup = { reply_markup: { inline_keyboard: { text: string }[][] } };
function replyMarkup(reply: ReturnType<typeof vi.fn>): Markup {
  return reply.mock.calls[reply.mock.calls.length - 1]![1] as Markup;
}
function editMarkup(editMessage: ReturnType<typeof vi.fn>): Markup {
  return editMessage.mock.calls[0]![1] as Markup;
}

describe('dashboard keyboard localization', () => {
  it('localizes every non-operator dashboard button label to es', async () => {
    const h = makeHarness();
    // Register the chat first (handleStart does this), THEN set its language.
    await h.feature.handleStart(h.ctx());
    h.store.setChatLanguage(CHAT_ID, 'es');
    await h.feature.handleStart(h.ctx());
    const labels = buttonLabels(replyMarkup(h.reply));

    expect(labels).toContain(t('es', 'dashBtnManage'));
    expect(labels).toContain(t('es', 'dashBtnLang'));
    expect(labels).toContain(t('es', 'dashBtnReport')); // '📊 Informe'
    expect(labels).toContain(t('es', 'dashBtnRequest'));
    // Non-operator: no Stop / Emergency row.
    expect(labels).not.toContain(t('es', 'dashBtnStop'));
    h.clean();
  });

  it('localizes the operator variant (Stop / Emergency row) to es', async () => {
    const h = makeHarness();
    h.store.setAdmin(CHAT_ID, 'operator'); // operator row shown
    await h.feature.handleStart(h.ctx());
    h.store.setChatLanguage(CHAT_ID, 'es');
    await h.feature.handleStart(h.ctx());
    const labels = buttonLabels(replyMarkup(h.reply));

    expect(labels).toContain(t('es', 'dashBtnStop')); // "🛑 Detener"
    expect(labels).toContain(t('es', 'dashBtnEmergency')); // "🚨 Emergencia"
    expect(labels).not.toContain(t('es', 'dashBtnRequest')); // operator row replaces request
    h.clean();
  });

  it('uses ENGLISH labels by default for a chat with no language set', async () => {
    const h = makeHarness(); // store defaults to en
    await h.feature.handleStart(h.ctx());
    const labels = buttonLabels(replyMarkup(h.reply));
    expect(labels).toContain('📊 Report');
    expect(labels).toContain('🔔 Manage notifications');
    h.clean();
  });

  it('localizes every operator dashboard button label to ru', async () => {
    const h = makeHarness();
    h.store.setAdmin(CHAT_ID, 'Admin'); // operator row shown
    await h.feature.handleStart(h.ctx());
    h.store.setChatLanguage(CHAT_ID, 'ru');
    await h.feature.handleStart(h.ctx());
    const labels = buttonLabels(replyMarkup(h.reply));

    expect(labels).toContain(t('ru', 'dashBtnManage'));
    expect(labels).toContain(t('ru', 'dashBtnReport'));
    expect(labels).toContain(t('ru', 'dashBtnStop'));
    expect(labels).toContain(t('ru', 'dashBtnEmergency'));
    h.clean();
  });

  it('re-renders the dashboard back-row localized through handleDashboardCallback (start:menu)', async () => {
    const h = makeHarness();
    await h.feature.handleStart(h.ctx());
    h.store.setChatLanguage(CHAT_ID, 'es');
    const editMessage = vi.fn().mockResolvedValue(undefined);
    await h.feature.handleDashboardCallback(h.cbCtx({ editMessage }));
    const labels = buttonLabels(editMarkup(editMessage));
    expect(labels).toContain(t('es', 'dashBtnManage'));
    expect(labels).toContain(t('es', 'dashBtnReport'));
    h.clean();
  });
});
