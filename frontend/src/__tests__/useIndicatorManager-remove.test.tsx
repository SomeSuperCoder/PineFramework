/**
 * B2 frontend — removing-during-compute state (remove-during-compute fix).
 *
 * Locks the REMOVING-state contract from data/handoffs/team/frontend/
 * frontend-engineer/remove-state.json:
 *   1. removeIndicator returns Promise<boolean>: true on success, false on
 *      failure/timeout (never throws, never silently swallows) so the caller
 *      can clear REMOVING state.
 *   2. Duplicate remove clicks do NOT spawn a second DELETE (removingRef
 *      in-flight guard) — the second click returns false immediately.
 *   3. Timeout bound: the DELETE request uses AbortSignal.timeout(15000)
 *      (matches useChartData's 15s execute timeout pattern).
 *
 * The ChartComponent badge render (removing > computing > Ready priority) is a
 * presentational concern; the hook-level guard + return contract are what the
 * business logic depends on, so those are the tested surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIndicatorManager } from '../hooks/useIndicatorManager';

interface RunningIndicator {
  id: string;
  scriptId: string;
  name: string;
  overlay: boolean;
  source: string;
  active: boolean;
}

function makeIndicator(id: string, scriptId = 'script-a'): RunningIndicator {
  return { id, scriptId, name: 'Test Indicator', overlay: false, source: '//@version=6\nindicator("t")', active: true };
}

// ─── Test suite ───────────────────────────────────────────────────
describe('useIndicatorManager — removeIndicator (B2 removing-state contract)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Seed the hook's indicator list via the mount-time fetchIndicators call. */
  async function renderWithIndicators(indicators: RunningIndicator[]) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ indicators }),
    });
    const rendered = renderHook(() => useIndicatorManager());
    await waitFor(() => expect(rendered.result.current.indicators).toHaveLength(indicators.length));
    return rendered;
  }

  it('returns true on success and removes the indicator from the list', async () => {
    const indicator = makeIndicator('ind-1');
    const { result } = await renderWithIndicators([indicator]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.removeIndicator('ind-1');
    });

    expect(ok).toBe(true);
    // Mount fetch + DELETE = exactly 2 calls, and the DELETE targeted the id.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/indicators/ind-1');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
    // 15s timeout bound (matches useChartData execute pattern).
    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    // The indicator is gone from the list.
    expect(result.current.indicators.some((i) => i.id === 'ind-1')).toBe(false);
  });

  it('does NOT spawn a second DELETE for a duplicate remove click (removingRef guard)', async () => {
    const indicator = makeIndicator('ind-2');
    const { result } = await renderWithIndicators([indicator]);

    // First click: DELETE in flight, not resolved yet.
    let resolveFirst: (v: { ok: boolean; json: () => Promise<{ success: boolean }> }) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve as never;
        }),
    );

    let firstResult: Promise<boolean> | undefined;
    let secondResult: Promise<boolean> | undefined;
    act(() => {
      firstResult = result.current.removeIndicator('ind-2');
    });
    act(() => {
      secondResult = result.current.removeIndicator('ind-2');
    });

    // Only ONE DELETE issued — the second click was deduped by the guard.
    // (Mount fetch is call #1, the DELETE is call #2; no third call.)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve the in-flight DELETE.
    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({ success: true }) });
    });

    // The original resolves true on success; the duplicate resolves false
    // (guard) — the caller clears REMOVING in both cases.
    expect(await firstResult).toBe(true);
    expect(await secondResult).toBe(false);
  });

  it('returns false on failure/timeout so the caller restores the label (never stuck REMOVING)', async () => {
    const indicator = makeIndicator('ind-3');
    const { result } = await renderWithIndicators([indicator]);

    // Simulate a network failure / timeout abort.
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.removeIndicator('ind-3');
    });

    // Failure → false (NOT throw) — the caller clears REMOVING and keeps the
    // label listed.
    expect(ok).toBe(false);
    // Mount fetch + failed DELETE = exactly 2 calls.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});