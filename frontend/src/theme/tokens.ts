/**
 * PineFramework — Minimal chart-only tokens.
 *
 * All component styling uses shadcn/Tailwind classes.
 * This file exists ONLY to keep chart renderers and existing callers working.
 * Every value maps to a shadcn CSS variable — no hardcoded colors.
 */

export const tokens = {
  colors: {
    canvas: 'var(--color-background)',
    surface: {
      '0': 'var(--color-background)',
      '1': 'var(--color-card)',
      '2': 'var(--color-secondary)',
      '3': 'var(--color-muted)',
    },
    hairline: {
      soft: 'var(--color-border)',
      default: 'var(--color-border)',
      strong: 'var(--color-input)',
    },
    ink: {
      '1': 'var(--color-foreground)',
      '2': 'var(--color-muted-foreground)',
      '3': 'var(--color-muted-foreground)',
      default: 'var(--color-primary-foreground)',
      deep: 'var(--color-primary-foreground)',
    },
    steel: {
      icon: 'var(--color-muted-foreground)',
      placeholder: 'var(--color-muted-foreground)',
      muted: 'var(--color-muted-foreground)',
      disabled: 'var(--color-muted-foreground)',
    },
    brand: {
      blue: 'var(--color-primary)',
    },
    semantic: {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#eab308',
      info: 'var(--color-primary)',
      successBg: 'rgba(34, 197, 94, 0.12)',
      errorBg: 'rgba(239, 68, 68, 0.12)',
      warningBg: 'rgba(234, 179, 8, 0.12)',
      infoBg: 'rgba(var(--color-primary), 0.12)',
    },
  },

  chart: {
    grid: 'var(--color-border)',
    border: 'var(--color-border)',
  },

  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
  },

  motion: {
    fast: '150ms',
    base: '200ms',
    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  },
} as const;

/**
 * Flat CSS custom-property map for tests (token-mirror.test.ts).
 * Points at shadcn variables — the old `--pf-*` mirror test is obsolete,
 * but this export keeps the import from breaking.
 */
export const cssVars = {
  '--pf-canvas': 'var(--color-background)',
  '--pf-surface-1': 'var(--color-card)',
  '--pf-surface-2': 'var(--color-secondary)',
  '--pf-surface-3': 'var(--color-muted)',
  '--pf-hairline': 'var(--color-border)',
  '--pf-hairline-strong': 'var(--color-input)',
  '--pf-ink-1': 'var(--color-foreground)',
  '--pf-ink-2': 'var(--color-muted-foreground)',
  '--pf-ink': 'var(--color-primary-foreground)',
  '--pf-steel-muted': 'var(--color-muted-foreground)',
  '--pf-brand-blue': 'var(--color-primary)',
  '--pf-semantic-success': '#22c55e',
  '--pf-semantic-error': '#ef4444',
  '--pf-semantic-warning': '#eab308',
  '--pf-font-family': "'Inter', system-ui, sans-serif",
  '--pf-chart-grid': 'var(--color-border)',
  '--pf-chart-border': 'var(--color-border)',
  '--pf-motion-fast': '150ms',
  '--pf-motion-base': '200ms',
  '--pf-motion-ease': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
} satisfies Record<string, string>;
