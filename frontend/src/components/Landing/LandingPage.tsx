import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { PullCord } from 'pullcord';
import 'pullcord/pullcord.css';
import { JellyBlobMascot } from 'feral-blob';
import 'feral-blob/blob.css';
import logoUrl from '@/assets/logo.svg';
import {
  DUR_FAST,
  EASE_EXIT,
  ctaEntrance,
  glassHover,
  heroItem,
  pressTap,
  staggerDelay,
  viewportOnce,
} from './motion-variants';
import { Magnetic, ParallaxPanel, ScrollScrubReveal, TiltCard } from './motion-effects';
import { ScrollHairline } from './ScrollHairline';
import { BotBarChart, EquityAreaChart, HeroAreaChart } from './landing-charts';
import { useLandingTheme, type LandingTheme } from './use-landing-theme';
import './landing-theme.css';

export interface LandingPageProps {
  /** Persists entry and switches to the main panel (T1). */
  onGetStarted: () => void;
}

/* ------------------------------------------------------------------ */
/* Class recipes — Feral Glass + neobrutalist language (DESIGN §2–6).
   Surfaces reference the scoped CSS vars in landing-theme.css so the
   §13 light variant remaps tokens — no duplicated class strings.       */
/* ------------------------------------------------------------------ */

/** whileHover glass micro-upgrade — theme-remapped border/fill shift
    (§6, §7). The scale 1.01 rides framer's glassHover on the element. */
const GLASS_HOVER =
  ' transition-colors duration-base ease-enter hover:bg-(--landing-hover-surface) ' +
  'hover:border-white/20 data-[landing-theme=light]:hover:border-black/10';

const GLASS_STANDARD =
  'rounded-2xl border border-[color:var(--landing-glass-border)] ' +
  'bg-(--landing-glass-fill) backdrop-blur-[var(--landing-blur-content)]' +
  GLASS_HOVER;

const GLASS_ELEVATED =
  'rounded-2xl border border-[color:var(--landing-elevated-border)] ' +
  'bg-(--landing-elevated-fill) backdrop-blur-[var(--landing-blur-elevated)] ' +
  'shadow-[var(--landing-elevated-shadow)]' +
  GLASS_HOVER;

/** Flat chip / tile / bubble — no blur, sits on the wash (DESIGN §3). */
const CHIP_FLAT =
  'rounded-lg border border-[color:var(--landing-chip-border)] bg-(--landing-chip-fill)';

const DEMO_TAG =
  'text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--landing-meta)]';

/** The single raw-yellow artifact — hard offset shadow that collapses on press. */
const GET_STARTED =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#ffd02f] ' +
  'text-sm font-semibold text-[#1c1c1e] transition-[transform,box-shadow,background-color] ' +
  'duration-fast ease-enter shadow-[var(--landing-cta-shadow)] ' +
  'hover:-translate-y-0.5 hover:bg-[#fcb900] hover:shadow-[var(--landing-cta-shadow-hover)] ' +
  'active:translate-y-0 active:shadow-[var(--landing-cta-shadow-active)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Raw capability chip — neobrutalist marker, no blur (DESIGN §2.3). */
const RAW_CHIP =
  'inline-flex items-center gap-2 rounded-md border border-[color:var(--landing-chip-strong-border)] ' +
  'bg-(--landing-chip-strong-fill) px-3 py-1.5 text-[11px] font-semibold uppercase ' +
  'tracking-[0.14em] text-foreground/80';

const CONTAINER = 'mx-auto w-full max-w-6xl px-6 lg:px-8';

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function GetStartedButton({
  onGetStarted,
  sizeClass,
  children = 'Get Started',
}: {
  onGetStarted: () => void;
  sizeClass: string;
  children?: React.ReactNode;
}) {
  return (
    <Magnetic className="inline-flex">
      <motion.button
        type="button"
        onClick={onGetStarted}
        whileTap={pressTap}
        transition={{ duration: DUR_FAST, ease: EASE_EXIT }}
        className={`${GET_STARTED} ${sizeClass}`}
      >
        {children}
      </motion.button>
    </Magnetic>
  );
}

function DemoTag({ className = '' }: { className?: string }) {
  return <span className={`${DEMO_TAG} ${className}`}>Synthetic demo</span>;
}

/** Top highlight for elevated panels only (DESIGN §3). */
function InnerHighlight() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[40%] rounded-t-2xl bg-[image:var(--landing-inner-highlight)]"
    />
  );
}

function RawChip({ children }: { children: React.ReactNode }) {
  return (
    <span className={RAW_CHIP}>
      <span aria-hidden="true" className="inline-block size-1.5 rounded-[2px] bg-[#ffd02f]" />
      {children}
    </span>
  );
}

function StatTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`${CHIP_FLAT} px-3 py-2`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--landing-meta)]">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${
          emphasis ? 'text-[color:var(--landing-accent-text)]' : 'text-foreground'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page sections                                                       */
/* ------------------------------------------------------------------ */

