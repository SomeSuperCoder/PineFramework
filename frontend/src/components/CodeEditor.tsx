import { useRef, useEffect, useState, useCallback } from 'react';
import { extractScriptName as extractName } from 'pine-framework/utils/script-name';
import { tokens } from '../theme/tokens';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex h-[90vh] w-[92vw] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[92vw]"
      >
        <DialogHeader className="flex flex-row items-center gap-2 border-b border-border px-4 py-3">
          <DialogTitle className="whitespace-nowrap text-sm">Pine Script Editor</DialogTitle>
          {(scripts.length > 0 || builtInScripts.length > 0) && (
            <select
              value={currentScriptId || ''}
              onChange={handleDropdownChange}
              className="min-w-0 flex-1 rounded-md border border-border bg-[var(--pf-canvas)] px-2 py-1.5 text-[13px] text-foreground outline-none"
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
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleNewScript}>
              New
            </Button>
            {currentScript && (
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (currentScriptId) onAdd(currentScriptId, source);
              }}
              disabled={!currentScriptId}
            >
              Add (Ctrl+Enter)
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogHeader>
        {currentScript && (
          <div className="flex items-center gap-1.5 border-b border-border bg-[var(--pf-canvas)] px-4 py-1 text-[11px] text-[var(--pf-steel-muted)]">
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: currentScript.scriptType === 'strategy' ? tokens.colors.semantic.successBg : tokens.colors.semantic.warningBg,
                color: currentScript.scriptType === 'strategy' ? tokens.colors.semantic.success : tokens.colors.semantic.warning,
              }}
            >
              {currentScript.scriptType}
            </span>
            {(() => {
              const pineVersion = extractVersion(source);
              return pineVersion ? (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{
                    background: tokens.colors.semantic.infoBg,
                    color: tokens.colors.semantic.info,
                  }}
                >
                  v{pineVersion}
                </span>
              ) : null;
            })()}
            <span className="ml-2">
              Updated {new Date(currentScript.updatedAt).toLocaleDateString()}
            </span>
          </div>
        )}
        {currentBuiltIn && (
          <div className="flex items-center gap-1.5 border-b border-border bg-[var(--pf-canvas)] px-4 py-1 text-[11px] text-[var(--pf-steel-muted)]">
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: currentBuiltIn.type === 'strategy' ? tokens.colors.semantic.successBg : tokens.colors.semantic.warningBg,
                color: currentBuiltIn.type === 'strategy' ? tokens.colors.semantic.success : tokens.colors.semantic.warning,
              }}
            >
              {currentBuiltIn.type}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: tokens.colors.semantic.warningBg,
                color: tokens.colors.semantic.warning,
              }}
            >
              Built-In
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-4 text-[var(--pf-steel-muted)]">Loading scripts...</div>
          ) : scripts.length === 0 && builtInScripts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-[var(--pf-steel-muted)]">
              <div className="text-[15px] text-foreground">No scripts yet</div>
              <div className="max-w-[320px] text-center text-[13px] leading-6">
                Create your first Pine Script to get started. You can write indicators and strategies, then run them on the chart.
              </div>
              <Button
                onClick={handleNewScript}
                className="bg-[var(--pf-semantic-success)] text-[var(--pf-ink)] hover:bg-[var(--pf-semantic-success-hover)]"
              >
                Create Your First Script
              </Button>
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
                backgroundColor: isBuiltIn ? tokens.colors.surface['2'] : tokens.colors.surface['1'],
                color: isBuiltIn ? tokens.colors.ink['2'] : tokens.colors.ink['1'],
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
      </DialogContent>
    </Dialog>
  );
}