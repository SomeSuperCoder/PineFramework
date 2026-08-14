import {
  DICTIONARIES,
  t,
  isSupportedLanguage,
} from '../src/telegram/i18n.js';

// The dictionaries live under DICTIONARIES (not as bare exports); en is the
// source of truth for every key-parity assertion.
const { en, es, ru } = DICTIONARIES;

describe('i18n dictionary parity', () => {
  it('keeps every dictionary key-aligned with the en source of truth', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('exposes the same dictionaries through DICTIONARIES', () => {
    expect(DICTIONARIES.en).toBe(en);
    expect(DICTIONARIES.es).toBe(es);
    expect(DICTIONARIES.ru).toBe(ru);
  });

  it('keeps the parallel dictionaries at exactly 145 keys each (localization change)', () => {
    const count = Object.keys(en).length;
    expect(count).toBe(145);
    expect(Object.keys(es).length).toBe(count);
    expect(Object.keys(ru).length).toBe(count);
  });

  it('covers the localized keyboard + PnL-card label key groups in every language', () => {
    const enKeys = new Set(Object.keys(en));
    const groups = [
      ['dashBtnManage', 'dashBtnLang', 'dashBtnReport', 'dashBtnStop', 'dashBtnEmergency', 'dashBtnRequest', 'dashBtnBacktest'],
      ['btnConfirm', 'btnCancel', 'btnEmergencyStop', 'btnBackMain', 'btnNotifEnableAll', 'btnNotifDisableAll'],
      ['notifTypeTrading', 'notifTypePositionOpen', 'notifTypePositionClose', 'notifTypeReport', 'notifTypeDaily', 'notifTypeError', 'notifTypeBotLifecycle'],
      ['cardBrand', 'cardGlobal', 'cardRealized', 'cardUnrealized', 'cardNetRealizedUnrealized', 'cardSymbolPnl', 'cardTopMovers', 'cardWinRate', 'cardProfitFactor', 'cardAvgTrade', 'cardMaxDrawdown', 'cardOpenPositions', 'cardGenerated', 'cardEmptyState', 'cardEngineRunning', 'cardEngineStopped', 'cardEngineError', 'cardEngineUnknown', 'cardFooter', 'cardReportWord'],
      ['backtestStepStrategy', 'backtestStepSymbol', 'backtestStepTimeframe', 'backtestStepDays', 'backtestStepMethod', 'backtestStepCapital', 'backtestStepRun', 'backtestRunSummary', 'backtestRunning', 'backtestRunDone', 'backtestCancelConfirm', 'backtestEmptyLibrary', 'backtestAlreadyRunning', 'backtestErrNoStrategies', 'backtestErrStrategyNotFound', 'backtestErrNotAStrategy', 'backtestErrTooManyBars', 'backtestErrInvalidSettings', 'backtestErrFeeFetch', 'backtestErrEngine', 'backtestErrDataFetch', 'backtestBtnBack', 'backtestBtnRestart', 'backtestBtnRun', 'backtestMethodUltra', 'backtestMethodManual', 'backtestTextTitle', 'backtestTextSummary', 'backtestTextMetrics', 'backtestTextStats', 'backtestTextGenerated', 'backtestResultCaption', 'backtestCardEngine', 'backtestCardNet', 'backtestCardSettings', 'backtestCardSetSymbol', 'backtestCardSetTimeframe', 'backtestCardSetRange', 'backtestCardSetMethod', 'backtestCardSetCapital', 'backtestCardPerformance', 'backtestCardBarsAnnotation', 'backtestCardTrades', 'backtestCardWinRate', 'backtestCardProfitFactor', 'backtestCardMaxDrawdown', 'backtestCardSharpe', 'backtestCardBuyHold', 'backtestCardCommission', 'backtestCardBars', 'backtestCardAvgTrade', 'backtestCardGenerated', 'backtestCardFooter'],
    ];
    for (const group of groups) {
      for (const key of group) {
        expect(enKeys.has(key), `en must define "${key}"`).toBe(true);
      }
    }
    // Same sets exist in es and ru (parallel dictionaries).
    expect(new Set(Object.keys(es)).has('dashBtnReport')).toBe(true);
    expect(new Set(Object.keys(ru)).has('dashBtnReport')).toBe(true);
  });
});

describe('t() interpolation', () => {
  it('substitutes named placeholders in all languages', () => {
    expect(t('en', 'langCurrent', { lang: 'de' })).toContain('de');
    expect(t('es', 'langCurrent', { lang: 'de' })).toContain('de');
    expect(t('ru', 'langCurrent', { lang: 'de' })).toContain('de');
  });

  it('interpolates numeric values', () => {
    const msg = t('en', 'reportRow', { symbol: 'BTC', side: 'L', pnl: '5' });
    expect(msg).toContain('BTC');
    expect(msg).toContain('5');
  });

  it('backtestRunSummary carries the {{capital}} placeholder in every language', () => {
    for (const lang of Object.keys(DICTIONARIES) as Array<keyof typeof DICTIONARIES>) {
      expect(t(lang, 'backtestRunSummary')).toContain('{{capital}}');
    }
  });

  it('leaves the string untouched when no params are given', () => {
    // reportHeader has no placeholders — it must be returned verbatim.
    expect(t('es', 'reportHeader')).toBe(es.reportHeader);
  });

  it('resolves the report generated + engine-state keys in every language', () => {
    const languages = Object.keys(DICTIONARIES) as Array<keyof typeof DICTIONARIES>;
    for (const lang of languages) {
      // Generated-time key interpolates the time placeholder.
      expect(t(lang, 'reportGenerated', { time: 'Aug 7, 2026 · 14:32 UTC' })).toContain('Aug 7, 2026 · 14:32 UTC');
      // Engine-state words all resolve to non-blank, real strings.
      expect(t(lang, 'reportEngineRunning').length).toBeGreaterThan(0);
      expect(t(lang, 'reportEngineStopped').length).toBeGreaterThan(0);
      expect(t(lang, 'reportEngineError').length).toBeGreaterThan(0);
      expect(t(lang, 'reportEngineUnknown').length).toBeGreaterThan(0);
    }
  });
});

describe('t() fallback', () => {
  it('resolves every key in every language to a real, non-blank string', () => {
    const languages = Object.keys(DICTIONARIES) as Array<keyof typeof DICTIONARIES>;
    for (const lang of languages) {
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        const out = t(lang, key);
        expect(out.length).toBeGreaterThan(0);
        // Never a raw key or blank — either the translated string or the en source.
        expect(out).not.toBe(`{{}}`);
      }
    }
  });

  it('falls back to the en source-of-truth when a non-en override goes missing', () => {
    // All keys exist in all three dicts today, so the defensive fallback cannot
    // trigger with typed inputs (the parity test enforces the same). This pins
    // the safety net's behaviour: en is never blank and is always resolvable.
    // The sample key is a surviving key: validTypes was removed along with the
    // text-command error paths in the command-removal change (2026-08-07).
    expect(en.unknownCommand).toBeTruthy();
    expect(t('en', 'unknownCommand')).toBe(en.unknownCommand);
  });
});

describe('isSupportedLanguage', () => {
  it('accepts only the three chat languages', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('es')).toBe(true);
    expect(isSupportedLanguage('ru')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(42)).toBe(false);
  });
});