function LandingHeader({
  onGetStarted,
  theme,
  onToggleTheme,
  reducedMotion,
}: {
  onGetStarted: () => void;
  theme: LandingTheme;
  onToggleTheme: () => void;
  reducedMotion: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--landing-hairline)] bg-background/60 backdrop-blur-xl">
      <div className={`flex h-14 items-center justify-between ${CONTAINER}`}>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" width={24} height={24} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-[color:var(--landing-accent-text)]">
            Pine Framework
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="landing-pullcord">
            <PullCord
              onPull={onToggleTheme}
              pulled={theme === 'light'}
              ariaLabel="Toggle theme"
              noEntrance={reducedMotion}
            />
          </div>
          <GetStartedButton onGetStarted={onGetStarted} sizeClass="h-10 px-4" />
        </div>
      </div>
    </header>
  );
}

function HeroDemoPanel() {
  return (
    <TiltCard foil ariaHidden className={`relative ${GLASS_ELEVATED} p-5`}>
      <InnerHighlight />
      <DemoTag className="absolute right-4 top-4" />
      <div className="mt-6">
        <HeroAreaChart />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Backtest P&L" value="+12.4%" emphasis />
        <StatTile label="Win rate" value="61%" />
        <StatTile label="Max drawdown" value="−4.2%" />
      </div>
    </TiltCard>
  );
}

function LandingHero({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section aria-labelledby="landing-title" className="min-h-[calc(100svh-3.5rem)]">
      <div
        className={`grid grid-cols-1 items-center gap-12 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28 ${CONTAINER}`}
      >
        <div>
          <motion.h1
            id="landing-title"
            tabIndex={-1}
            variants={heroItem(staggerDelay(0))}
            initial="hidden"
            animate="visible"
            className="text-5xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl focus:outline-none"
          >
            Write it in PineScript. Trade it live.
          </motion.h1>
          <motion.p
            variants={heroItem(staggerDelay(1))}
            initial="hidden"
            animate="visible"
            className="mt-6 max-w-xl text-lg text-foreground/70"
          >
            Backtest PineScript strategies, run them on a live bot, and steer them from Telegram —
            all inside one terminal-grade panel.
          </motion.p>
          <motion.div
            variants={heroItem(staggerDelay(2))}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <GetStartedButton onGetStarted={onGetStarted} sizeClass="h-12 px-6" />
            <a
              href="#backtest"
              className="rounded text-sm font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70"
            >
              See how it works
            </a>
          </motion.div>
        </div>
        <motion.div variants={heroItem(staggerDelay(3))} initial="hidden" animate="visible">
          <ParallaxPanel amplitude={24} pageRange={[0, 0.15]}>
            <HeroDemoPanel />
          </ParallaxPanel>
        </motion.div>
      </div>
    </section>
  );
}

function CapabilityStrip() {
  return (
    <ScrollScrubReveal className={`flex flex-wrap items-center gap-3 py-4 ${CONTAINER}`}>
      <RawChip>PineScript</RawChip>
      <RawChip>Backtest</RawChip>
      <RawChip>Live Bot</RawChip>
      <RawChip>Telegram</RawChip>
    </ScrollScrubReveal>
  );
}

