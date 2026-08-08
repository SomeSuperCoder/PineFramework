/**
 * Design-token mirror consistency test.
 *
 * Enforces the DESIGN-MIRO-DARK.md law at the CSS layer:
 *   1. EVERY `--pf-*` token in `frontend/src/theme/tokens.ts` (the single
 *      source of truth) must be declared in `index.css` `:root` with the
 *      EXACT same value (string compare).
 *   2. `:root` must declare NO `--pf-*` token that tokens.ts does not know.
 *   3. No trace of the old design system may survive in `index.css`:
 *      legacy token names, legacy hex values, legacy rgba backdrops, and
 *      legacy font families are all banned.
 *
 * Values that legitimately survive as NEW token values (`#0d0d18` = canvas,
 * `#1e1e2e` = surface-3) are only allowed INSIDE the `:root` token block —
 * never hardcoded in a class rule.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVars } from '../theme/tokens';

// Vitest runs from the frontend package root (where vitest.config.ts lives),
// so src/index.css is cwd-relative; fall back to a repo-root invocation.
const cssCandidates = [
  path.resolve(process.cwd(), 'src/index.css'),
  path.resolve(process.cwd(), 'frontend/src/index.css'),
];
const cssPath = cssCandidates.find(existsSync);
if (!cssPath) {
  throw new Error(`index.css not found (tried: ${cssCandidates.join(', ')})`);
}
const cssText = readFileSync(cssPath, 'utf-8');

/** Extract the `:root { ... }` block (token declarations live there). */
function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('index.css has no :root block — token mirror cannot be verified');
  return match[0];
}

/** Parse `--name: value;` declarations out of a CSS block into a Map. */
function parseCustomProperties(block: string): Map<string, string> {
  const props = new Map<string, string>();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    props.set(match[1], match[2].trim());
  }
  return props;
}

const rootBlock = extractRootBlock(cssText);
const cssProps = parseCustomProperties(rootBlock);

/** Legacy token NAMES from the old design system (all unprefixed `--*`). */
const LEGACY_TOKEN_NAMES = [
  '--surface-bg',
  '--surface-panel',
  '--surface-footer',
  '--surface-elevated',
  '--surface-overlay',
  '--border-subtle',
  '--border-focus',
  '--text-primary',
  '--text-secondary',
  '--text-disabled',
  '--text-inverse',
  '--accent-primary',
  '--accent-primary-hover',
  '--accent-info',
  '--accent-success',
  '--accent-warning',
  '--accent-danger',
  '--font-family',
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-md',
  '--font-size-base',
  '--font-size-lg',
  '--font-weight-normal',
  '--font-weight-medium',
  '--font-weight-semibold',
  '--space-xs',
  '--space-sm',
  '--space-md',
  '--space-lg',
  '--space-xl',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
];

/**
 * Legacy VALUES from DESIGN-MIRO-DARK.md §17 that are NOT also new token
 * values — their presence anywhere in index.css is a violation.
 */
const LEGACY_VALUES = [
  '#0f1520', // → surface-1 (renamed; new value is #12121f)
  '#e94560', // → semantic-error / white primary pill
  '#0a0a14', // → surface-0
  '#111128', // → hairline
  '#151530', // → chart-border / hairline-strong
  '#e0e0e0', // → ink-1
  '#c8c8d0', // → ink-2
  '#888', // → steel-muted
  '#555', // → steel-disabled
  '#c73e54', // → semantic-error-hover
  '#2196f3', // → brand-blue / semantic-info
  '#4caf50', // → semantic-success
  '#ff9800', // → semantic-warning
  '#f44336', // → semantic-error
  '#181830', // → chart-grid
  '#666', // old placeholder
  '#ffb74d', // old built-in badge text
  '#2e2a1a', // old badge tints
  '#1a3a2e',
  '#3e2a1a',
  'rgba(0, 0, 0, 0.7)', // old editor overlay
  'rgba(0, 0, 0, 0.5)', // old quick-adder overlay
  'rgba(0, 0, 0, 0.6)', // old shadow-lg (new scrim is 0.60 — distinct string)
  'rgba(12, 15, 30, 0.95)', // old legend fill
  'BlinkMacSystemFont', // old font stack (banned: only the official stack may be used)
  'Helvetica Neue',
  'Arial',
];

describe('design token mirror (index.css ↔ tokens.ts)', () => {
  it('declares every token from tokens.ts in :root with the exact same value', () => {
    const entries = Object.entries(cssVars);
    expect(entries.length).toBeGreaterThan(50); // sanity: the full token set is mirrored
    for (const [name, value] of entries) {
      expect(cssProps.has(name), `:root is missing ${name}`).toBe(true);
      expect(cssProps.get(name), `:root value for ${name} diverges from tokens.ts`).toBe(value);
    }
  });

  it('declares no --pf-* token in :root that tokens.ts does not know', () => {
    for (const name of cssProps.keys()) {
      if (!name.startsWith('--pf-')) continue;
      expect(name in cssVars, `:root declares unknown token ${name}`).toBe(true);
    }
  });

  it('contains no legacy token names from the old design system', () => {
    for (const name of LEGACY_TOKEN_NAMES) {
      expect(cssText, `legacy token name ${name} survived`).not.toContain(name);
    }
  });

  it('contains no legacy values from the old design system', () => {
    const lower = cssText.toLowerCase();
    for (const value of LEGACY_VALUES) {
      expect(lower, `legacy value ${value} survived`).not.toContain(value);
    }
  });

  it('only allows legacy-surviving hexes (#0d0d18, #1e1e2e) inside the :root token block', () => {
    // These two hexes ARE new token values (canvas, surface-3) — legal in :root —
    // but must never appear hardcoded in any class rule outside it.
    const outsideRoot = cssText.replace(rootBlock, '');
    expect(outsideRoot).not.toContain('#0d0d18');
    expect(outsideRoot).not.toContain('#1e1e2e');
  });

  it('enforces dark-only chrome (color-scheme: dark) at the root', () => {
    expect(rootBlock).toContain('color-scheme: dark');
  });
});
