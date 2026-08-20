import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readInitialTheme, useLandingTheme } from './use-landing-theme';

/**
 * use-landing-theme (landing v2 — DESIGN §13.3):
 * landing-only light/dark state, persisted to `pine-landing-theme`.
 * Default dark; storage failures fall back to dark and never break the
 * in-session toggle (private-mode contract).
 *
 * Note: the reduced-motion flag is NOT exposed by this hook — it lives at
 * the component boundary (LandingPage via useReducedMotion) and is covered
 * by the E2E reduced-motion collapse suite instead.
 */

const KEY = 'pine-landing-theme';

describe('useLandingTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to dark when nothing is persisted (night-trader scene)', () => {
    const { result } = renderHook(() => useLandingTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggles dark → light and persists to pine-landing-theme', () => {
    const { result } = renderHook(() => useLandingTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem(KEY)).toBe('light');
  });

  it('toggles back to dark and persists', () => {
    const { result } = renderHook(() => useLandingTheme());
    act(() => result.current.toggleTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(KEY)).toBe('dark');
  });

  it('reads a persisted light theme on init (refresh restores the choice)', () => {
    window.localStorage.setItem(KEY, 'light');
    const { result } = renderHook(() => useLandingTheme());
    expect(result.current.theme).toBe('light');
  });

  it('falls back to dark when storage read throws (private mode)', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(readInitialTheme()).toBe('dark');
  });

  it('still flips the in-session theme when storage write throws', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const { result } = renderHook(() => useLandingTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
  });
});