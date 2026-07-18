import { useState, useEffect, useRef, useCallback } from 'react';

interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
}

interface BuiltInScript {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
}

interface QuickAdderPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (scriptId: string, source: string) => void;
}

interface MergedScript {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
  isBuiltIn: boolean;
}

export function QuickAdderPopup({ isOpen, onClose, onAdd }: QuickAdderPopupProps) {
  const [scripts, setScripts] = useState<MergedScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch('/api/scripts'),
        fetch('/api/scripts/built-in'),
      ]);
      const listData = await listRes.json();
      const builtInData = await builtInRes.json();

      const userScripts: MergedScript[] = (listData.scripts || []).map((s: ScriptEntry) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.scriptType,
        isBuiltIn: false,
      }));

      const builtInScripts: MergedScript[] = (builtInData.scripts || []).map((s: BuiltInScript) => ({
        id: s.id,
        name: s.name,
        source: s.source,
        type: s.type,
        isBuiltIn: true,
      }));

      setScripts([...userScripts, ...builtInScripts]);
    } catch {
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightIndex(0);
      fetchScripts();
    }
  }, [isOpen, fetchScripts]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filtered = scripts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightIndex] as HTMLElement | undefined;
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleAdd = useCallback((s: MergedScript) => {
    onAdd(s.id, s.source);
  }, [onAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        handleAdd(filtered[highlightIndex]);
      }
    }
  }, [onClose, filtered, highlightIndex, handleAdd]);

  if (!isOpen) return null;

  return (
    <div className="quick-adder-overlay" onClick={onClose}>
      <div className="quick-adder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quick-adder-header">
          <input
            ref={inputRef}
            type="text"
            className="quick-adder-search"
            placeholder="Search indicators & strategies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="quick-adder-close" onClick={onClose}>×</button>
        </div>
        <div className="quick-adder-list" ref={listRef}>
          {loading ? (
            <div className="quick-adder-loading">Loading scripts...</div>
          ) : filtered.length === 0 ? (
            <div className="quick-adder-empty">No scripts found</div>
          ) : (
            filtered.map((s, i) => (
              <div
                key={s.id}
                className={`quick-adder-item ${i === highlightIndex ? 'highlighted' : ''}`}
                onClick={() => handleAdd(s)}
                onMouseEnter={() => setHighlightIndex(i)}
                title={s.name}
              >
                <span className="quick-adder-item-name">{s.name}</span>
                <span className="quick-adder-item-badges">
                  <span className={`badge badge-type badge-${s.type}`}>
                    {s.type === 'strategy' ? 'STG' : 'IND'}
                  </span>
                  {s.isBuiltIn && (
                    <span className="badge badge-built-in">Built-In</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
