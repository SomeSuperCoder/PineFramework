import { motion, MotionConfig } from 'framer-motion';
import logoUrl from '@/assets/logo.svg';
import {
  DUR_FAST,
  EASE_EXIT,
  ctaEntrance,
  fadeRise,
  heroItem,
  pressTap,
  staggerDelay,
  viewportOnce,
} from './motion-variants';
import { ScrollHairline } from './ScrollHairline';

export interface LandingPageProps {
  /** Persists entry and switches to the main panel (T1). */
  onGetStarted: () => void;
}

/* ------------------------------------------------------------------ */
/* Class recipes — the Feral Glass + neobrutalist language (DESIGN §2–6) */
/* ------------------------------------------------------------------ */

const GLASS_STANDARD = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md';

const GLASS_ELEVATED =
  'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl ' +
  'shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7),0_0_80px_-24px_rgba(255,208,47,0.2)]';

/** Flat chip / tile / bubble — no blur, sits on the wash (DESIGN §3). */
const CHIP_FLAT = 'rounded-lg border border-white/[0.06] bg-white/[0.02]';

const DEMO_TAG = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/40';

/** The single raw-yellow artifact — hard offset shadow that collapses on press. */
const GET_STARTED =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#ffd02f] ' +
  'text-sm font-semibold text-[#1c1c1e] transition-[transform,box-shadow,background-color] ' +
  'duration-fast ease-enter shadow-[3px_3px_0_rgba(0,0,0,0.5)] ' +
  'hover:-translate-y-0.5 hover:bg-[#fcb900] hover:shadow-[4px_4px_0_rgba(0,0,0,0.5)] ' +
  'active:translate-y-0 active:shadow-[1px_1px_0_rgba(0,0,0,0.5)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd02f]/70 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Raw capability chip — neobrutalist marker, no blur (DESIGN §2.3). */
