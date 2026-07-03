import { useRef, useEffect, useState, useCallback } from 'react';

interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
  createdAt: number;
  updatedAt: number;
}

interface CodeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (scriptId: string, source: string) => void;
  initialScriptId?: string | null;
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

function extractName(source: string): string | null {
  const strategyMatch = source.match(/strategy\(\s*["'](.+?)["']/);
  if (strategyMatch) return strategyMatch[1];
  const indicatorMatch = source.match(/indicator\(\s*["'](.+?)["']/);
  if (indicatorMatch) return indicatorMatch[1];
  const studyMatch = source.match(/study\(\s*["'](.+?)["']/);
  if (studyMatch) return studyMatch[1];
  return null;
}

function extractVersion(source: string): number | null {
  const match = source.match(/\/\/\s*@version\s*=\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function CodeEditor({ isOpen, onClose, onRun, initialScriptId }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const [source, setSource] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentScriptIdRef = useRef<string | null>(null);
  const sourceRef = useRef(source);

  sourceRef.current = source;
  currentScriptIdRef.current = currentScriptId;

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts');
      const data = await res.json();
      setScripts(data.scripts || []);
    } catch {
      // ignore
    }
  }, []);

  const loadScript = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/scripts/${id}`);
      const data = await res.json();
      if (data.script) {
        setCurrentScriptId(data.script.id);
        setSource(data.script.source);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadRunningScript = useCallback(async () => {
    setLoading(true);
    try {
      await fetchScripts();
      const res = await fetch('/api/scripts/running');
      const data = await res.json();
      if (data.script) {
        setCurrentScriptId(data.script.id);
        setSource(data.script.source);
      } else {
        const listRes = await fetch('/api/scripts');
        const listData = await listRes.json();
        if (listData.scripts?.length > 0) {
          await loadScript(listData.scripts[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [fetchScripts, loadScript]);

  useEffect(() => {
    if (isOpen) {
      if (initialScriptId) {
        fetchScripts().then(() => loadScript(initialScriptId));
      } else {
        loadRunningScript();
      }
    }
  }, [isOpen, initialScriptId, fetchScripts, loadScript, loadRunningScript]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const id = currentScriptIdRef.current;
        const src = sourceRef.current;
        if (id) onRun(id, src);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onRun]);

  const saveSource = useCallback(async (id: string, newSource: string) => {
    try {
      const updates: { source: string; name?: string } = { source: newSource };
      const extracted = extractName(newSource);
      if (extracted) updates.name = extracted;
      await fetch(`/api/scripts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (extracted) {
        setScripts((prev) => prev.map((s) => s.id === id ? { ...s, name: extracted, source: newSource } : s));
      } else {
        setScripts((prev) => prev.map((s) => s.id === id ? { ...s, source: newSource } : s));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSourceChange = useCallback((newSource: string) => {
    setSource(newSource);
    const id = currentScriptIdRef.current;
    if (!id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSource(id, newSource), 500);
  }, [saveSource]);

  const handleDropdownChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id === currentScriptId) return;
    await loadScript(id);
  };

  const handleNewScript = async () => {
    try {
      const extracted = extractName(DEFAULT_CODE);
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: extracted || 'Untitled', source: DEFAULT_CODE }),
      });
      const data = await res.json();
      if (data.script) {
        setScripts((prev) => [...prev, data.script]);
        setCurrentScriptId(data.script.id);
        setSource(data.script.source);
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!currentScriptId) return;
    try {
      await fetch(`/api/scripts/${currentScriptId}`, { method: 'DELETE' });
      setScripts((prev) => {
        const next = prev.filter((s) => s.id !== currentScriptId);
        if (next.length > 0) {
          loadScript(next[0].id);
        } else {
          setCurrentScriptId(null);
          setSource(DEFAULT_CODE);
        }
        return next;
      });
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = source.substring(0, start) + '  ' + source.substring(end);
      handleSourceChange(newCode);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const currentScript = scripts.find((s) => s.id === currentScriptId);

  if (!isOpen) return null;

  return (
    <div className="editor-overlay" onClick={onClose}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <h2 style={{ margin: 0, whiteSpace: 'nowrap' }}>Pine Script Editor</h2>
            {scripts.length > 0 && (
              <select
                value={currentScriptId || ''}
                onChange={handleDropdownChange}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#1a1a2e',
                  color: '#e0e0e0',
                  border: '1px solid #0f3460',
                  borderRadius: '4px',
                  fontSize: '13px',
                  minWidth: 0,
                }}
              >
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="editor-actions">
            {scripts.length > 0 && (
              <>
                <button onClick={handleNewScript}>New</button>
                <button onClick={handleDelete} disabled={!currentScriptId}>Delete</button>
                <button
                  className="primary"
                  onClick={() => {
                    if (currentScriptId) onRun(currentScriptId, source);
                  }}
                  disabled={!currentScriptId}
                >
                  Run (Ctrl+Enter)
                </button>
              </>
            )}
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        {currentScript && (
          <div style={{ padding: '4px 16px', background: '#1a1a2e', fontSize: '11px', color: '#888', borderBottom: '1px solid #0f3460' }}>
            <span style={{
              padding: '1px 5px',
              background: currentScript.scriptType === 'strategy' ? '#1a3a2e' : '#2e2a1a',
              color: currentScript.scriptType === 'strategy' ? '#4caf50' : '#ff9800',
              borderRadius: '3px',
              fontSize: '10px',
            }}>
              {currentScript.scriptType}
            </span>
            {(() => {
              const pineVersion = extractVersion(source);
              return pineVersion ? (
                <span style={{
                  marginLeft: '6px',
                  padding: '1px 5px',
                  background: '#1a2a3e',
                  color: '#64b5f6',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}>
                  v{pineVersion}
                </span>
              ) : null;
            })()}
            <span style={{ marginLeft: '8px' }}>
              Updated {new Date(currentScript.updatedAt).toLocaleDateString()}
            </span>
          </div>
        )}
        <div className="editor-content">
          {loading ? (
            <div style={{ padding: '16px', color: '#888' }}>Loading scripts...</div>
          ) : scripts.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '16px',
              color: '#888',
            }}>
              <div style={{ fontSize: '15px', color: '#e0e0e0' }}>No scripts yet</div>
              <div style={{ fontSize: '13px', maxWidth: '320px', textAlign: 'center', lineHeight: '1.5' }}>
                Create your first Pine Script to get started. You can write indicators and strategies, then run them on the chart.
              </div>
              <button
                onClick={handleNewScript}
                style={{
                  padding: '10px 24px',
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Create Your First Script
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(e) => handleSourceChange(e.target.value)}
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
          )}
        </div>
      </div>
    </div>
  );
}
