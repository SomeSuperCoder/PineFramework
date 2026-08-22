/**
 * Canvas 2D streak tunnel renderer for the Get Started hyperjump
 * (DESIGN.md §14.1 / §14.2). Pure renderer — the component owns the rAF loop
 * lifecycle; this class owns the streak field, sizing, and per-frame draw.
 *
 * Performance contract: draws in CSS pixels (caller applies devicePixelRatio
 * via setTransform), batched into a handful of Path2D fills per frame — no
 * per-streak state churn, no blur()/filter animation (§3 perf budget, Safari
 * correctness). Loop runs at 60fps only while the tunnel is on screen
 * (t < P6 end, 1500ms), then stops — the DOM flash covers the rest.
 */

/** Wall-clock phase boundaries (DESIGN §14.2) — every duration is a sum of the
 *  motion LAW tokens (150/200/250ms from theme/motion.ts). No new tokens. */
export const TUNNEL_TIMELINE = {
  /** P1 overlay rise + tunnel seed (200+200) — veil fully opaque, onReady. */
  p1End: 400,
  /** P2 warp acceleration (250). */
  p2End: 650,
  /** P3 peak velocity (250). */
  p3End: 900,
  /** P4 arrival deceleration (250) — tunnel off-screen at 1150. */
  p4End: 1150,
  /** P5 flash onset (200). */
  p5End: 1350,
  /** P6 flash peak hold (150) — the exit may begin at 1500. */
  p6End: 1500,
  /** P7 flash decay → reveal (250). */
  p7Ms: 250,
} as const;

/** Max chromatic-aberration offset in CSS px — 1.5–2px band, never >3 (§14.1). */
export const TUNNEL_CA_MAX_PX = 1.6;

/** Streak count — mid of the 48–64 spec band, tuned for the 60fps budget. */
export const TUNNEL_STREAK_COUNT = 52;

const EASE_IN = (u: number) => u * u * u;
const EASE_OUT = (u: number) => 1 - (1 - u) ** 3;

/** Deterministic PRNG (mulberry32) — the streak layout is stable across mounts
 *  (StrictMode-safe: the same field renders every time). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Streak {
  /** Radial angle around the vanish point. */
  angle: number;
  /** Per-streak length variance (±30%, organic — never mechanical). */
  lengthRatio: number;
  /** Tapered-quad width at the near end, 1–2px. */
  baseWidth: number;
  /** Gap from the vanish point (kept clear under the white-hot core). */
  rIn: number;
  /** Shimmer phase offset. */
  phase: number;
  /** Shimmer frequency, 0.2–0.6Hz — sub-Hz per streak, continuous, never ≥3Hz. */
  shimmerHz: number;
}

interface PhaseState {
  /** Streak reach factor: sprout → peak → relax → dissolve. */
  length: number;
  /** Chromatic-aberration intensity: 0 → 1 (P3) → 0. */
  ca: number;
  /** White-hot core: brightens through P2–P3, blooms wider in P4. */
  core: number;
  /** Field alpha: 1 until P5, then dissolves under the rising flash. */
  alpha: number;
}

