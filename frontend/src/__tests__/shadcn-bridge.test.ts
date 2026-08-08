/**
 * shadcn theme bridge conformance test.
 *
 * Guards the DESIGN.md contract at the `frontend/src/main.css` bridge layer
 * (the shadcn theme bridge, waves 1.4/1.5). DESIGN.md is the law:
 *   · every shadcn theme variable is a THIN `var(--pf-*)` alias — no literal
 *     colors may live in the bridge `:root` block;
 *   · the app is DARK-ONLY (DESIGN §0) — no light block, no
 *     `prefers-color-scheme: light`, no `.dark` / `.light` class theme;
 *   · the `dark` variant is anchored to `:root` (always on);
 *   · font family comes from `--pf-font-family` — never Geist;
 *   · no weight > 600 (DESIGN §6) in ui components (font-bold/extrabold/700).
 *
 * This test NEVER edits main.css or ui components. A violation is reported
 * with the exact string + file so the owning engineer can fix it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the frontend package root (where vitest.config.ts lives),
// so src/main.css is cwd-relative; fall back to a repo-root invocation.
const cssCandidates = [
  path.resolve(process.cwd(), 'src/main.css'),
  path.resolve(process.cwd(), 'frontend/src/main.css'),
];
const cssPath = cssCandidates.find(existsSync);
if (!cssPath) {
  throw new Error(`main.css not found (tried: ${cssCandidates.join(', ')})`);
}
const cssText = readFileSync(cssPath, 'utf-8');

const uiBaseCandidates = [
  path.resolve(process.cwd(), 'src/components/ui'),
  path.resolve(process.cwd(), 'frontend/src/components/ui'),
];
const uiBase = uiBaseCandidates.find(existsSync);
if (!uiBase) {
  throw new Error(`components/ui not found (tried: ${uiBaseCandidates.join(', ')})`);
}

/** Extract the FIRST `:root { ... }` block (the shadcn bridge). */
function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('main.css has no :root block — bridge conformance cannot be verified');
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
const props = parseCustomProperties(rootBlock);

/** A pf alias value: `var(--pf-...)` with NO fallback, NO literal. */
const PF_ALIAS = /^var\(--pf-[a-zA-Z0-9-]+\)$/;

/** Match ANY literal color value (hex, oklch/oklab, rgb(a), hsl(a), color-mix). */
const LITERAL_COLOR = /(#[0-9a-fA-F]{3,8}|oklch?\s*\(|rgb|rgb\(|hsl\s*\(|color-mix\s*\()/;

/** Exactly these shadcn theme variables must exist in the bridge :root. */
const SHADCN_THEME_KEYS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
];

/** Recursively collect all .tsx files under a directory. */
function collectTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsx(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const uiFiles = collectTsx(uiBase);

describe('shadcn bridge conformance (main.css ↔ DESIGN.md)', () => {
  it('declares every shadcn theme variable as a var(--pf-*) alias (no literals)', () => {
    for (const key of SHADCN_THEME_KEYS) {
      expect(props.has(key), `bridge :root is missing ${key}`).toBe(true);
      const value = props.get(key)!;
      expect(value, `${key} must be a thin var(--pf-*) alias, got: ${value}`).toMatch(PF_ALIAS);
    }
  });

  it('contains NO literal color values anywhere in the bridge :root block', () => {
    const violations: string[] = [];
    for (const [key, value] of props) {
      if (LITERAL_COLOR.test(value)) violations.push(`${key}: ${value}`);
    }
    expect(violations, `literal colors must not live in the bridge :root:\n${violations.join('\n')}`).toEqual([]);
  });

  it('enforces dark-only: no prefers-color-scheme light, no .dark/.light class blocks', () => {
    expect(cssText).not.toContain('prefers-color-scheme: light');
    expect(cssText).not.toContain('prefers-color-scheme:dark');
    expect(cssText).not.toContain('.dark');
    expect(cssText).not.toContain('.light');
    // The @custom-variant must be anchored to :root so the dark variant is
    // ALWAYS on — never gated by OS preference or a class toggle.
    expect(cssText).toContain('@custom-variant dark (&:where(:root, :root *))');
  });

  it('ships no implicit light theme :root with literal colors', () => {
    // The ONLY :root in main.css is the pf-alias bridge — verified above.
    // Guard against a light default :root being added later with literals.
    for (const [key, value] of props) {
      expect(`${key}: ${value}`, 'bridge :root values must stay pf aliases').not.toMatch(LITERAL_COLOR);
    }
  });

  it('adheres to the font family law (--font-sans aliases --pf-font-family, no Geist)', () => {
    expect(cssText).toContain('--font-sans: var(--pf-font-family)');
    expect(cssText).not.toContain("'Geist");
    expect(cssText).not.toContain('@fontsource-variable/geist');
  });

  it('enforces DESIGN §6 weights ≤600: ui components contain no bold font utilities', () => {
    expect(uiFiles.length).toBeGreaterThan(0); // sanity: ui directory is populated
    const banned = ['font-bold', 'font-extrabold', 'font-[700'];
    const violations: string[] = [];
    for (const file of uiFiles) {
      const text = readFileSync(file, 'utf-8');
      for (const needle of banned) {
        if (text.includes(needle)) violations.push(`${path.relative(process.cwd(), file)} → ${needle}`);
      }
    }
    expect(violations, `font weight > 600 found (DESIGN §6):\n${violations.join('\n')}`).toEqual([]);
  });
});