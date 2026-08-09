/**
 * PineFramework — Chart + color tokens.
 *
 * Component styling uses shadcn/Tailwind classes.
 * This file exists for chart renderers (canvas needs hardcoded hex)
 * and any caller that needs a raw color value.
 */

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
      info: '#4262ff',
      successBg: 'rgba(0, 180, 115, 0.12)',
      errorBg: 'rgba(255, 92, 92, 0.12)',
      warningBg: 'rgba(255, 176, 32, 0.12)',
      infoBg: 'rgba(66, 98, 255, 0.12)',
    },
  },

  chart: {
    grid: '#262636',
    border: '#35354a',
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
