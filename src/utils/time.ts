// Centralized time handling — single source of truth for all date/time operations.
// MSK (Moscow Standard Time) = UTC+3, no DST.
// All external boundaries (UI, APIs, logs) MUST use this module.
// Internal engine timestamps remain Unix seconds (UTC).

const MSK_OFFSET_SECONDS = 3 * 60 * 60; // +03:00
const MSK_OFFSET_MS = MSK_OFFSET_SECONDS * 1000;

function toUtcDate(ts: number): Date {
  return new Date(ts * 1000);
}

function toUtcDateMs(ms: number): Date {
  return new Date(ms);
}

/** Current time as Unix seconds (UTC). */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Current time as milliseconds (UTC). */
export function nowMs(): number {
  return Date.now();
}

/** Convert Unix seconds (UTC) to Date. */
export function fromSeconds(ts: number): Date {
  return toUtcDate(ts);
}

/** Convert Date to Unix seconds (UTC). */
export function toSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/** Convert milliseconds to Unix seconds. */
export function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Convert Unix seconds to milliseconds. */
export function secondsToMs(ts: number): number {
  return ts * 1000;
}

/** Convert Unix seconds (UTC) → MSK Date. */
export function toMskDate(ts: number): Date {
  return new Date((ts + MSK_OFFSET_SECONDS) * 1000);
}

/** Convert Date (UTC) → MSK Date. */
export function toMskDateFromUtc(d: Date): Date {
  return new Date(d.getTime() + MSK_OFFSET_MS);
}

/** Convert MSK Date → Unix seconds (UTC). */
export function fromMskDate(d: Date): number {
  return Math.floor((d.getTime() - MSK_OFFSET_MS) / 1000);
}

/** Get MSK date components from Unix seconds (UTC). */
export function getMskComponents(ts: number): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  const d = toMskDate(ts);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
  };
}

/** Format Unix seconds as YYYY-MM-DD (MSK). */
export function formatDate(ts: number): string {
  const c = getMskComponents(ts);
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

/** Format Unix seconds as HH:MM (24h, MSK). */
export function formatTime(ts: number): string {
  const c = getMskComponents(ts);
  return `${String(c.hours).padStart(2, '0')}:${String(c.minutes).padStart(2, '0')}`;
}

/** Format Unix seconds as YYYY-MM-DD HH:MM (MSK). */
export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

/** Parse MSK date (YYYY-MM-DD) + MSK time (HH:MM) → Unix seconds (UTC). */
export function parseMsk(dateStr: string, timeStr: string): number {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const hh = Math.min(Math.max(parseInt(m[1], 10), 0), 23);
  const mm = Math.min(Math.max(parseInt(m[2], 10), 0), 59);
  const ms = Date.parse(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`);
  return isNaN(ms) ? NaN : Math.floor(ms / 1000);
}

/** Get current MSK date string (YYYY-MM-DD). */
export function todayMsk(): string {
  return formatDate(now());
}

/** Get current MSK time string (HH:MM). */
export function nowTimeMsk(): string {
  return formatTime(now());
}

/** Add seconds to a Unix timestamp. */
export function addSeconds(ts: number, seconds: number): number {
  return ts + seconds;
}

/** Subtract seconds from a Unix timestamp. */
export function subSeconds(ts: number, seconds: number): number {
  return ts - seconds;
}

/** Start of day (00:00 MSK) for a given Unix timestamp → Unix seconds (UTC). */
export function startOfDayMsk(ts: number): number {
  const c = getMskComponents(ts);
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day, 0, 0, 0));
  return Math.floor((d.getTime() - MSK_OFFSET_MS) / 1000);
}

/** End of day (23:59:59 MSK) for a given Unix timestamp → Unix seconds (UTC). */
export function endOfDayMsk(ts: number): number {
  const c = getMskComponents(ts);
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day, 23, 59, 59));
  return Math.floor((d.getTime() - MSK_OFFSET_MS) / 1000);
}

/** Convert engine bar timestamp (ms since epoch) → Unix seconds (UTC). */
export function barTimeToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Convert Unix seconds (UTC) → engine bar timestamp (ms since epoch). */
export function secondsToBarTime(ts: number): number {
  return ts * 1000;
}

/** ISO string in MSK timezone (for logging/debug). */
export function toIsoMsk(ts: number): string {
  const d = toMskDate(ts);
  return d.toISOString().replace('Z', '+03:00');
}

/** Format Unix seconds as MM/DD HH:MM (MSK) for axis labels. */
export function formatAxisLabel(utcSeconds: number): string {
  const d = toMskDate(utcSeconds);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Format Unix seconds as YYYY-MM-DD HH:MM (MSK) for tooltips. */
export function formatTooltipDateTime(utcSeconds: number): string {
  const d = toMskDate(utcSeconds);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export { MSK_OFFSET_SECONDS, MSK_OFFSET_MS };