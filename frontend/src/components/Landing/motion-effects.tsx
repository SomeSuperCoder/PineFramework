/* ------------------------------------------------------------------ */
/* Landing advanced motion — the DESIGN §7 extension.                  */
/*                                                                    */
/* Six effects, all derived from the motion LAW (theme/motion.ts):     */
/*   parallax · scroll-scrub reveals · magnetic CTA · 3D tilt ·        */
/*   whileHover glass · hologram foil.                                 */
/*                                                                    */
/* Hard clamps from DESIGN §7 (limits, not tokens): magnetic ±4px,     */
/* tilt ≤6°, foil opacity ≤0.15. Springs are tuned to feel like the    */
/* LAW durations (the ScrollHairline precedent) — no new motion tokens */
/* anywhere. Every effect collapses under prefers-reduced-motion; the  */
/* pointer-dependent ones also gate on @media (pointer: fine) (§8,§10).*/
/* ------------------------------------------------------------------ */

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { DUR_FAST, EASE_ENTER, glassHover } from './motion-variants';

/* ------------------------------------------------------------------ */
/* Clamps + spring tunes                                               */
/* ------------------------------------------------------------------ */

/** DESIGN §7 hard clamps — caps, never tuned. */
const MAGNETIC_CLAMP = 4; // px — magnetic pull cap
const MAX_TILT = 6; // deg — 3D tilt cap
const FOIL_OPACITY = 0.12; // ≤0.15 — foil sheen cap (§7/§12 restraint)
const FOIL_RADIUS = 240; // px — sheen pool size
/** Brand amber sheen — reads on BOTH dark glass and §13 light glass (never an invisible foil). */
const FOIL_COLOR = 'rgba(255,208,47,0.5)';

/** Spring tunes — each feels ≈ one LAW duration (ScrollHairline precedent). */
const SPRING_FAST = { stiffness: 220, damping: 24, mass: 0.4 }; // ≈ duration-fast (150ms)
const SPRING_BASE = { stiffness: 160, damping: 20, mass: 0.5 }; // ≈ duration-base (200ms)
const SPRING_SLOW = { stiffness: 120, damping: 24, mass: 0.3 }; // ≈ duration-slow (250ms)

/** True only on pointer-fine devices — touch gets static elements (§10). */
function usePointerFine(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return fine;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* ------------------------------------------------------------------ */
/* 1. Parallax — scroll-linked y-drift, spring-smoothed (§7).          */
/*    Hero uses a page-scroll window so the panel rests at y=0 on load;*/
/*    section panels track their own scroll (amplitude ±px around 0).  */
/* ------------------------------------------------------------------ */

export function ParallaxPanel({
  amplitude,
  pageRange,
  children,
  className,
}: {
  /** Drift amplitude in px — hero ±24, sections ±16 (DESIGN §7). */
  amplitude: number;
  /** Page-scroll window [start, end] — hero only, keeps load at rest. */
  pageRange?: [number, number];
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const scroll = pageRange
    ? useScroll()
    : useScroll({ target: ref, offset: ['start end', 'end start'] });
  const progress = useSpring(scroll.scrollYProgress, SPRING_SLOW);
  const y = useTransform(
    progress,
    pageRange ? [pageRange[0], pageRange[1]] : [0, 1],
    pageRange ? [0, -amplitude] : [amplitude, -amplitude],
  );

  if (reducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Scroll-scrub reveal — opacity/y scrubbed to scroll progress (§7).*/
/*    Renders at its final state under reduced motion (§8).            */
/* ------------------------------------------------------------------ */

export function ScrollScrubReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.25'] });
  const progress = useSpring(scrollYProgress, SPRING_SLOW);
  const opacity = useTransform(progress, [0, 1], [0, 1]);
  const y = useTransform(progress, [0, 1], [16, 0]);

  if (reducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ opacity, y }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Magnetic CTA — pointer pull clamped ±4px, spring release (§7).   */
/*    Gates: pointer:fine + full motion — touch/reduced = static (§8,§10). */
/* ------------------------------------------------------------------ */

export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion();
  const pointerFine = usePointerFine();
  const active = pointerFine && !reducedMotion;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING_FAST);
  const springY = useSpring(y, SPRING_FAST);

  const onMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(clamp(event.clientX - (rect.left + rect.width / 2), -MAGNETIC_CLAMP, MAGNETIC_CLAMP));
    y.set(clamp(event.clientY - (rect.top + rect.height / 2), -MAGNETIC_CLAMP, MAGNETIC_CLAMP));
  };

  const onMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (!active) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/* 4. 3D tilt — pointer-follow rotateX/rotateY ≤6°, preserve-3d (§7). */
/*    Gates: pointer:fine + full motion; release springs to 0.         */
/*    Optional foil sheen piggybacks the same pointer tracking (§7/§12).*/
/* ------------------------------------------------------------------ */

export function TiltCard({
  children,
  className,
  foil = false,
  ariaHidden = false,
}: {
  children: ReactNode;
  className?: string;
  /** Render the hologram foil overlay (§12 restraint — hero panel only). */
  foil?: boolean;
  /** Decorative demo panels stay out of the AT tree (DESIGN §10). */
  ariaHidden?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const pointerFine = usePointerFine();
  const active = pointerFine && !reducedMotion;
  const [hovering, setHovering] = useState(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, SPRING_BASE);
  const springY = useSpring(rotateY, SPRING_BASE);
  const foilX = useMotionValue(-FOIL_RADIUS);
  const foilY = useMotionValue(-FOIL_RADIUS);

  const onMouseMove = (event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    rotateY.set((px - 0.5) * 2 * MAX_TILT);
    rotateX.set(-(py - 0.5) * 2 * MAX_TILT);
    if (foil) {
      foilX.set(px * rect.width);
      foilY.set(py * rect.height);
    }
  };

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => {
    setHovering(false);
    rotateX.set(0);
    rotateY.set(0);
    if (foil) {
      foilX.set(-FOIL_RADIUS);
      foilY.set(-FOIL_RADIUS);
    }
  };

  return (
    <motion.div
      className={className}
      aria-hidden={ariaHidden || undefined}
      style={
        active
          ? {
              rotateX: springX,
              rotateY: springY,
              transformPerspective: 1000,
              transformStyle: 'preserve-3d',
            }
          : undefined
      }
      whileHover={glassHover}
      onMouseEnter={onMouseEnter}
      onMouseMove={active ? onMouseMove : undefined}
      onMouseLeave={active ? onMouseLeave : undefined}
    >
      {children}
      {foil && <FoilOverlay x={foilX} y={foilY} visible={active && hovering} />}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Hologram foil — pointer-following amber sheen, opacity ≤0.15     */
/*    (§7, §12 restraint). Hand-rolled with motion values — not the    */
/*    npm demo. pointer-events-none so the chart tooltips pass through. */
/* ------------------------------------------------------------------ */

function FoilOverlay({
  x,
  y,
  visible,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  visible: boolean;
}) {
  const springX = useSpring(x, SPRING_FAST);
  const springY = useSpring(y, SPRING_FAST);
  const background = useMotionTemplate`radial-gradient(${FOIL_RADIUS}px circle at ${springX}px ${springY}px, ${FOIL_COLOR}, transparent 70%)`;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-2xl"
      style={{ background }}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? FOIL_OPACITY : 0 }}
      transition={{ duration: DUR_FAST, ease: EASE_ENTER }}
    />
  );
}
