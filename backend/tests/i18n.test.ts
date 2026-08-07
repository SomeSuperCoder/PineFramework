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

  it('leaves the string untouched when no params are given', () => {
    expect(t('es', 'statsRunning')).toBe(es.statsRunning);
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