import { useRef, useEffect } from 'react';

interface CodeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (code: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
}

export const DEFAULT_CODE = `//@version=6
strategy("My Strategy", overlay=true, initial_capital=10000)

// Calculate SMA
sma20 = ta.sma(close, 20)

// Entry: buy when close crosses above SMA
if (close > sma20)
    strategy.entry("Long", strategy.long)

// Exit: sell when close crosses below SMA
if (close < sma20)
    strategy.close("Long")
`;

export function CodeEditor({ isOpen, onClose, onExecute, code, onCodeChange }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onExecute(code);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, code, onExecute]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      onCodeChange(newCode);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleSave = () => {
    localStorage.setItem('pine-script-code', code);
  };

  const handleLoad = () => {
    const saved = localStorage.getItem('pine-script-code');
    if (saved) {
      onCodeChange(saved);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="editor-overlay" onClick={onClose}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-header">
          <h2>Pine Script Editor</h2>
          <div className="editor-actions">
            <button onClick={handleLoad}>Load</button>
            <button onClick={handleSave}>Save</button>
            <button className="primary" onClick={() => onExecute(code)}>Run (Ctrl+Enter)</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="editor-content">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              border: 'none',
              padding: '16px',
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
              fontSize: '14px',
              lineHeight: '1.5',
              resize: 'none',
              outline: 'none',
              tabSize: 2,
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