/** Phase state at wall-clock time t (ms since tunnel start). */
export function tunnelPhase(t: number): PhaseState {
  if (t < TUNNEL_TIMELINE.p1End) {
    // P1 — streaks sprout from the vanish point; no CA; dim core.
    const u = t / TUNNEL_TIMELINE.p1End;
    return { length: 0.15 + 0.45 * EASE_OUT(u), ca: 0, core: 0.2 + 0.3 * u, alpha: 1 };
  }
  if (t < TUNNEL_TIMELINE.p2End) {
    // P2 — accelerate to peak (EASE_ENTER: quick build, settle into cruise);
    // CA ramps 0→max; white core brightens.
    const u = (t - TUNNEL_TIMELINE.p1End) / (TUNNEL_TIMELINE.p2End - TUNNEL_TIMELINE.p1End);
    return { length: 0.6 + 0.4 * EASE_OUT(u), ca: EASE_OUT(u), core: 0.5 + 0.5 * u, alpha: 1 };
  }
  if (t < TUNNEL_TIMELINE.p3End) {
    // P3 — peak velocity sustained; CA holds at max; shimmer continuous.
    return { length: 1, ca: 1, core: 1, alpha: 1 };
  }
  if (t < TUNNEL_TIMELINE.p4End) {
    // P4 — arrival deceleration (EASE_EXIT: hold near peak, then relax fast);
    // streaks slow, CA eases to 0, the white core blooms (flash foreshadow).
    const u = (t - TUNNEL_TIMELINE.p3End) / (TUNNEL_TIMELINE.p4End - TUNNEL_TIMELINE.p3End);
    return {
      length: 1 - 0.3 * EASE_IN(u),
      ca: 1 - EASE_IN(u),
      core: 1 + 0.6 * EASE_IN(u),
      alpha: 1,
    };
  }
  // P5–P6 — the tunnel dissolves under the rising white-gold flash.
  const u = Math.min(1, (t - TUNNEL_TIMELINE.p4End) / (TUNNEL_TIMELINE.p6End - TUNNEL_TIMELINE.p4End));
  return { length: 0.7 * (1 - EASE_IN(u)), ca: 0, core: 1.6, alpha: 1 - EASE_IN(u) };
}

type StreakPass = 'base' | 'ghost1' | 'ghost2' | 'warm' | 'cool';

function createStreaks(): Streak[] {
  const rand = mulberry32(0x5147);
  const streaks: Streak[] = [];
  for (let i = 0; i < TUNNEL_STREAK_COUNT; i++) {
    const baseAngle = (i / TUNNEL_STREAK_COUNT) * Math.PI * 2;
    streaks.push({
      angle: baseAngle + (rand() - 0.5) * 0.06, // ±~3.4° jitter
      lengthRatio: 0.7 + rand() * 0.6, // 0.7–1.3 (±30%)
      baseWidth: 1 + rand(), // 1–2px
      rIn: 10 + rand() * 8, // 10–18px gap under the core
      phase: rand() * Math.PI * 2,
      shimmerHz: 0.2 + rand() * 0.4,
    });
  }
  return streaks;
}

