/**
 * Source-level assertions for fixes that live inside index.ts and are not
 * unit-testable in isolation: M2 (kindToType routing), H2 (localhost bind),
 * H3 (no password in the proxy-test log).
 *
 * `kindToType` is a private inline closure inside the ENABLE_TRADING_BOT block
 * of index.ts — there is no exported symbol to drive. Exporting it would be a
 * production-code change (out of the Test Engineer's lane), so these assertions
 * verify the SOURCE encodes the exact fix contract. If index.ts is later
 * refactored to make kindToType testable, these should be superseded by
 * behavior-level tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf-8');

describe('M2 — kindToType routes lifecycle kinds to bot_lifecycle', () => {
  it('maps emergency_stop and state_change to bot_lifecycle', () => {
    // The switch cases must route BOTH lifecycle kinds to 'bot_lifecycle'.
    const block = src.slice(src.indexOf('const kindToType'), src.indexOf('const routing'));
    expect(block).toContain("'emergency_stop'");
    expect(block).toContain("'state_change'");
    expect(block).toContain("return 'bot_lifecycle';");
  });

  it('does NOT produce the legacy "trading" bucket from the router mapper', () => {
    const block = src.slice(src.indexOf('const kindToType'), src.indexOf('const routing'));
    // No case returns the legacy catch-all 'trading' — only trading-specific
    // kinds remain, mapped to their own buckets.
    expect(block).not.toMatch(/return\s+'trading'/);
  });
});

describe('H2 — backend binds to localhost only', () => {
  it('binds server.listen to HOST env with 127.0.0.1 default', () => {
    expect(src).toMatch(/const HOST = process\.env\.HOST \?\? '127\.0\.0\.1'/);
    expect(src).toMatch(/server\.listen\(\s*PORT\s*,\s*HOST/);
  });
});

describe('H3 — proxy-test log omits credentials', () => {
  it('logs host:port only, never the password-bearing proxyUrl', () => {
    const line = src
      .split('\n')
      .find((l) => l.includes('[Proxy-Test] Testing HTTP proxy'));
    expect(line).toBeDefined();
    expect(line).toContain('${proxy.host}:${proxy.port}');
    // The log statement must not interpolate the full proxyUrl (which embeds
    // username:password@).
    expect(line).not.toContain('proxyUrl');
    expect(line).not.toContain('password');
  });
});