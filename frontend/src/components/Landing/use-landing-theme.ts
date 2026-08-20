import { useCallback, useState } from 'react';

/** Landing-only theme (DESIGN §13 — Day Session light variant). */
export type LandingTheme = 'dark' | 'light';

/** localStorage key for the persisted landing theme (DESIGN §13.3). */
const LANDING_THEME_KEY = 'pine-landing-theme';

/** Reads the persisted landing theme. Default dark; storage failures fall
 *  back to dark (the night-trader scene, DESIGN §1). */
export function readInitialTheme(): LandingTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(LANDING_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Landing-only light/dark toggle state, persisted to `pine-landing-theme`.
 * The main panel always opens dark regardless (scope §13.1) — this hook is
 * consumed only by the landing root's `data-landing-theme` attribute.
 */
export function useLandingTheme() {
  const [theme, setTheme] = useState<LandingTheme>(readInitialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: LandingTheme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(LANDING_THEME_KEY, next);
      } catch {
        // Storage unavailable (private mode) — the theme still applies this visit.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
