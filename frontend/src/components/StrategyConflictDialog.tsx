import React from 'react';

export interface StrategyConflictDialogProps {
  isOpen: boolean;
  existingName: string;
  incomingName: string;
  onReplace: () => void;
  onCancel: () => void;
}

export function StrategyConflictDialog({ isOpen, existingName, incomingName, onReplace, onCancel }: StrategyConflictDialogProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 300,
    }} onClick={onCancel}>
      <div style={{
        width: 380,
        backgroundColor: '#0d0d18',
        border: '1px solid #111128',
        borderRadius: 8,
        padding: '20px 24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', color: '#ff9800', fontSize: '14px' }}>
          Strategy Conflict
        </h3>
        <p style={{ margin: '0 0 8px', color: '#e0e0e0', fontSize: '13px', lineHeight: '1.5' }}>
          A strategy is already running on the chart:
        </p>
        <p style={{ margin: '0 0 12px', color: '#ff9800', fontSize: '13px', fontWeight: 'bold' }}>
          {existingName}
        </p>
        <p style={{ margin: '0 0 8px', color: '#e0e0e0', fontSize: '13px', lineHeight: '1.5' }}>
          You are trying to add:
        </p>
        <p style={{ margin: '0 0 16px', color: '#2196f3', fontSize: '13px', fontWeight: 'bold' }}>
          {incomingName}
        </p>
        <p style={{ margin: '0 0 16px', color: '#aaa', fontSize: '12px', lineHeight: '1.5' }}>
          Only one strategy can run at a time. Replace the existing strategy?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '6px 16px',
            background: '#111128',
            color: '#e0e0e0',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '12px',
          }}>
            Cancel
          </button>
          <button onClick={onReplace} style={{
            padding: '6px 16px',
            background: '#ff9800',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
          }}>
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
