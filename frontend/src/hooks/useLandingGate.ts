import { useCallback, useState } from 'react';

/** localStorage key for the persisted "user has entered the app" flag (D2). */
const LANDING_ENTERED_KEY = 'pine-landing-entered';

/**
 * Reads the persisted entered flag. All storage access is guarded: in private
 * mode / quota-exhausted contexts localStorage can throw. A read failure
 * defaults to the landing (safe — the user just clicks Get Started again).
 * Only the exact value '1' means "entered"; any other value (garbage,
 * 'false', '0') is treated as not entered (journey S3, A20).
 */
function readEnteredFlag(): boolean {
  try {
    return localStorage.getItem(LANDING_ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}

export type LandingView = 'landing' | 'app';

/**
 * View gate for the landing/app state machine (D1–D3).
 *
 * - The initial view resolves SYNCHRONOUSLY via a lazy useState initializer so
 *   a returning user never sees a landing→app flash (A19).
 * - `enterApp` persists the flag then switches to the app view (T1).
 * - `showLanding` clears the flag BEFORE switching so a reload racing the
 *   switch already sees the cleared flag (T2/T3/T4, A21).
 * - Transitions are idempotent (plain state + pure storage ops) → React
 *   StrictMode double-invoke safe.
 */
export function useLandingGate() {
  const [view, setView] = useState<LandingView>(() => (readEnteredFlag() ? 'app' : 'landing'));

  const enterApp = useCallback(() => {
    try {
      localStorage.setItem(LANDING_ENTERED_KEY, '1');
    } catch {
      // Session still works; persistence is best-effort only.
    }
    setView('app');
  }, []);

  const showLanding = useCallback(() => {
    try {
      localStorage.removeItem(LANDING_ENTERED_KEY);
    } catch {
      // Session still works; persistence is best-effort only.
    }
    setView('landing');
  }, []);

  return { view, enterApp, showLanding };
}