const RAW_CHIP =
  'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] ' +
  'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80';

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
    <motion.button
      type="button"
      onClick={onGetStarted}
      whileTap={pressTap}
      transition={{ duration: DUR_FAST, ease: EASE_EXIT }}
      className={`${GET_STARTED} ${sizeClass}`}
    >
      {children}
    </motion.button>
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
      className="pointer-events-none absolute inset-x-0 top-0 h-[40%] rounded-t-2xl bg-gradient-to-b from-white/[0.06] to-transparent"
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${emphasis ? 'text-[#ffd02f]' : 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Synthetic demo visuals — static, clearly labeled, never real data   */
/* ------------------------------------------------------------------ */

/** Hero mini-chart: faint grid + brand-blue area/line series. */
function MiniChart() {
  return (
    <svg viewBox="0 0 320 140" className="h-auto w-full">
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4262ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4262ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="white" strokeOpacity="0.1" strokeWidth="1">
        <line x1="0" y1="30" x2="320" y2="30" />
        <line x1="0" y1="60" x2="320" y2="60" />
        <line x1="0" y1="90" x2="320" y2="90" />
        <line x1="0" y1="120" x2="320" y2="120" />
        <line x1="64" y1="0" x2="64" y2="140" />
        <line x1="128" y1="0" x2="128" y2="140" />
        <line x1="192" y1="0" x2="192" y2="140" />
        <line x1="256" y1="0" x2="256" y2="140" />
      </g>
      <path
        d="M0 108 L24 100 L48 104 L72 88 L96 92 L120 74 L144 80 L168 62 L192 68 L216 50 L240 56 L264 38 L288 44 L312 28 L320 26 L320 140 L0 140 Z"
        fill="url(#hero-area)"
      />
      <path
        d="M0 108 L24 100 L48 104 L72 88 L96 92 L120 74 L144 80 L168 62 L192 68 L216 50 L240 56 L264 38 L288 44 L312 28 L320 26"
        fill="none"
        stroke="#4262ff"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Backtest equity curve: smooth rising line over the faint grid. */
function EquityCurve() {
  return (
    <svg viewBox="0 0 320 160" className="h-auto w-full">
      <defs>
        <linearGradient id="equity-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4262ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#4262ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="white" strokeOpacity="0.1" strokeWidth="1">
        <line x1="0" y1="40" x2="320" y2="40" />
        <line x1="0" y1="80" x2="320" y2="80" />
        <line x1="0" y1="120" x2="320" y2="120" />
        <line x1="80" y1="0" x2="80" y2="160" />
        <line x1="160" y1="0" x2="160" y2="160" />
        <line x1="240" y1="0" x2="240" y2="160" />
      </g>
      <path
        d="M0 148 C40 144 64 138 88 128 C112 118 128 122 152 104 C180 84 200 92 224 70 C252 46 288 40 320 30 L320 160 L0 160 Z"
        fill="url(#equity-area)"
      />
      <path
        d="M0 148 C40 144 64 138 88 128 C112 118 128 122 152 104 C180 84 200 92 224 70 C252 46 288 40 320 30"
        fill="none"
        stroke="#4262ff"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page sections                                                       */
/* ------------------------------------------------------------------ */

function LandingHeader({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
      <div className={`flex h-14 items-center justify-between ${CONTAINER}`}>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" width={24} height={24} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-[#ffd02f]">
            Pine Framework
          </span>
        </div>
        <GetStartedButton onGetStarted={onGetStarted} sizeClass="h-10 px-4" />
      </div>
    </header>
  );
}

function HeroDemoPanel() {
  return (
    <div aria-hidden="true" className={`relative ${GLASS_ELEVATED} p-5`}>
      <InnerHighlight />
      <DemoTag className="absolute right-4 top-4" />
      <div className="mt-6">
        <MiniChart />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Backtest P&L" value="+12.4%" emphasis />
        <StatTile label="Win rate" value="61%" />
        <StatTile label="Max drawdown" value="−4.2%" />
      </div>
    </div>
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
          <HeroDemoPanel />
        </motion.div>
      </div>
    </section>
  );
}

function CapabilityStrip() {
  return (
    <motion.div
      variants={fadeRise}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className={`flex flex-wrap items-center gap-3 py-4 ${CONTAINER}`}
    >
      <RawChip>PineScript</RawChip>
      <RawChip>Backtest</RawChip>
      <RawChip>Live Bot</RawChip>
      <RawChip>Telegram</RawChip>
    </motion.div>
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
        <motion.div
          variants={fadeRise}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
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
        </motion.div>
        <motion.div
          aria-hidden="true"
          variants={fadeRise}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className={`relative ${GLASS_STANDARD} p-5`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground/80">Equity curve</span>
            <DemoTag />
          </div>
          <div className="mt-4">
            <EquityCurve />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile label="Total return" value="+18.7%" emphasis />
            <StatTile label="Trades" value="214" />
            <StatTile label="Max drawdown" value="−3.1%" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function BotSection() {
  return (
    <section aria-labelledby="bot-heading" className="py-24 lg:py-32">
      <div className={`grid grid-cols-1 items-center gap-12 lg:grid-cols-2 ${CONTAINER}`}>
        {/* Panel first in DOM; on mobile the copy stays above via order. */}
        <motion.div
          aria-hidden="true"
          variants={fadeRise}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className={`relative order-2 ${GLASS_STANDARD} p-5 lg:order-1`}
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
          <div className={`mt-4 ${CHIP_FLAT} px-3 py-2`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
              Telegram
            </div>
            <div className="mt-1 text-sm text-foreground/80">
              Long filled — BTCUSDT @ 67,240 · TP 69,500 / SL 65,800
            </div>
          </div>
        </motion.div>
        <motion.div
          variants={fadeRise}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="order-1 lg:order-2"
        >
          <h2 id="bot-heading" className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Deploy it. Steer it from Telegram.
          </h2>
          <p className="mt-4 max-w-lg text-base text-foreground/70">
            Run your strategy on the live bot and keep an eye on it from anywhere — the same status,
            trades, and errors the panel shows.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function FooterCta({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section aria-labelledby="cta-heading" className="py-24 lg:py-32">
      <div className={CONTAINER}>
        <motion.div
          variants={ctaEntrance}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
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
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-8">
      <div className={`flex flex-col items-center justify-between gap-3 sm:flex-row ${CONTAINER}`}>
        <span className="text-sm font-semibold tracking-tight text-[#ffd02f]">Pine Framework</span>
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
 * Presentational shell only: receives `onGetStarted`, owns no global state and
 * no localStorage. Demo visuals are static, synthetic, and clearly labeled.
 * Motion layer: hero stagger (the one authored moment), quiet scroll reveals,
 * CTA press (whileTap), scroll hairline (ScrollHairline) — mapped to the LAW.
 */
export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate text-foreground selection:bg-[#ffd02f]/30 selection:text-foreground">
        {/* Ambient wash — one fixed layer behind everything (DESIGN §3). */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-background bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,208,47,0.08),transparent_60%),radial-gradient(90%_60%_at_85%_110%,rgba(66,98,255,0.06),transparent_60%)]"
        />
        {/* Scroll hairline — scroll-linked scaleX; reduced-motion: full-width fade (DESIGN §2.0, §8). */}
        <ScrollHairline />

        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[#ffd02f] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#1c1c1e]"
        >
          Skip to content
        </a>

        <LandingHeader onGetStarted={onGetStarted} />

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
