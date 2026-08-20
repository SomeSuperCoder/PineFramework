import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLandingGate } from '../hooks/useLandingGate';

/**
 * Landing / app navigation state machine (openspec landing-page-and-nav-flow).
 *
 * Contract under test:
 * - Initial view: no flag → 'landing'; flag '1' → 'app'; garbage → 'landing'.
 * - Storage read throws → 'landing' (safe default, journey S3 / A20).
 * - enterApp → view 'app' + persists '1'; set throws → session still works.
 * - showLanding → view 'landing' + flag removed; remove throws → still works.
 * - Transitions are idempotent (StrictMode-safe).
 */

const KEY = 'pine-landing-entered';

describe('useLandingGate — initial view resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no flag → landing (first-ever open)', () => {
    const { result } = renderHook(() => useLandingGate());
    expect(result.current.view).toBe('landing');
  });

  it('flag "1" → app (returning user)', () => {
    localStorage.setItem(KEY, '1');
    const { result } = renderHook(() => useLandingGate());
    expect(result.current.view).toBe('app');
  });

  it('garbage flag values → landing (only the exact value "1" means entered)', () => {
    for (const garbage of ['false', '0', 'yes', 'true', '2', '']) {
      localStorage.setItem(KEY, garbage);
      const { result } = renderHook(() => useLandingGate());
      expect(result.current.view, `flag "${garbage}" must resolve to landing`).toBe('landing');
    }
  });

  it('storage read throws → landing (safe default, no crash)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage is not available');
    });
    const { result } = renderHook(() => useLandingGate());
    expect(result.current.view).toBe('landing');
  });
});

describe('useLandingGate — enterApp', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enterApp → view app and persists the flag', () => {
    const { result } = renderHook(() => useLandingGate());
    expect(result.current.view).toBe('landing');

    act(() => result.current.enterApp());

    expect(result.current.view).toBe('app');
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('storage set throws → view still switches to app (session works, no persistence)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useLandingGate());

    act(() => result.current.enterApp());

    expect(result.current.view).toBe('app');
  });

  it('enterApp twice is idempotent (StrictMode-safe)', () => {
    const { result } = renderHook(() => useLandingGate());

    act(() => result.current.enterApp());
    act(() => result.current.enterApp());

    expect(result.current.view).toBe('app');
    expect(localStorage.getItem(KEY)).toBe('1');
  });
});

describe('useLandingGate — showLanding', () => {
  beforeEach(() => {
    localStorage.setItem(KEY, '1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('showLanding → view landing and removes the flag', () => {
    const { result } = renderHook(() => useLandingGate());
    expect(result.current.view).toBe('app');

    act(() => result.current.showLanding());

    expect(result.current.view).toBe('landing');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('storage remove throws → view still switches to landing (session works)', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useLandingGate());

    act(() => result.current.showLanding());

    expect(result.current.view).toBe('landing');
  });

  it('showLanding twice is idempotent (StrictMode-safe)', () => {
    const { result } = renderHook(() => useLandingGate());

    act(() => result.current.showLanding());
    act(() => result.current.showLanding());

    expect(result.current.view).toBe('landing');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});