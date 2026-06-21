import { useState, useRef, useEffect } from 'react';

interface CodeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (code: string) => void;
}

const DEFAULT_CODE = `//@version=6
indicator("My Indicator", overlay=true)

// Get close price
closePrice = close

// Calculate SMA
sma20 = ta.sma(closePrice, 20)

// Plot results
plot(closePrice, "Close", color=color.blue)
plot(sma20, "SMA 20", color=color.orange)

// Add signals
plotshape(closePrice > sma20, "Buy Signal", shape.triangleup, location.belowbar, color.green)
plotshape(closePrice < sma20, "Sell Signal", shape.triangledown, location.abovebar, color.red)
`;

export function CodeEditor({ isOpen, onClose, onExecute }: CodeEditorProps) {
  const [code, setCode] = useState(DEFAULT_CODE);
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
      setCode(newCode);
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
      setCode(saved);
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
            onChange={(e) => setCode(e.target.value)}
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
