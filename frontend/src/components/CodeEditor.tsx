import { useRef, useEffect, useState, useCallback } from 'react';

interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
  createdAt: number;
  updatedAt: number;
}

interface BuiltInScript {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
}

interface CodeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (scriptId: string, source: string) => void;
  initialScriptId?: string;
}

export const DEFAULT_CODE = `//@version=6
indicator("My Indicator", overlay=true)

// Calculate SMA
sma20 = ta.sma(close, 20)

// Plot SMA
plot(sma20, color=color.blue, linewidth=2)
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

export function CodeEditor({ isOpen, onClose, onAdd, initialScriptId }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [builtInScripts, setBuiltInScripts] = useState<BuiltInScript[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const [source, setSource] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentScriptIdRef = useRef<string | null>(null);
  const sourceRef = useRef(source);
  const builtInScriptsRef = useRef<BuiltInScript[]>([]);

  sourceRef.current = source;
  currentScriptIdRef.current = currentScriptId;
  builtInScriptsRef.current = builtInScripts;

  const loadScript = useCallback(async (id: string) => {
    try {
      const builtIn = builtInScriptsRef.current.find((s) => s.id === id);
      if (builtIn) {
        setCurrentScriptId(builtIn.id);
        setSource(builtIn.source);
        return;
      }
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

  const loadFirstScript = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch('/api/scripts'),
        fetch('/api/scripts/built-in'),
      ]);
      const listData = await listRes.json();
      const builtInData = await builtInRes.json();
      setScripts(listData.scripts || []);
      setBuiltInScripts(builtInData.scripts || []);
      if (listData.scripts?.length > 0) {
        await loadScript(listData.scripts[0].id);
      } else if (builtInData.scripts?.length > 0) {
        const first = builtInData.scripts[0];
        setCurrentScriptId(first.id);
        setSource(first.source);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loadScript]);

  useEffect(() => {
    if (isOpen) {
      if (initialScriptId) {
        (async () => {
          setLoading(true);
          try {
            const [listRes, builtInRes] = await Promise.all([
              fetch('/api/scripts'),
              fetch('/api/scripts/built-in'),
            ]);
            const listData = await listRes.json();
            const builtInData = await builtInRes.json();
            setScripts(listData.scripts || []);
            setBuiltInScripts(builtInData.scripts || []);
            await loadScript(initialScriptId);
          } catch {
            // ignore
          } finally {
            setLoading(false);
          }
        })();
      } else {
        loadFirstScript();
      }
    }
  }, [isOpen, loadFirstScript, loadScript, initialScriptId]);

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
        if (id) onAdd(id, src);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onAdd]);

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
          const builtInList = builtInScriptsRef.current;
          if (builtInList.length > 0) {
            const first = builtInList[0];
            setCurrentScriptId(first.id);
            setSource(first.source);
          } else {
            setCurrentScriptId(null);
            setSource(DEFAULT_CODE);
          }
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
  const currentBuiltIn = builtInScripts.find((s) => s.id === currentScriptId);
  const isBuiltIn = !!currentBuiltIn;

  if (!isOpen) return null;

  return (
    <div className="editor-overlay" onClick={onClose}>
      <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <h2 style={{ margin: 0, whiteSpace: 'nowrap' }}>Pine Script Editor</h2>
            {(scripts.length > 0 || builtInScripts.length > 0) && (
              <select
                value={currentScriptId || ''}
                onChange={handleDropdownChange}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#0d0d18',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  fontSize: '13px',
                  minWidth: 0,
                }}
              >
                {scripts.length > 0 && (
                  <optgroup label="My Scripts">
                    {scripts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
                {builtInScripts.length > 0 && (
                  <optgroup label="Built-In Tests">
                    {builtInScripts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
          <div className="editor-actions">
            <button onClick={handleNewScript}>New</button>
            {currentScript && (
              <button onClick={handleDelete}>Delete</button>
            )}
            <button
              className="primary"
              onClick={() => {
                if (currentScriptId) onAdd(currentScriptId, source);
              }}
              disabled={!currentScriptId}
            >
              Add (Ctrl+Enter)
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        {currentScript && (
          <div style={{ padding: '4px 16px', background: '#0d0d18', fontSize: '11px', color: '#888', borderBottom: '1px solid #111128' }}>
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
        {currentBuiltIn && (
          <div style={{ padding: '4px 16px', background: '#0d0d18', fontSize: '11px', color: '#888', borderBottom: '1px solid #111128' }}>
            <span style={{
              padding: '1px 5px',
              background: currentBuiltIn.type === 'strategy' ? '#1a3a2e' : '#2e2a1a',
              color: currentBuiltIn.type === 'strategy' ? '#4caf50' : '#ff9800',
              borderRadius: '3px',
              fontSize: '10px',
            }}>
              {currentBuiltIn.type}
            </span>
            <span style={{
              marginLeft: '6px',
              padding: '1px 5px',
              background: '#3e2a1a',
              color: '#ffb74d',
              borderRadius: '3px',
              fontSize: '10px',
            }}>
              Built-In
            </span>
          </div>
        )}
        <div className="editor-content">
          {loading ? (
            <div style={{ padding: '16px', color: '#888' }}>Loading scripts...</div>
          ) : scripts.length === 0 && builtInScripts.length === 0 ? (
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
              readOnly={isBuiltIn}
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: isBuiltIn ? '#151520' : '#1e1e1e',
                color: isBuiltIn ? '#999' : '#d4d4d4',
                border: 'none',
                padding: '16px',
                fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                tabSize: 2,
                cursor: isBuiltIn ? 'not-allowed' : 'text',
              }}
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
