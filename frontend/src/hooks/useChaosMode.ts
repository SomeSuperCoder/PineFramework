/**
 * useChaosMode — manages chaos mode state with hidden activation gesture.
 *
 * Activation: 5 taps within 3 seconds on the hidden tap target.
 * Persists state to backend via config API.
 *
 * @module frontend
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const TAP_THRESHOLD = 5;
const TAP_WINDOW_MS = 3000;

export interface UseChaosModeReturn {
  /** Whether chaos mode is currently enabled. */
  chaosMode: boolean;
  /** Toggle chaos mode (for programmatic use). */
  toggleChaosMode: () => void;
  /** Props to spread on the hidden tap target element. */
  tapTargetProps: {
    onClick: () => void;
    style: React.CSSProperties;
  };
  /** Whether the activation toast should be shown. */
  showToast: boolean;
  /** Dismiss the toast. */
  dismissToast: () => void;
}

export function useChaosMode(backendUrl: string): UseChaosModeReturn {
  const [chaosMode, setChaosMode] = useState(false);
  const [showToast, setToShowToast] = useState(false);
  const tapsRef = useRef<number[]>([]);

  // Load initial state from backend
  useEffect(() => {
    fetch(`${backendUrl}/api/bot/config`)
      .then(res => res.ok ? res.json() : null)
      .then(config => {
        if (config?.chaosMode?.enabled) {
          setChaosMode(true);
        }
      })
      .catch(() => { /* ignore — default is false */ });
  }, [backendUrl]);

  const persistChaosMode = useCallback(async (enabled: boolean) => {
    try {
      // Get current config, update chaosMode, save back
      const res = await fetch(`${backendUrl}/api/bot/config`);
      if (res.ok) {
        const config = await res.json();
        const updatedConfig = { ...config, chaosMode: { enabled } };
        await fetch(`${backendUrl}/api/bot/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig),
        });
      }
    } catch {
      // If config endpoint isn't available, chaos mode still works in-memory
    }
  }, [backendUrl]);

  const toggleChaosMode = useCallback(() => {
    setChaosMode(prev => {
      const next = !prev;
      persistChaosMode(next);
      setToShowToast(true);
      return next;
    });
  }, [persistChaosMode]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current.push(now);

    // Remove taps older than the window
    tapsRef.current = tapsRef.current.filter(t => now - t < TAP_WINDOW_MS);

    if (tapsRef.current.length >= TAP_THRESHOLD) {
      tapsRef.current = [];
      toggleChaosMode();
    }
  }, [toggleChaosMode]);

  const dismissToast = useCallback(() => {
    setToShowToast(false);
  }, []);

  // Auto-dismiss toast after 2 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(dismissToast, 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast, dismissToast]);

  const tapTargetProps = {
    onClick: handleTap,
    style: {
      position: 'fixed' as const,
      bottom: 8,
      right: 8,
      width: 32,
      height: 32,
      cursor: 'default',
      zIndex: 9999,
      // Nearly invisible — very low opacity background that only shows on hover
      background: 'transparent',
      borderRadius: 4,
    } as React.CSSProperties,
  };

  return { chaosMode, toggleChaosMode, tapTargetProps, showToast, dismissToast };
}
