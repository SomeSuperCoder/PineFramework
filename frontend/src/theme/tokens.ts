/**
 * PineFramework — Miro-Dark design tokens (SINGLE SOURCE OF TRUTH)
 *
 * LAW: `DESIGN.md` (project root) v1.1. Every value below is copied
 * verbatim from that document. Nothing here is invented; nothing here may be
 * edited without a spec change. The CSS mirror lives in `frontend/src/index.css`
 * (`:root` custom properties) and is enforced byte-equal to this file by
 * `frontend/src/__tests__/token-mirror.test.ts`.
 *
 * Naming: CSS custom properties are `--pf-*` kebab-case (final). This module
 * exposes them two ways:
 *   1. `tokens` — nested, typed, camelCase — for React inline styles & the
 *      chart canvas (W4). All values are strings, usable directly in
 *      React.CSSProperties.
 *   2. `cssVars` — flat `{ '--pf-*': value }` map — the exact contract the
 *      CSS `:root` mirror must declare. If a token is missing here, the mirror
 *      test fails.
 */

/** A single entry of the nested text scale (§6): weight size/line-height letter-spacing. */
export interface TypeSpec {
  /** Font size, e.g. `'48px'`. */
  size: string;
  /** Unitless line-height as written in the spec, e.g. `'1.15'`. */
  lineHeight: string;
  /** Font weight — the scale is capped at 600 (700+ is banned). */
  weight: 400 | 500 | 600;
  /** Letter-spacing, e.g. `'-1px'`, `'0'`, `'0.5px'`. */
  letterSpacing: string;
}

export type TypeName =
  | 'hero'
  | 'displayLg'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'subtitle'
  | 'bodyMd'
  | 'bodyMdMedium'
  | 'bodySm'
  | 'bodySmMedium'
  | 'caption'
  | 'captionBold'
  | 'micro'
  | 'microUppercase'
  | 'buttonMd'
  | 'stat';

