import { useEffect, useRef, useState } from 'react';
import { motion } from '../../theme/motion';
import { TunnelCanvas, TUNNEL_TIMELINE } from './tunnel-canvas';

export interface TunnelOverlayProps {
  /** True when the user prefers reduced motion — the tunnel/flash are skipped
   *  entirely, replaced by a plain quick cross-fade (DESIGN.md §14.5). */
  reducedMotion: boolean;
  /** True once the App has swapped the view behind the opaque cover and run
   *  its double-rAF paint guard — the overlay may now reveal (P7). */
  exiting: boolean;
  /** Emitted when the overlay has reached full opacity (P1 end, 400ms). The
   *  App performs the landing→app swap inside this callback, behind the cover. */
  onReady: () => void;
  /** Emitted when the overlay has reached opacity 0 (P7 end). The App unmounts
   *  the overlay and clears the transition state. */
  onExitComplete: () => void;
}

/* ------------------------------------------------------------------ */
/* Motion tokens — durations/easings mirror theme/motion.ts (SSOT).    */
/* The numeric ms values ARE the LAW tokens (150/200/250); DESIGN §14.2 */
/* mapped every phase to sums of these. No new tokens.                 */
/* ------------------------------------------------------------------ */
const DUR_FAST = motion.durations.fast; // 150ms
const DUR_BASE = motion.durations.base; // 200ms
const DUR_SLOW = motion.durations.slow; // 250ms
const EASE_ENTER = motion.easings.enter;
const EASE_EXIT = motion.easings.exit;
const FAST_MS = 150;
const BASE_MS = 200;
const SLOW_MS = 250;

/** §1 ground — the veil is the dark oklch ground, never pure black (§14 seam). */
const VEIL = 'oklch(0.145 0 0)';

/** §14.1 white-gold flash — tight white core over a wide gold halo. */
const WHITE_CORE =
  'radial-gradient(circle at 50% 50%, #ffffff 0%, rgba(255,255,255,0.95) 16%, rgba(255,255,255,0) 52%)';
const GOLD_HALO =
  'radial-gradient(circle at 50% 50%, #fff0b3 0%, #ffd02f 42%, rgba(255,208,47,0) 72%)';

/** Static radial dark vignette holding focus at the vanish point (§14.1).
 *  Heavier in light mode so the yellow streaks pop on the Day Session surface
 *  (§14.4: corners 60–70% vs 35–50%). */
const VIGNETTE_DARK =
  'radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(0,0,0,0.45) 100%)';
const VIGNETTE_LIGHT =
  'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.65) 100%)';

