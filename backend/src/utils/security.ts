import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_FILE_SIZE = 1024 * 1024;

/** Allowed hostnames for Bybit API URLs (SSRF prevention). */
const ALLOWED_BYBIT_HOSTNAMES = new Set([
  'api.bybit.com',
  'api.bytick.com',
  'stream.bybit.com',
  'stream.bytick.com',
]);

/** Allowed protocols for external URLs. */
const ALLOWED_PROTOCOLS = new Set(['https:', 'wss:']);

/**
 * Validate a URL against an allowlist of hostnames.
 * Throws if the URL is invalid, uses a disallowed protocol, or points
 * to a hostname not in the allowlist.
 */
export function validateBybitUrl(url: string, context: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid ${context}: "${url}" is not a valid URL`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Invalid ${context}: protocol "${parsed.protocol}" is not allowed. Must be https: or wss:`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_BYBIT_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Invalid ${context}: hostname "${hostname}" is not in the allowlist. ` +
        `Allowed hostnames: ${[...ALLOWED_BYBIT_HOSTNAMES].join(', ')}`,
    );
  }
}

/**
 * Validate a trading pair symbol.
 * Returns true if the symbol contains only alphanumeric characters.
 */
export function validateSymbol(symbol: string): boolean {
  return /^[A-Za-z0-9]+$/.test(symbol);
}

export function validateFilePath(filePath: string, allowedDir: string): boolean {
  const resolvedAllowed = path.resolve(allowedDir);
  const resolved = path.resolve(filePath);

  // Resolve symlinks to prevent bypass via symlink chains
  try {
    const realPath = fs.realpathSync(resolved);
    const realAllowed = fs.realpathSync(resolvedAllowed);
    // Check via path.relative: the relative path must NOT start with '..'
    // Empty relative means the paths are identical (allowed).
    const relative = path.relative(realAllowed, realPath);
    if (relative === '' || (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative))) {
      return true;
    }
    return false;
  } catch {
    // If realpath fails (e.g., file doesn't exist yet), fall back to relative check
    const relative = path.relative(resolvedAllowed, resolved);
    return relative === '' || (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative));
  }
}

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

export function sanitizeContent(content: string): string {
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Strip __proto__ and constructor.prototype keys from a parsed JSON object
 * to prevent prototype pollution.
 */
export function sanitizeJson<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = sanitizeJson(obj[i]);
    }
    return obj;
  }
  if (typeof obj === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (obj !== null) {
      const keys = Object.keys(obj as Record<string, unknown>);
      for (const key of keys) {
        if (key === '__proto__' || key === 'constructor') {
          delete (obj as Record<string, unknown>)[key];
        } else {
          (obj as Record<string, unknown>)[key] = sanitizeJson((obj as Record<string, unknown>)[key]);
        }
      }
    }
    return obj;
  }
  return obj;
}