/** The full Miro-Dark token contract. */
export interface Tokens {
  colors: {
    /** §1 Canvas — page background, chart canvas bg, input fill. */
    canvas: string;
    /** §2 Surfaces — raised layers, ordered lightest-up (0 = darkest). */
    surface: { '0': string; '1': string; '2': string; '3': string };
    /** §3 Hairlines — 1px separators; stronger = lighter on dark. */
    hairline: { soft: string; default: string; strong: string };
    /** §4 Ink — text ladder (dark inversion: 1 = brightest). */
    ink: {
      '1': string;
      '2': string;
      '3': string;
      /** Dark ink for text on bright fills (pastel cards, pills, badges). */
      default: string;
      deep: string;
    };
    /** §5 Steel — utility greys. */
    steel: { icon: string; placeholder: string; muted: string; disabled: string };
    /** §7 Accents — yellow (reserved), blue (actions/focus), pastels. */
    brand: {
      yellow: string;
      yellowHover: string;
      yellowActive: string;
      blue: string;
      blueHover: string;
      blueActive: string;
      coral: string;
      rose: string;
      teal: string;
    };
    /** §8 Pastel card tints — translucent fills, precomputed for ink AA. */
    pastel: { yellow: string; coral: string; rose: string; teal: string; violet: string };
    /** §9 Semantic — state colors (never accents). */
    semantic: {
      success: string;
      successHover: string;
      error: string;
      errorHover: string;
      warning: string;
      warningHover: string;
      info: string;
      successBg: string;
      errorBg: string;
      warningBg: string;
      infoBg: string;
    };
  };
  /** §14 Chart palette — canvas consumes identical tokens to the UI. */
  chart: { grid: string; border: string; volume: string };
  /** §10 Radius — Miro scale; `full` is the pill signature. */
  radius: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
    xxxl: string;
    feature: string;
    full: string;
  };
  /** §11 Spacing — base 4px, primary increment 8px. */
  spacing: {
    xxs: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
    xxxl: string;
    sectionSm: string;
    section: string;
    sectionLg: string;
    hero: string;
  };
  /** §12 Elevation — flat first; shadows reserved for floating layers. */
  elevation: {
    shadow0: string;
    shadow1: string;
    shadow2: string;
    shadow3: string;
    shadow4: string;
    scrim: string;
    focusRing: string;
  };
  /** §13 Motion — quiet, fast, functional. */
  motion: { fast: string; base: string; ease: string };
  /** §6 Type system. */
  typography: {
    /** Official system stack — the only family allowed in UI or charts. */
    fontFamily: string;
    /** Weight scale (capped at 600). */
    weights: { normal: 400; medium: 500; semibold: 600 };
    /** The nested text scale. */
    type: Record<TypeName, TypeSpec>;
  };
  /**
   * Component recipe constants (§15/§16) — fixed measurements the spec pins
   * but that have no `--pf-*` name. TS-only helpers for React inline styles;
   * intentionally NOT mirrored to CSS (no spec token name → no CSS property).
   */
  recipes: {
    /** §15.1 Button — min click height. */
    buttonHeight: string;
    /** §15.1 Button compact — min click height. */
    buttonHeightCompact: string;
    /** §15.1 Button padding. */
    buttonPadding: string;
    /** §15.1 Button compact padding. */
    buttonPaddingCompact: string;
    /** §15 intro — minimum click target for any control. */
    controlMinHeight: string;
    /** §15.3 Input — fixed height. */
    inputHeight: string;
    /** §15.3 Input padding. */
    inputPadding: string;
    /** §16 TopBar height. */
    topBarHeight: string;
    /** §16 Sidebar collapsed width. */
    sidebarCollapsedWidth: string;
    /** §16 Sidebar expanded width. */
    sidebarExpandedWidth: string;
    /** §15.5 Tab track padding. */
    tabTrackPadding: string;
    /** §15.5 Tab gap. */
    tabGap: string;
    /** §15.5 Kbd badge padding. */
    kbdPadding: string;
    /** §15.8 Badge padding. */
    badgePadding: string;
    /** §15.8 StatusDot size. */
    statusDotSize: string;
    /** §15.7 ProgressBar track height. */
    progressTrackHeight: string;
    /** §15.7 ProgressBar thin track height. */
    progressTrackHeightThin: string;
    /** §15.4 Modal motion offset. */
    modalMotionOffset: string;
  };
}

/** Serialize a type spec to its CSS custom-property value: `weight size/line-height letter-spacing`. */
function typeValue(t: TypeSpec): string {
  return `${t.weight} ${t.size}/${t.lineHeight} ${t.letterSpacing}`;
}

