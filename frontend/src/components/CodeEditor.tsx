import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';

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
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecute(code);
    });
  };

  const handleExecute = () => {
    onExecute(code);
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
            <button className="primary" onClick={handleExecute}>Run (Ctrl+Enter)</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="editor-content">
          <Editor
            height="100%"
            defaultLanguage="plaintext"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value || '')}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

declare const monaco: any;