function BacktestSection() {
  return (
    <section
      id="backtest"
      aria-labelledby="backtest-heading"
      className="scroll-mt-24 py-24 lg:py-32"
    >
      <div className={`grid grid-cols-1 items-center gap-12 lg:grid-cols-2 ${CONTAINER}`}>
        <ScrollScrubReveal>
          <h2 id="backtest-heading" className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Backtest before you deploy.
          </h2>
          <p className="mt-4 max-w-lg text-base text-foreground/70">
            Validate your strategy against historical data before a single live trade — the engine
            runs PineScript v6-compatible execution with real market data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <RawChip>Historical backtests</RawChip>
            <RawChip>Parameter optimization</RawChip>
            <RawChip>Strategy conflict detection</RawChip>
          </div>
        </ScrollScrubReveal>
        <ScrollScrubReveal>
          <ParallaxPanel amplitude={16}>
            <TiltCard ariaHidden className={`relative ${GLASS_STANDARD} p-5`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[color:var(--landing-meta-strong)]">
                  Equity curve
                </span>
                <DemoTag />
              </div>
              <div className="mt-4">
                <EquityAreaChart />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <StatTile label="Total return" value="+18.7%" emphasis />
                <StatTile label="Trades" value="214" />
                <StatTile label="Max drawdown" value="−3.1%" />
              </div>
            </TiltCard>
          </ParallaxPanel>
        </ScrollScrubReveal>
      </div>
    </section>
  );
}

function BotSection() {
  return (
    <section aria-labelledby="bot-heading" className="py-24 lg:py-32">
      <div className={`grid grid-cols-1 items-center gap-12 lg:grid-cols-2 ${CONTAINER}`}>
        {/* Panel first in DOM; on mobile the copy stays above via order. */}
        <ScrollScrubReveal className="order-2 lg:order-1">
          <ParallaxPanel amplitude={16}>
            <motion.div
              aria-hidden="true"
              whileHover={glassHover}
              className={`relative ${GLASS_STANDARD} p-5`}
            >
              <DemoTag className="absolute right-4 top-4" />
              {/* TopBar echo — product truth (DESIGN §2.5). */}
              <div className="mt-4 flex items-center gap-2.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e66' }}
                />
                <span className="text-xs text-foreground/70">Bot: running</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <StatTile label="Trades" value="12" />
                <StatTile label="P&L" value="+2.4%" emphasis />
                <StatTile label="Errors" value="0" />
              </div>
              {/* Activity sparkline — hover-reactive bars, pointer-only (DESIGN §10). */}
              <div className="mt-4">
                <BotBarChart />
              </div>
              <div className={`mt-4 ${CHIP_FLAT} px-3 py-2`}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--landing-meta)]">
                  Telegram
                </div>
                <div className="mt-1 text-sm text-foreground/80">
                  Long filled — BTCUSDT @ 67,240 · TP 69,500 / SL 65,800
                </div>
              </div>
              {/* JellyBlobMascot — the one fun accent, peeking at the panel's corner
                  (DESIGN §12 accent-physics budget, §13.3). Decorative, aria-hidden. */}
              <div aria-hidden="true" className="landing-mascot absolute -bottom-3 -right-3">
                <JellyBlobMascot mood="neutral" className="size-14" />
              </div>
            </motion.div>
          </ParallaxPanel>
        </ScrollScrubReveal>
        <ScrollScrubReveal className="order-1 lg:order-2">
          <h2 id="bot-heading" className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Deploy it. Steer it from Telegram.
          </h2>
          <p className="mt-4 max-w-lg text-base text-foreground/70">
            Run your strategy on the live bot and keep an eye on it from anywhere — the same status,
            trades, and errors the panel shows.
          </p>
        </ScrollScrubReveal>
      </div>
    </section>
  );
}

function FooterCta({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section aria-labelledby="cta-heading" className="py-24 lg:py-32">
      <div className={CONTAINER}>
        <ParallaxPanel amplitude={16}>
          <motion.div
            variants={ctaEntrance}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            whileHover={glassHover}
            className={`relative ${GLASS_ELEVATED} px-6 py-16 text-center`}
          >
            <InnerHighlight />
            <h2 id="cta-heading" className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Ready to put your strategy to work.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-foreground/70">
              Start a backtest, deploy the bot, and steer it from Telegram — all in one panel.
            </p>
            <div className="mt-10 flex justify-center">
              <GetStartedButton onGetStarted={onGetStarted} sizeClass="h-12 px-8" />
            </div>
          </motion.div>
        </ParallaxPanel>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[color:var(--landing-hairline)] py-8">
      <div className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${CONTAINER}`}>
        <span className="text-sm font-semibold tracking-tight text-[color:var(--landing-accent-text)]">
          Pine Framework
        </span>
        <span className="text-xs text-foreground/50">Self-hosted PineScript trading.</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

/**
 * Landing surface — the night trader's instrument panel (DESIGN.md).
 *
 * Presentational shell: receives `onGetStarted`, owns the landing-only
 * theme state (persisted to `pine-landing-theme`, §13.3) and no other
 * global state. Demo visuals are synthetic, clearly labeled, and powered
 * by deterministic seeded series (demo-data.ts). Motion layer: hero
 * stagger, quiet scroll reveals, CTA press, scroll hairline, and the
 * §7 extension (parallax, scroll-scrub, magnetic CTA, 3D tilt, whileHover
 * glass, hologram foil) — all mapped to the LAW via motion-variants.ts /
 * motion-effects.tsx; the PullCord rope + mascot wobble collapse under
 * reduced motion via MotionConfig + the global CSS guard (§8).
 */
export function LandingPage({ onGetStarted }: LandingPageProps) {
  const { theme, toggleTheme } = useLandingTheme();
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-landing-theme={theme}
        className="relative isolate text-foreground selection:bg-(--landing-selection-bg) selection:text-[color:var(--landing-selection-text)]"
      >
        {/* Ambient wash — one fixed layer behind everything (DESIGN §3). */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-(--landing-wash-bg) bg-[image:var(--landing-wash-image)]"
        />
        {/* Scroll hairline — scroll-linked scaleX; reduced-motion: full-width fade (DESIGN §2.0, §8). */}
        <ScrollHairline />

        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[#ffd02f] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#1c1c1e]"
        >
          Skip to content
        </a>

        <LandingHeader
          onGetStarted={onGetStarted}
          theme={theme}
          onToggleTheme={toggleTheme}
          reducedMotion={reducedMotion}
        />

        <main id="landing-main" className="relative">
          <LandingHero onGetStarted={onGetStarted} />
          <CapabilityStrip />
          <BacktestSection />
          <BotSection />
          <FooterCta onGetStarted={onGetStarted} />
        </main>

        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