export const tokens = {
  colors: {
    // §1 Canvas
    canvas: '#0d0d18',
    // §2 Surfaces
    surface: {
      '0': '#0d0d18',
      '1': '#12121f',
      '2': '#171725',
      '3': '#1e1e2e',
    },
    // §3 Hairlines
    hairline: {
      soft: '#1a1a27',
      default: '#262636',
      strong: '#35354a',
    },
    // §4 Ink
    ink: {
      '1': '#ededf5',
      '2': '#c2c2d0',
      '3': '#8f8fa3',
      default: '#1c1c1e',
      deep: '#050038',
    },
    // §5 Steel
    steel: {
      icon: '#9a9aad',
      placeholder: '#7a7a90',
      muted: '#71718a',
      disabled: '#5a5a70',
    },
    // §7 Accents
    brand: {
      yellow: '#ffd02f',
      yellowHover: '#fcb900',
      yellowActive: '#d49c00',
      blue: '#4262ff',
      blueHover: '#5b76fe',
      blueActive: '#2a41b6',
      coral: '#ff9999',
      rose: '#ffd8f4',
      teal: '#0fbcb0',
    },
    // §8 Pastel tints
    pastel: {
      yellow: 'rgba(255, 208, 47, 0.35)',
      coral: 'rgba(255, 153, 153, 0.50)',
      rose: 'rgba(255, 216, 244, 0.32)',
      teal: 'rgba(195, 250, 245, 0.30)',
      violet: 'rgba(245, 243, 255, 0.26)',
    },
    // §9 Semantic
    semantic: {
      success: '#00b473',
      successHover: '#00cc84',
      error: '#ff5c5c',
      errorHover: '#ff7373',
      warning: '#ffb020',
      warningHover: '#ffc24d',
      info: '#5b76fe',
      successBg: 'rgba(0, 180, 115, 0.12)',
      errorBg: 'rgba(255, 92, 92, 0.12)',
      warningBg: 'rgba(255, 176, 32, 0.12)',
      infoBg: 'rgba(91, 118, 254, 0.12)',
    },
  },

  // §14 Chart palette (canvas contract; consumed by W4 chart)
  chart: {
    grid: '#232338',
    border: '#2e2e42',
    volume: 'rgba(194, 194, 208, 0.18)',
  },

  // §10 Radius
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    xxl: '20px',
    xxxl: '28px',
    feature: '32px',
    full: '9999px',
  },

  // §11 Spacing
  spacing: {
    xxs: '4px',
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '20px',
    xl: '24px',
    xxl: '32px',
    xxxl: '40px',
    sectionSm: '48px',
    section: '64px',
    sectionLg: '96px',
    hero: '120px',
  },

  // §12 Elevation
  elevation: {
    shadow0: 'none',
    shadow1: '0 1px 2px rgba(0, 0, 0, 0.24)',
    shadow2: '0 4px 12px rgba(0, 0, 0, 0.32)',
    shadow3: '0 12px 32px rgba(0, 0, 0, 0.44)',
    shadow4: '0 16px 48px rgba(0, 0, 0, 0.52)',
    scrim: 'rgba(0, 0, 0, 0.60)',
    focusRing: '0 0 0 2px var(--pf-canvas), 0 0 0 4px var(--pf-brand-blue)',
  },

  // §13 Motion
  motion: {
    fast: '150ms',
    base: '200ms',
    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  },

  // §6 Type system
  typography: {
    fontFamily: "-apple-system, 'Segoe UI', Roboto, Inter, sans-serif",
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
    },
    type: {
      hero: { size: '80px', lineHeight: '1.05', weight: 500, letterSpacing: '-2px' },
      displayLg: { size: '60px', lineHeight: '1.10', weight: 500, letterSpacing: '-1.5px' },
      h1: { size: '48px', lineHeight: '1.15', weight: 500, letterSpacing: '-1px' },
      h2: { size: '36px', lineHeight: '1.20', weight: 500, letterSpacing: '-0.5px' },
      h3: { size: '28px', lineHeight: '1.25', weight: 500, letterSpacing: '0' },
      h4: { size: '22px', lineHeight: '1.30', weight: 500, letterSpacing: '0' },
      h5: { size: '18px', lineHeight: '1.40', weight: 500, letterSpacing: '0' },
      subtitle: { size: '18px', lineHeight: '1.50', weight: 400, letterSpacing: '0' },
      bodyMd: { size: '16px', lineHeight: '1.50', weight: 400, letterSpacing: '0' },
      bodyMdMedium: { size: '16px', lineHeight: '1.50', weight: 500, letterSpacing: '0' },
      bodySm: { size: '14px', lineHeight: '1.50', weight: 400, letterSpacing: '0' },
      bodySmMedium: { size: '14px', lineHeight: '1.50', weight: 500, letterSpacing: '0' },
      caption: { size: '13px', lineHeight: '1.40', weight: 400, letterSpacing: '0' },
      captionBold: { size: '13px', lineHeight: '1.40', weight: 600, letterSpacing: '0' },
      micro: { size: '12px', lineHeight: '1.40', weight: 500, letterSpacing: '0' },
      microUppercase: { size: '11px', lineHeight: '1.40', weight: 600, letterSpacing: '0.5px' },
      buttonMd: { size: '14px', lineHeight: '1.30', weight: 500, letterSpacing: '0' },
      stat: { size: '64px', lineHeight: '1.10', weight: 500, letterSpacing: '-1.5px' },
    },
  },

  // §15/§16 Component recipe constants (TS-only, spec-pinned measurements)
  recipes: {
    buttonHeight: '44px',
    buttonHeightCompact: '40px',
    buttonPadding: '12px 24px',
    buttonPaddingCompact: '10px 20px',
    controlMinHeight: '40px',
    inputHeight: '44px',
    inputPadding: '12px 16px',
    topBarHeight: '48px',
    sidebarCollapsedWidth: '64px',
    sidebarExpandedWidth: '220px',
    tabTrackPadding: '4px',
    tabGap: '2px',
    kbdPadding: '2px 6px',
    badgePadding: '4px 10px',
    statusDotSize: '10px',
    progressTrackHeight: '6px',
    progressTrackHeightThin: '4px',
    modalMotionOffset: 'translateY(4px)',
  },
} as const satisfies Tokens;

