/**
 * backend/src/utils/sanitize.ts — shared user-facing error sanitizer (security S2).
 *
 * WHY this module exists: the HTTP backtest route (routes/backtest.ts) and the
 * Telegram seam (telegram/backtest/runTelegramBacktest.ts) both redact
 * URLs/hostnames from thrown infrastructure messages before the text reaches a
 * user. Each file previously carried its own copy of the same two regexes —
 * SSOT drift risk. This module is the single authority; both call sites import
 * it.
 *
 * Redaction is deliberately CONSERVATIVE:
 *  - scheme:// URLs are always redacted (first pass).
 *  - a bare hostname is redacted only when its TLD is a known public one — so
 *    dotted Pine identifiers like `ta.ema` or `math.abs` are NOT misread as
 *    hosts (the old `(?:[a-z0-9-]+\.)+[a-z]{2,}` pattern over-matched any
 *    2+ letter final label). The `i` flag keeps uppercase TLDs (API.BYBIT.COM)
 *    redacted as before.
 */
const HOSTNAME_RE =
  /(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|dev|app|co|xyz|info|biz|me|cc|tv|pro|ai|edu|gov)(?::\d+)?/gi;

/**
 * Turn a thrown value into a user-safe message: unwrap Error.message (or
 * stringify anything else), then redact URLs and hostnames. The raw message
 * stays in server-side logs only — callers log it before sanitizing.
 */
export function sanitizeUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
    .replace(HOSTNAME_RE, '[redacted-host]');
}