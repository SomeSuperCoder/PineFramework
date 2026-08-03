/**
 * ChaosModeWarning — full-screen overlay warning when chaos mode is active.
 *
 * Blocks dashboard interaction until user acknowledges the warning.
 *
 * @module frontend
 */

import { useState } from 'react';

interface ChaosModeWarningProps {
  /** Whether chaos mode is active. */
  isActive: boolean;
  /** Callback when user acknowledges the warning. */
  onAcknowledge: () => void;
}

export function ChaosModeWarning({ isActive, onAcknowledge }: ChaosModeWarningProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isActive || acknowledged) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(233, 69, 96, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      gap: 24,
    }}>
      <div style={{
        fontSize: 48,
        fontWeight: 900,
        color: '#fff',
        textAlign: 'center',
        textShadow: '0 2px 8px rgba(0,0,0,0.3)',
        lineHeight: 1.2,
      }}>
        ⚠️ CHAOS MODE ACTIVE
      </div>
      <div style={{
        fontSize: 20,
        color: '#fff',
        fontWeight: 600,
        textAlign: 'center',
        opacity: 0.9,
      }}>
        RANDOM SIGNALS — NOT A STRATEGY
      </div>
      <div style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        maxWidth: 400,
        lineHeight: 1.5,
      }}>
        The bot will generate random long/short/exit signals on every candle close.
        Position sizing is fixed at 10% of equity. This is for stress testing only.
      </div>
      <button
        onClick={() => {
          setAcknowledged(true);
          onAcknowledge();
        }}
        style={{
          marginTop: 16,
          padding: '12px 32px',
          background: '#fff',
          color: '#e94560',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
      >
        I Understand — Proceed
      </button>
    </div>
  );
}
