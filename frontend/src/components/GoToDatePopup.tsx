import { useState, useEffect, useRef } from 'react';
import { formatDate, formatTime, parseMsk, now } from 'pine-framework/utils/time';

interface GoToDatePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToDate: (timestampSeconds: number, dateStr: string, timeStr: string) => void;
  lastTeleport?: { date: string; time: string };
}

export function GoToDatePopup({ isOpen, onClose, onGoToDate, lastTeleport }: GoToDatePopupProps) {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const nowSec = now();
      // Use last teleport if available, otherwise current time
      setDateStr(lastTeleport?.date || formatDate(nowSec));
      setTimeStr(lastTeleport?.time || formatTime(nowSec));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, lastTeleport]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const utc = parseMsk(dateStr, timeStr);
    if (isNaN(utc)) return;
    onGoToDate(utc, dateStr, timeStr);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      onClick={onClose}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.4)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: '8px',
          padding: '20px 24px', width: 300, color: '#e0e0e0',
          fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: '13px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 16 }}>
          Go to Date
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#888' }}>Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', background: '#0d0d18',
                border: '1px solid #2a2a4e', borderRadius: '4px',
                color: '#e0e0e0', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#888' }}>Time (MSK, HH:MM)</label>
            <input
              ref={inputRef}
              type="text"
              placeholder="HH:MM"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', background: '#0d0d18',
                border: '1px solid #2a2a4e', borderRadius: '4px',
                color: '#e0e0e0', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box', textAlign: 'center',
                fontFamily: 'monospace',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px', background: '#111128', color: '#e0e0e0',
                border: '1px solid #2a2a4e', borderRadius: '4px',
                cursor: 'pointer', fontSize: '12px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '6px 14px', background: '#2196f3', color: '#fff',
                border: 'none', borderRadius: '4px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600,
              }}
            >
              Go
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}