export class TunnelCanvas {
  private ctx: CanvasRenderingContext2D | null;
  private streaks: Streak[];
  private width = 0;
  private height = 0;
  private raf = 0;
  private startedAt = 0;
  private alive = true;
  private observer: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.streaks = createStreaks();
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      // No 2d context (jsdom / exotic embed) — the overlay's DOM timeline and
      // handshake still run; only the streak drawing is skipped.
      return;
    }
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  start(): void {
    if (!this.alive || !this.ctx || this.raf) return;
    this.startedAt = performance.now();
    const loop = (now: number) => {
      if (!this.alive) return;
      const t = now - this.startedAt;
      this.frame(t);
      // Stop the loop at the flash peak hold end — the tunnel is fully
      // dissolved and the DOM flash layers own the rest of the choreography.
      if (t < TUNNEL_TIMELINE.p6End) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('resize', this.resize);
  }

  /** Re-size the backing store to the canvas layout size × devicePixelRatio
   *  (capped at 2 for the frame budget). Drawing stays in CSS pixels. */
  private resize = () => {
    if (!this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private frame(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.width === 0 || this.height === 0) return;
    const { length, ca, core, alpha } = tunnelPhase(t);
    if (alpha <= 0.01) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const rMax = (Math.hypot(this.width, this.height) / 2) * 0.92;
    ctx.clearRect(0, 0, this.width, this.height);

    // Ghost after-images first (they read as trailing behind the streaks).
    this.drawStreaks(ctx, t, cx, cy, rMax, length, ca, 'ghost2', 0.15 * alpha);
    this.drawStreaks(ctx, t, cx, cy, rMax, length, ca, 'ghost1', 0.1 * alpha);
    // Chromatic split — cool (blue) −δ and warm (yellow) +δ, scaled by CA
    // intensity and proximity to the center (fastest perceived motion there).
    this.drawStreaks(ctx, t, cx, cy, rMax, length, ca, 'cool', 0.35 * ca * alpha);
    this.drawStreaks(ctx, t, cx, cy, rMax, length, ca, 'warm', 0.35 * ca * alpha);
    // Main streak field.
    this.drawStreaks(ctx, t, cx, cy, rMax, length, ca, 'base', 0.85 * alpha);

    // Brightness falloff toward the edges (in-canvas; complements the DOM
    // vignette — streaks read 90–100% at the core, 20–30% at the edges).
    const falloff = ctx.createRadialGradient(cx, cy, rMax * 0.25, cx, cy, rMax);
    falloff.addColorStop(0, 'rgba(12, 13, 15, 0)');
    falloff.addColorStop(1, 'rgba(12, 13, 15, 0.55)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = falloff;
    ctx.fillRect(0, 0, this.width, this.height);

    // White-hot core — white mixed into brand yellow, the seed of the flash.
    const coreR = 5 + 10 * Math.min(1, core) + (core > 1 ? (core - 1) * 18 : 0);
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    coreGrad.addColorStop(0.35, 'rgba(255, 224, 130, 0.7)');
    coreGrad.addColorStop(1, 'rgba(255, 224, 130, 0)');
    ctx.globalAlpha = (0.55 + 0.45 * Math.min(1, core)) * alpha;
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Draw one field pass as a single batched Path2D fill. */
  private drawStreaks(
    ctx: CanvasRenderingContext2D,
    t: number,
    cx: number,
    cy: number,
    rMax: number,
    length: number,
    ca: number,
    pass: StreakPass,
    groupAlpha: number,
  ): void {
    if (groupAlpha <= 0.01) return;
    const path = new Path2D();
    // Ghost trail length stretches with speed (acceleration feel), and the
    // shimmer amplitude peaks with speed (continuous, sub-Hz per streak).
    const trail = 1 - 0.3 * ca;
    const shimmerScale = 0.35 + 0.65 * ca;
    for (const s of this.streaks) {
      const shimmer = 1 + 0.045 * shimmerScale * Math.sin((2 * Math.PI * s.shimmerHz * t) / 1000 + s.phase);
      const rOut = Math.max(s.rIn + 4, rMax * s.lengthRatio * length * shimmer);
      let rA = s.rIn;
      let rB = rOut;
      if (pass === 'warm' || pass === 'cool') {
        const proximity = Math.max(0, 1 - rOut / rMax);
        const delta = TUNNEL_CA_MAX_PX * ca * proximity;
        const dir = pass === 'warm' ? 1 : -1;
        rA += delta * dir;
        rB += delta * dir;
      } else if (pass === 'ghost1' || pass === 'ghost2') {
        const frac = (pass === 'ghost1' ? 0.62 : 0.82) * trail;
        rB = Math.max(rA + 2, rOut * frac);
      }
      this.addQuad(path, cx, cy, s.angle, rA, rB, s.baseWidth, 0.5);
    }
    ctx.globalAlpha = groupAlpha;
    ctx.fillStyle = pass === 'cool' ? '#4262ff' : '#ffd02f';
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  /** Tapered quad from (rIn, wIn) to (rOut, wOut) along `angle` — the streak. */
  private addQuad(
    path: Path2D,
    cx: number,
    cy: number,
    angle: number,
    rIn: number,
    rOut: number,
    wIn: number,
    wOut: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = -sin;
    const ny = cos;
    const hwIn = wIn / 2;
    const hwOut = wOut / 2;
    path.moveTo(cx + cos * rIn + nx * hwIn, cy + sin * rIn + ny * hwIn);
    path.lineTo(cx + cos * rIn - nx * hwIn, cy + sin * rIn - ny * hwIn);
    path.lineTo(cx + cos * rOut - nx * hwOut, cy + sin * rOut - ny * hwOut);
    path.lineTo(cx + cos * rOut + nx * hwOut, cy + sin * rOut + ny * hwOut);
    path.closePath();
  }
}