/* ------------------------------------------------------------------ */
/* Reduced motion — §14.5: plain quick cross-fade, no tunnel/flash.    */
/* 150ms in EASE_ENTER, 150ms out EASE_EXIT = 300ms total; the handshake */
/* callbacks are timeout-driven so they fire even under the global CSS  */
/* reduced-motion guard (which collapses transitions to 0.01ms).        */
/* ------------------------------------------------------------------ */
function ReducedMotionOverlay({
  exiting,
  onReady,
  onExitComplete,
}: Pick<TunnelOverlayProps, 'exiting' | 'onReady' | 'onExitComplete'>) {
  const [visible, setVisible] = useState(false);
  const readyRef = useRef(false);
  const doneRef = useRef(false);

  // Enter: mount transparent, become opaque on the next frame so the browser
  // paints the initial state before the fade begins (no first-frame pop).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Ready: once opaque, tell the App it can swap the view behind the cover.
  useEffect(() => {
    if (!visible || readyRef.current) return;
    readyRef.current = true;
    const t = window.setTimeout(onReady, FAST_MS);
    return () => window.clearTimeout(t);
  }, [visible, onReady]);

  // Exit: when the App flips `exiting`, fade to 0 and report completion.
  useEffect(() => {
    if (!exiting || doneRef.current) return;
    doneRef.current = true;
    setVisible(false);
    const t = window.setTimeout(onExitComplete, FAST_MS);
    return () => window.clearTimeout(t);
  }, [exiting, onExitComplete]);

  return (
    <div
      data-testid="tunnel-overlay"
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${DUR_FAST} ${exiting ? EASE_EXIT : EASE_ENTER}`,
        background: VEIL,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Full hyperjump — the 7-phase token-bound choreography (§14.2).      */
/*                                                                    */
/* The overlay owns the animation; the App owns the state machine.    */
/* Handshake (unchanged from the placeholder):                        */
/*   P1 veil opaque → onReady → App swap + double-rAF paint guard →   */
/*   exiting → [peak hold ends, 1500ms] → P7 ONE motion → opacity 0 → */
/*   onExitComplete → App unmounts.                                   */
/* The flash's decay IS the exit — the root fades to 0 while the white */
/* core decays first (150ms) and the gold halo follows (250ms), so the */
/* app's first painted pixels emerge under the gold tail: continuous.  */
/* ------------------------------------------------------------------ */
function HyperjumpOverlay({
  exiting,
  onReady,
  onExitComplete,
}: Pick<TunnelOverlayProps, 'exiting' | 'onReady' | 'onExitComplete'>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLDivElement>(null);
  const whiteRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(0);
  const readySentRef = useRef(false);
  const exitStartedRef = useRef(false);
  const exitCompleteSentRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  // §14.4: read the landing theme once at mount (the landing is still mounted
  // while the overlay is in 'tunnel'; after the swap it is gone, so we must
  // capture it now). Missing attribute → dark treatment (safe default).
  const lightModeRef = useRef(
    typeof document !== 'undefined' &&
      document
        .querySelector('[data-landing-theme]')
        ?.getAttribute('data-landing-theme') === 'light',
  );
  const light = lightModeRef.current;

  const schedule = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  // Mount: veil rise (P1) + onReady at full opacity + flash onset (P5).
  useEffect(() => {
    startedRef.current = performance.now();

    // P1 — veil 0→1 over 400ms (200+200) EASE_ENTER over the still-visible
    // landing: it dims under the veil, never cuts to black.
    const raf = requestAnimationFrame(() => {
      const veil = veilRef.current;
      if (!veil) return;
      veil.style.transition = `opacity ${BASE_MS * 2}ms ${EASE_ENTER}`;
      veil.style.opacity = '1';
    });

    // onReady at P1 end — the cover is fully opaque; the App swaps the view
    // behind it and runs its double-rAF paint guard.
    schedule(() => {
      if (!readySentRef.current) {
        readySentRef.current = true;
        onReady();
      }
    }, BASE_MS * 2);

    // P5 (1150) — flash onset: the white-gold bloom ramps 0→1 over 200ms,
    // reaching peak at P6 (1350); the canvas dissolves in-canvas (alpha→0).
    schedule(() => {
      const gold = goldRef.current;
      const white = whiteRef.current;
      if (gold) {
        gold.style.transition = `opacity ${DUR_BASE} ${EASE_ENTER}`;
        gold.style.opacity = '1';
      }
      if (white) {
        white.style.transition = `opacity ${DUR_BASE} ${EASE_ENTER}`;
        white.style.opacity = '1';
      }
    }, TUNNEL_TIMELINE.p4End);

    return () => {
      cancelAnimationFrame(raf);
      for (const id of timeoutsRef.current) window.clearTimeout(id);
      timeoutsRef.current = [];
    };
  }, [onReady]);

  // Canvas tunnel — continuous 60fps streak render from mount until the flash
  // peak hold (the renderer stops its own loop at P6 end).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tunnel = new TunnelCanvas(canvas);
    tunnel.start();
    return () => tunnel.destroy();
  }, []);

  // Exit (P7): gated on the App's `exiting` + the end of the flash peak hold.
  // If the App is slow, the overlay holds at the peak (the reveal defers — the
  // app never changes). When it fires, the flash decay and the overlay fade
  // are ONE motion: white core gone by ~150ms, gold + veil + root to 250ms.
  useEffect(() => {
    if (!exiting) return;
    const wait = Math.max(0, TUNNEL_TIMELINE.p6End - (performance.now() - startedRef.current));
    const id = schedule(() => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;

      const root = rootRef.current;
      if (root) {
        root.style.transition = `opacity ${DUR_SLOW} ${EASE_EXIT}`;
        root.style.opacity = '0';
      }
      const veil = veilRef.current;
      if (veil) {
        veil.style.transition = `opacity ${DUR_SLOW} ${EASE_EXIT}`;
        veil.style.opacity = '0';
      }
      const gold = goldRef.current;
      if (gold) {
        gold.style.transition = `opacity ${DUR_SLOW} ${EASE_EXIT}`;
        gold.style.opacity = '0';
      }
      // White center decays first (first ~150ms of P7); the gold tail follows.
      const white = whiteRef.current;
      if (white) {
        white.style.transition = `opacity ${DUR_FAST} ${EASE_EXIT}`;
        white.style.opacity = '0';
      }

      // onExitComplete at opacity 0 (P7 end) — the App unmounts only here.
      schedule(() => {
        if (exitCompleteSentRef.current) return;
        exitCompleteSentRef.current = true;
        onExitComplete();
      }, SLOW_MS);
    }, wait);
    return () => window.clearTimeout(id);
  }, [exiting, onExitComplete]);

  return (
    <div
      ref={rootRef}
      data-testid="tunnel-overlay"
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ opacity: 1, willChange: 'opacity' }}
    >
      {/* Layer 1 — dark veil (§14.3). Fades in over the landing during P1. */}
      <div
        ref={veilRef}
        className="absolute inset-0"
        style={{ background: VEIL, opacity: 0, willChange: 'opacity' }}
      />
      {/* Layer 2 — Canvas 2D streak tunnel (the renderer draws above the veil). */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {/* Layer 3 — static radial vignette; heavier in Day Session (§14.4). */}
      <div
        className="absolute inset-0"
        style={{ background: light ? VIGNETTE_LIGHT : VIGNETTE_DARK }}
      />
      {/* Layer 4 — white-gold flash bloom (P5 onset → P6 peak → P7 decay). */}
      <div
        ref={goldRef}
        className="absolute inset-0"
        style={{ background: GOLD_HALO, opacity: 0, willChange: 'opacity' }}
      />
      <div
        ref={whiteRef}
        className="absolute inset-0"
        style={{ background: WHITE_CORE, opacity: 0, willChange: 'opacity' }}
      />
    </div>
  );
}

/**
 * Get Started hyperjump overlay (landing-v3 plan, wave 2).
 *
 * Full-screen cover mounted ABOVE the app (z-[100], above the header z-40).
 * Reports `onReady` once fully opaque (P1 end) and `onExitComplete` once fully
 * transparent (P7 end). The App swaps the view behind the opaque cover and
 * unmounts this overlay only at opacity 0 — the reveal is a mask-lift, never a
 * swap. Reduced motion collapses the jump to a plain 300ms cross-fade (§14.5).
 */
export function TunnelOverlay({
  reducedMotion,
  exiting,
  onReady,
  onExitComplete,
}: TunnelOverlayProps) {
  if (reducedMotion) {
    return <ReducedMotionOverlay exiting={exiting} onReady={onReady} onExitComplete={onExitComplete} />;
  }
  return <HyperjumpOverlay exiting={exiting} onReady={onReady} onExitComplete={onExitComplete} />;
}