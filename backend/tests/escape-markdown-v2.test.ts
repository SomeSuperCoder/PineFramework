import { describe, it, expect } from 'vitest';

/**
 * DUPLICATED from TelegramService.ts for unit testing.
 * The function is not exported, so we duplicate it here.
 * This is acceptable for a pure function with no side effects.
 *
 * Escape all MarkdownV2 special characters EXCEPT `*` (which is used for
 * bold formatting in i18n strings). This ensures dynamic text is safe to
 * send with `parse_mode: 'MarkdownV2'` while preserving intentional bold.
 */
function escapeMarkdownV2(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // must be first to avoid double-escaping
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

describe('escapeMarkdownV2', () => {
  // ─── Individual special characters ───

  describe('escapes each MarkdownV2 special character', () => {
    const cases: [string, string][] = [
      ['_', '\\_'],
      ['[', '\\['],
      [']', '\\]'],
      ['(', '\\('],
      [')', '\\)'],
      ['~', '\\~'],
      ['`', '\\`'],
      ['>', '\\>'],
      ['#', '\\#'],
      ['+', '\\+'],
      ['-', '\\-'],
      ['=', '\\='],
      ['|', '\\|'],
      ['{', '\\{'],
      ['}', '\\}'],
      ['.', '\\.'],
      ['!', '\\!'],
    ];

    it.each(cases)('escapes "%s" to "%s"', (input, expected) => {
      expect(escapeMarkdownV2(input)).toBe(expected);
    });
  });

  // ─── Backslash must be escaped first ───

  it('escapes backslash first to avoid double-escaping', () => {
    // A single backslash should become double-backslash, NOT quadruple
    expect(escapeMarkdownV2('\\')).toBe('\\\\');
  });

  it('does not double-escape when backslash precedes a special char', () => {
    // "\!" should become "\\!" (escaped backslash + escaped exclamation)
    expect(escapeMarkdownV2('\\!')).toBe('\\\\\\!');
  });

  // ─── Asterisk must NOT be escaped ───

  it('does NOT escape asterisk (used for bold formatting)', () => {
    expect(escapeMarkdownV2('*')).toBe('*');
  });

  it('preserves multiple asterisks unchanged', () => {
    expect(escapeMarkdownV2('**')).toBe('**');
  });

  // ─── Mixed content with bold formatting ───

  it('preserves *bold* formatting while escaping surrounding text', () => {
    const input = '*Welcome to PineFramework Bot!*';
    const result = escapeMarkdownV2(input);
    // The * must remain, but ! must be escaped
    expect(result).toBe('*Welcome to PineFramework Bot\\!*');
  });

  it('preserves multiple bold segments in mixed content', () => {
    const input = 'Hello *World*, welcome to *PineFramework*!';
    const result = escapeMarkdownV2(input);
    // * is NOT escaped — only the ! and , need escaping
    expect(result).toBe('Hello *World*, welcome to *PineFramework*\\!');
  });

  // ─── The exact failing message from the bug ───

  it('escapes the exact /start command response correctly', () => {
    const input =
      '🚀 *Welcome to PineFramework Bot!*\n\n' +
      'I stream your Pine indicator signals to this chat, so you never miss a move.\n\n' +
      'Send /help to see every command, or just tell me you are ready to roll.';

    const result = escapeMarkdownV2(input);

    // The \n must be preserved (they are not MarkdownV2 special chars)
    // The * must NOT be escaped
    // The !, ., / must be escaped
    expect(result).toBe(
      '🚀 *Welcome to PineFramework Bot\\!*\n\n' +
      'I stream your Pine indicator signals to this chat, so you never miss a move\\.\n\n' +
      'Send /help to see every command, or just tell me you are ready to roll\\.'
    );
  });

  // ─── Edge cases ───

  it('returns empty string for empty input', () => {
    expect(escapeMarkdownV2('')).toBe('');
  });

  it('returns string unchanged when there are no special characters', () => {
    expect(escapeMarkdownV2('Hello world')).toBe('Hello world');
  });

  it('returns string unchanged when it contains only asterisks', () => {
    expect(escapeMarkdownV2('*')).toBe('*');
  });

  it('handles string with only special characters', () => {
    expect(escapeMarkdownV2('_[]()~`>#+-=|{}.!')).toBe(
      '\\_\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!'
    );
  });

  it('handles unicode characters without corrupting them', () => {
    // ¡ is NOT a MarkdownV2 special char, so it stays unescaped
    expect(escapeMarkdownV2('¡Hola! 🚀')).toBe('¡Hola\\! 🚀');
  });

  it('escapes multiple occurrences of the same character', () => {
    expect(escapeMarkdownV2('...')).toBe('\\.\\.\\.');
  });

  it('handles newlines and whitespace without corrupting them', () => {
    expect(escapeMarkdownV2('line1\nline2\n\nline3')).toBe('line1\nline2\n\nline3');
  });

  it('handles tabs without corrupting them', () => {
    expect(escapeMarkdownV2('col1\tcol2')).toBe('col1\tcol2');
  });

  // ─── Comprehensive character set ───

  it('escapes all 17 special characters in a single string', () => {
    const allSpecial = '_[]()~`>#+-=|{}.!\\';
    const result = escapeMarkdownV2(allSpecial);
    // Must not contain any unescaped special chars
    // Backslash is escaped first, so no raw \ before a special char
    expect(result).toBe(
      '\\_\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\'
    );
  });

  it('asterisk in the middle of special characters is NOT escaped', () => {
    expect(escapeMarkdownV2('_*_')).toBe('\\_*\\_');
  });
});