/**
 * Flat `--pf-*` → value map. This is the EXACT contract `frontend/src/index.css`
 * `:root` must mirror. The mirror test iterates this map against the parsed CSS.
 */
export const cssVars = {
  // §1 Canvas
  '--pf-canvas': tokens.colors.canvas,

  // §2 Surfaces
  '--pf-surface-0': tokens.colors.surface['0'],
  '--pf-surface-1': tokens.colors.surface['1'],
  '--pf-surface-2': tokens.colors.surface['2'],
  '--pf-surface-3': tokens.colors.surface['3'],

  // §3 Hairlines
  '--pf-hairline-soft': tokens.colors.hairline.soft,
  '--pf-hairline': tokens.colors.hairline.default,
  '--pf-hairline-strong': tokens.colors.hairline.strong,

  // §4 Ink
  '--pf-ink-1': tokens.colors.ink['1'],
  '--pf-ink-2': tokens.colors.ink['2'],
  '--pf-ink-3': tokens.colors.ink['3'],
  '--pf-ink': tokens.colors.ink.default,
  '--pf-ink-deep': tokens.colors.ink.deep,

  // §5 Steel
  '--pf-steel-icon': tokens.colors.steel.icon,
  '--pf-steel-placeholder': tokens.colors.steel.placeholder,
  '--pf-steel-muted': tokens.colors.steel.muted,
  '--pf-steel-disabled': tokens.colors.steel.disabled,

  // §6 Type — family + full nested scale
  '--pf-font-family': tokens.typography.fontFamily,
  '--pf-type-hero': typeValue(tokens.typography.type.hero),
  '--pf-type-display-lg': typeValue(tokens.typography.type.displayLg),
  '--pf-type-h1': typeValue(tokens.typography.type.h1),
  '--pf-type-h2': typeValue(tokens.typography.type.h2),
  '--pf-type-h3': typeValue(tokens.typography.type.h3),
  '--pf-type-h4': typeValue(tokens.typography.type.h4),
  '--pf-type-h5': typeValue(tokens.typography.type.h5),
  '--pf-type-subtitle': typeValue(tokens.typography.type.subtitle),
  '--pf-type-body-md': typeValue(tokens.typography.type.bodyMd),
  '--pf-type-body-md-medium': typeValue(tokens.typography.type.bodyMdMedium),
  '--pf-type-body-sm': typeValue(tokens.typography.type.bodySm),
  '--pf-type-body-sm-medium': typeValue(tokens.typography.type.bodySmMedium),
  '--pf-type-caption': typeValue(tokens.typography.type.caption),
  '--pf-type-caption-bold': typeValue(tokens.typography.type.captionBold),
  '--pf-type-micro': typeValue(tokens.typography.type.micro),
  '--pf-type-micro-uppercase': typeValue(tokens.typography.type.microUppercase),
  '--pf-type-button-md': typeValue(tokens.typography.type.buttonMd),
  '--pf-type-stat': typeValue(tokens.typography.type.stat),

  // §7 Accents
  '--pf-brand-yellow': tokens.colors.brand.yellow,
  '--pf-brand-yellow-hover': tokens.colors.brand.yellowHover,
  '--pf-brand-yellow-active': tokens.colors.brand.yellowActive,
  '--pf-brand-blue': tokens.colors.brand.blue,
  '--pf-brand-blue-hover': tokens.colors.brand.blueHover,
  '--pf-brand-blue-active': tokens.colors.brand.blueActive,
  '--pf-brand-coral': tokens.colors.brand.coral,
  '--pf-brand-rose': tokens.colors.brand.rose,
  '--pf-brand-teal': tokens.colors.brand.teal,

  // §8 Pastel tints
  '--pf-pastel-yellow': tokens.colors.pastel.yellow,
  '--pf-pastel-coral': tokens.colors.pastel.coral,
  '--pf-pastel-rose': tokens.colors.pastel.rose,
  '--pf-pastel-teal': tokens.colors.pastel.teal,
  '--pf-pastel-violet': tokens.colors.pastel.violet,

  // §9 Semantic
  '--pf-semantic-success': tokens.colors.semantic.success,
  '--pf-semantic-success-hover': tokens.colors.semantic.successHover,
  '--pf-semantic-error': tokens.colors.semantic.error,
  '--pf-semantic-error-hover': tokens.colors.semantic.errorHover,
  '--pf-semantic-warning': tokens.colors.semantic.warning,
  '--pf-semantic-warning-hover': tokens.colors.semantic.warningHover,
  '--pf-semantic-info': tokens.colors.semantic.info,
  '--pf-semantic-success-bg': tokens.colors.semantic.successBg,
  '--pf-semantic-error-bg': tokens.colors.semantic.errorBg,
  '--pf-semantic-warning-bg': tokens.colors.semantic.warningBg,
  '--pf-semantic-info-bg': tokens.colors.semantic.infoBg,

  // §10 Radius
  '--pf-radius-xs': tokens.radius.xs,
  '--pf-radius-sm': tokens.radius.sm,
  '--pf-radius-md': tokens.radius.md,
  '--pf-radius-lg': tokens.radius.lg,
  '--pf-radius-xl': tokens.radius.xl,
  '--pf-radius-xxl': tokens.radius.xxl,
  '--pf-radius-xxxl': tokens.radius.xxxl,
  '--pf-radius-feature': tokens.radius.feature,
  '--pf-radius-full': tokens.radius.full,

  // §11 Spacing
  '--pf-space-xxs': tokens.spacing.xxs,
  '--pf-space-xs': tokens.spacing.xs,
  '--pf-space-sm': tokens.spacing.sm,
  '--pf-space-md': tokens.spacing.md,
  '--pf-space-lg': tokens.spacing.lg,
  '--pf-space-xl': tokens.spacing.xl,
  '--pf-space-xxl': tokens.spacing.xxl,
  '--pf-space-xxxl': tokens.spacing.xxxl,
  '--pf-space-section-sm': tokens.spacing.sectionSm,
  '--pf-space-section': tokens.spacing.section,
  '--pf-space-section-lg': tokens.spacing.sectionLg,
  '--pf-space-hero': tokens.spacing.hero,

  // §12 Elevation
  '--pf-shadow-0': tokens.elevation.shadow0,
  '--pf-shadow-1': tokens.elevation.shadow1,
  '--pf-shadow-2': tokens.elevation.shadow2,
  '--pf-shadow-3': tokens.elevation.shadow3,
  '--pf-shadow-4': tokens.elevation.shadow4,
  '--pf-scrim': tokens.elevation.scrim,
  '--pf-focus-ring': tokens.elevation.focusRing,

  // §13 Motion
  '--pf-motion-fast': tokens.motion.fast,
  '--pf-motion-base': tokens.motion.base,
  '--pf-motion-ease': tokens.motion.ease,

  // §14 Chart palette
  '--pf-chart-grid': tokens.chart.grid,
  '--pf-chart-border': tokens.chart.border,
  '--pf-chart-volume': tokens.chart.volume,
} satisfies Record<string, string>;
