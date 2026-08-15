/**
 * PineFramework — Motion tokens (D2/D3).
 *
 * Single source of truth for the motion system, mirrored by the `@theme inline`
 * block in `frontend/src/main.css`. The CSS side generates the Tailwind
 * utilities this project consumes:
 *
 *   --transition-duration-fast/base/slow  →  duration-fast/base/slow
 *   --ease-enter/exit                     →  ease-enter/ease-exit
 *
 * Those utilities also set `--tw-duration` / `--tw-ease`, which tw-animate-css
 * (`animate-in` / `animate-out`) reads — so the same tokens drive both CSS
 * transitions and keyframe entrances/exits.
 *
 * EXACTLY 3 durations and 2 easings by design. Do not add more.
 */

export const motion = {
  durations: {
    /** Immediate feedback + exits. */
    fast: '150ms',
    /** Routine state change + entrances. */
    base: '200ms',
    /** Deliberate transitions. */
    slow: '250ms',
  },
  easings: {
    /** Confident arrival — decelerate. */
    enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** Quick dismiss — accelerate away. */
    exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  },
  /** Stagger sequencing constants (internal, not CSS duration tokens). */
  stagger: {
    /** Delay between consecutive children, ms. */
    stepMs: 40,
    /** Hard cap on the total per-child offset, ms. */
    maxOffsetMs: 100,
  },
} as const

export type MotionDuration = keyof typeof motion.durations
