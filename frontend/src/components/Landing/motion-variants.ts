import type { TargetAndTransition, Variants } from 'framer-motion';
import { motion } from '@/theme/motion';

/* ------------------------------------------------------------------ */
/* framer-motion values DERIVED from the motion LAW (theme/motion.ts) —
   never new tokens. DESIGN §7 maps every animation onto these.        */
/* ------------------------------------------------------------------ */

/** '150ms' → 0.15s. */
function msToSeconds(value: string): number {
  return parseFloat(value) / 1000;
}

/** 'cubic-bezier(0.16, 1, 0.3, 1)' → [0.16, 1, 0.3, 1]. */
function cubicBezierToEasing(value: string): [number, number, number, number] {
  const match = value.match(/cubic-bezier\(([^)]+)\)/);
  if (!match) throw new Error(`motion LAW easing must be a cubic-bezier: ${value}`);
  const [x1, y1, x2, y2] = match[1].split(',').map(Number);
  return [x1, y1, x2, y2];
}

/** LAW duration tokens → seconds (fast 150ms → 0.15s). */
export const DUR_FAST = msToSeconds(motion.durations.fast);
/** LAW duration tokens → seconds (base 200ms → 0.2s). */
export const DUR_BASE = msToSeconds(motion.durations.base);
/** LAW duration tokens → seconds (slow 250ms → 0.25s). */
export const DUR_SLOW = msToSeconds(motion.durations.slow);

/** LAW easing tokens — confident arrival, decelerate. */
export const EASE_ENTER = cubicBezierToEasing(motion.easings.enter);
/** LAW easing tokens — quick dismiss, accelerate away. */
export const EASE_EXIT = cubicBezierToEasing(motion.easings.exit);

/** Per-child entrance delay = min(stepMs × index, maxOffsetMs) — the LAW cap (DESIGN §7). */
export function staggerDelay(index: number): number {
  return Math.min(motion.stagger.stepMs * index, motion.stagger.maxOffsetMs) / 1000;
}

/** Shared viewport rule — reveal once when 20% is in view (DESIGN §7). */
export const viewportOnce = { once: true, amount: 0.2 };

/** Hero entrance — the one authored moment: fade + rise 24px, base + enter (DESIGN §2.2, §7). */
export function heroItem(delay: number): Variants {
  return {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { delay, duration: DUR_BASE, ease: EASE_ENTER } },
  };
}

/** Footer CTA entrance — scale up, not rise: slow + enter (DESIGN §7). */
export const ctaEntrance: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: { duration: DUR_SLOW, ease: EASE_ENTER } },
};

/** CTA press — hard shadow collapses, button seats flat: fast + exit (DESIGN §6, §7). */
export const pressTap: TargetAndTransition = {
  y: 0,
  boxShadow: '0px 0px 0px rgba(0,0,0,0)',
};

/** whileHover glass micro-upgrade — scale ~1.01, no lift, no toy physics:
 *  base + enter (DESIGN §7). The border/fill micro-shift rides the
 *  theme-remapped `--landing-hover-surface` via Tailwind classes (§6, §13). */
export const glassHover: TargetAndTransition = {
  scale: 1.01,
  transition: { duration: DUR_BASE, ease: EASE_ENTER },
};
