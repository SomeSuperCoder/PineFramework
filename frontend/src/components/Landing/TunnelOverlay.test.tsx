import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { TunnelOverlay } from './TunnelOverlay';

/**
 * Landing v3 — Get Started hyperjump (DESIGN §14).
 *
 * TunnelOverlay contract tests. The App owns the state machine (idle | tunnel |
 * reveal); the overlay owns the animation. Contract under test:
 *
 *   Hyperjump path (DESIGN §14.2):   onReady at P1 end (400ms, fully opaque),
 *   onExitComplete only after `exiting` flips AND the P6 peak hold ends — at
 *   P7 end (opacity 0, total 1750ms). If the App is slow to flip `exiting`,
 *   the overlay HOLDS at the peak — it never cuts.
 *
 *   Reduced-motion path (§14.5):     plain 300ms cross-fade — onReady ~150ms
 *   after the enter frame, onExitComplete ~150ms after `exiting`, no canvas.
 *
 *   Cleanup:                         unmount clears every timer/rAF; no events
 *   fire after unmount.
 *
 * Event spies are stable vi.fn() identities so re-renders never re-run the
 * mount effect ([onReady] dep) and never double-schedule the choreography.
 */
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('TunnelOverlay — hyperjump contract (DESIGN §14)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('onReady fires once at P1 end (~400ms) when the veil is opaque', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { container } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    // Before P1 end — not ready.
    await advance(399);
    expect(onReady).not.toHaveBeenCalled();

    // P1 end (400ms) — onReady, exactly once.
    await advance(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    // Prop contract: zero-argument callback.
    expect(onReady.mock.calls[0]).toHaveLength(0);

    // The veil layer is opaque (rAF set its target to 1).
    const overlay = container.querySelector('[data-testid="tunnel-overlay"]');
    expect(overlay).not.toBeNull();
    const veil = overlay?.firstElementChild as HTMLElement | null;
    expect(veil?.style.opacity).toBe('1');

    // No exit while the App has not flipped `exiting`.
    await advance(5000);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onExitComplete).not.toHaveBeenCalled();
  });

  it('onExitComplete fires at opacity 0 (P7 end, total ~1750ms) only after exiting', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    await advance(400);
    expect(onReady).toHaveBeenCalledTimes(1);

    // App flips `exiting` at P1 end → exit waits for the P6 peak hold end (1500ms).
    rerender(<TunnelOverlay reducedMotion={false} exiting onReady={onReady} onExitComplete={onExitComplete} />);

    // At the peak hold (1500ms) the exit begins — opacity 0 only at P7 end.
    await advance(1100);
    expect(onExitComplete).not.toHaveBeenCalled();

    // P7 end (1750ms) — opacity 0, exactly once, zero-arg.
    await advance(250);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    expect(onExitComplete.mock.calls[0]).toHaveLength(0);
  });

  it('handshake order with the App wiring: onReady → exiting → onExitComplete (never reversed)', async () => {
    const order: string[] = [];
    const onReady = vi.fn(() => order.push('onReady'));
    const onExitComplete = vi.fn(() => order.push('onExitComplete'));
    const { rerender } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    await advance(400);
    rerender(<TunnelOverlay reducedMotion={false} exiting onReady={onReady} onExitComplete={onExitComplete} />);
    await advance(1350);

    expect(order).toEqual(['onReady', 'onExitComplete']);
  });

  it('holds at the flash peak if the App is slow — onExitComplete still fires once when exiting finally flips', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    await advance(400);
    expect(onReady).toHaveBeenCalledTimes(1);

    // Slow App: no `exiting` even long after the tunnel would have ended.
    await advance(3000);
    expect(onExitComplete).not.toHaveBeenCalled();

    // App finally flips exiting at t=3400 — the wait clamps to 0 and the
    // reveal still runs its full 250ms decay before reporting completion.
    rerender(<TunnelOverlay reducedMotion={false} exiting onReady={onReady} onExitComplete={onExitComplete} />);
    await advance(249);
    expect(onExitComplete).not.toHaveBeenCalled();
    await advance(1);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it('renders the full tunnel: overlay semantics + streak canvas present', () => {
    const { container } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={vi.fn()} onExitComplete={vi.fn()} />,
    );
    const overlay = container.querySelector('[data-testid="tunnel-overlay"]');
    expect(overlay).not.toBeNull();
    // §14.3 a11y contract: decorative, aria-hidden, presentation role.
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.getAttribute('role')).toBe('presentation');
    // Canvas 2D streak tunnel is mounted on the full path.
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('cleans up on unmount — no leaked timers/rAF, no events after unmount', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { unmount } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(5000);
    expect(onReady).not.toHaveBeenCalled();
    expect(onExitComplete).not.toHaveBeenCalled();
  });

  it('cleans up mid-jump after onReady — pending flash/exit timers are cleared', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { unmount } = render(
      <TunnelOverlay reducedMotion={false} exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    await advance(400);
    expect(onReady).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(5000);
    expect(onExitComplete).not.toHaveBeenCalled();
  });
});

describe('TunnelOverlay — reduced-motion cross-fade (DESIGN §14.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits BOTH events on the cross-fade path: onReady ~150ms in, onExitComplete ~150ms out', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { rerender } = render(
      <TunnelOverlay reducedMotion exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    // First frame paints transparent, then the enter fade: commit the rAF
    // state update FIRST (React flushes it at the end of the act window),
    // then advance the 150ms fade — onReady fires.
    await advance(16);
    await advance(150);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onExitComplete).not.toHaveBeenCalled();

    // App flips exiting → exit fade → complete.
    rerender(<TunnelOverlay reducedMotion exiting onReady={onReady} onExitComplete={onExitComplete} />);
    await advance(150);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('never mounts the tunnel canvas on the reduced-motion path', () => {
    const { container } = render(
      <TunnelOverlay reducedMotion exiting={false} onReady={vi.fn()} onExitComplete={vi.fn()} />,
    );
    expect(container.querySelector('canvas')).toBeNull();
    // Still the same overlay root contract.
    expect(container.querySelector('[data-testid="tunnel-overlay"]')).not.toBeNull();
  });

  it('cleans up on unmount — no leaked timers/rAF, no events after unmount', async () => {
    const onReady = vi.fn();
    const onExitComplete = vi.fn();
    const { unmount } = render(
      <TunnelOverlay reducedMotion exiting={false} onReady={onReady} onExitComplete={onExitComplete} />,
    );

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(5000);
    expect(onReady).not.toHaveBeenCalled();
    expect(onExitComplete).not.toHaveBeenCalled();
  });
});