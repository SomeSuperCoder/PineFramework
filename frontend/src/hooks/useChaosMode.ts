/**
 * useChaosMode — manages chaos mode state with hidden activation gesture.
 *
 * Activation: 5 taps within 3 seconds on the hidden tap target.
 * Persists state to backend via config API.
 *
 * Source of truth: while connected, the engine's `bot:snapshot` (`chaosMode`)
 * is authoritative. The persisted disk config is only a fallback before the
 * first snapshot arrives. A toggle applies an optimistic value immediately and
 * is corrected by the next snapshot, so a failed toggle never leaves the UI
 * showing a state the engine did not reach.
 *
 * @module frontend
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChaosModeSnapshot } from '../types';

const TAP_THRESHOLD = 5;
const TAP_WINDOW_MS = 3000;

export interface UseChaosModeReturn {
  /** Whether chaos mode is currently enabled (engine truth, else optimistic, else disk). */
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

export function useChaosMode(
  backendUrl: string,
  engineChaosMode?: ChaosModeSnapshot | null,
): UseChaosModeReturn {
  const [diskConfigEnabled, setDiskConfigEnabled] = useState(false);
  const [showToast, setToShowToast] = useState(false);
  const [tapFlash, setTapFlash] = useState(false);
  // Optimistic value applied on toggle; cleared by the next engine snapshot so
  // the UI settles on the engine truth (correcting a failed toggle).
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);
  const tapsRef = useRef<number[]>([]);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial state from backend (disk config) — fallback until the engine
  // snapshot arrives; the snapshot is the SSOT while connected.
  useEffect(() => {
    fetch(`${backendUrl}/api/bot/config`)
      .then(res => res.ok ? res.json() : null)
      .then(config => {
        if (config?.chaosMode?.enabled) {
          setDiskConfigEnabled(true);
        }
      })
      .catch(() => { /* ignore — default is false */ });
  }, [backendUrl]);

  // Reconcile: once the engine reports its actual mode, drop the optimistic
  // value so the indicator reflects engine truth, not the toggle's guess.
  useEffect(() => {
    if (engineChaosMode != null) {
      setPendingToggle(null);
    }
  }, [engineChaosMode]);

  // Engine truth wins when known; otherwise the in-flight toggle; otherwise disk.
  const chaosMode = pendingToggle ?? engineChaosMode?.enabled ?? diskConfigEnabled;

  const persistChaosMode = useCallback(async (enabled: boolean) => {
    try {
      await fetch(`${backendUrl}/api/bot/chaos-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // If config endpoint isn't available, chaos mode still works in-memory
    }
  }, [backendUrl]);

  const toggleChaosMode = useCallback(() => {
    const next = !chaosMode;
    setPendingToggle(next);
    setToShowToast(true);
    persistChaosMode(next);
  }, [chaosMode, persistChaosMode]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current.push(now);

    // Remove taps older than the window
    tapsRef.current = tapsRef.current.filter(t => now - t < TAP_WINDOW_MS);

    // Flash on tap
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setTapFlash(true);
    flashTimerRef.current = setTimeout(() => setTapFlash(false), 150);

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
      background: tapFlash ? 'rgba(255,255,255,0.08)' : 'transparent',
      borderRadius: 4,
      transition: 'background 0.15s ease-out',
    } as React.CSSProperties,
  };

  return { chaosMode, toggleChaosMode, tapTargetProps, showToast, dismissToast };
}
