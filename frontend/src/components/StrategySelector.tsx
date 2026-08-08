import { useState, useEffect, useRef, useCallback, useId } from 'react';

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

interface MergedStrategy {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
  isBuiltIn: boolean;
}

interface StrategySelectorProps {
  backendUrl: string;
  value: string;
  onChange: (source: string, name: string, id: string) => void;
  /** Optional visible label; renders a real <label htmlFor> when provided (config-bar a11y). */
  label?: string;
  /** Optional search-input placeholder; defaults to the current text. */
  placeholder?: string;
  /** Optional fixed height for the control (config-bar sizing). */
  height?: number;
}

export function StrategySelector({ backendUrl, value, onChange, label, placeholder = 'Search strategies...', height }: StrategySelectorProps) {
  const inputId = useId();
  const listId = useId();
  const heightStyle = height !== undefined ? { height } : undefined;
  const [strategies, setStrategies] = useState<MergedStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const [useRawPaste, setUseRawPaste] = useState(false);
  const [rawSource, setRawSource] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch(`${backendUrl}/api/scripts`),
        fetch(`${backendUrl}/api/scripts/built-in`),
      ]);
      const listData = await listRes.json();
      const builtInData = await builtInRes.json();

      const userScripts: MergedStrategy[] = (listData.scripts || [])
        .filter((s: ScriptEntry) => s.scriptType === 'strategy')
        .map((s: ScriptEntry) => ({
          id: s.id,
          name: s.name,
          source: s.source,
          type: s.scriptType,
          isBuiltIn: false,
        }));

      const builtInScripts: MergedStrategy[] = (builtInData.scripts || [])
        .filter((s: BuiltInScript) => s.type === 'strategy')
        .map((s: BuiltInScript) => ({
          id: s.id,
          name: s.name,
          source: s.source,
          type: s.type,
          isBuiltIn: true,
        }));

      setStrategies([...userScripts, ...builtInScripts]);
    } catch {
      setError('Could not load strategies. Is the backend running?');
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightIndex(0);
      if (strategies.length === 0 && !error) {
        fetchStrategies();
      }
    }
  }, [isOpen, fetchStrategies, strategies.length, error]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filtered = strategies.filter((s) =>
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((s: MergedStrategy) => {
    setSelectedName(s.name);
    setSearch(s.name);
    setIsOpen(false);
    onChange(s.source, s.name, s.id);
    setUseRawPaste(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex]);
      }
    }
  }, [filtered, highlightIndex, handleSelect]);

  const sourceLoaded = value.length > 0;
  const sourceLabel = selectedName || (sourceLoaded ? `Source loaded (${value.length} bytes)` : '');

  if (useRawPaste) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#888', fontSize: 11 }}>Paste Pine Script Strategy Source:</span>
          <button
            onClick={() => {
              setUseRawPaste(false);
              setRawSource('');
            }}
            style={{
              padding: '2px 8px', background: '#1a1a2e', color: '#64b5f6',
              border: '1px solid #333', borderRadius: 3, cursor: 'pointer',
              fontSize: 10,
            }}
          >
            ← Select from list
          </button>
        </div>
        <textarea
          value={rawSource}
          onChange={(e) => { setRawSource(e.target.value); onChange(e.target.value, '', ''); }}
          placeholder="//@version=5&#10;strategy('My Strategy')&#10;if close > open&#10;  strategy.entry('long', strategy.long)"
          rows={4}
          style={{
            width: '100%', background: '#111128', color: '#e0e0e0',
            border: '1px solid #333', borderRadius: 4, padding: '6px 8px',
            fontSize: 11, fontFamily: 'monospace', resize: 'vertical',
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label !== undefined ? (
        <label htmlFor={inputId} style={{ color: '#aaa', fontWeight: 600, marginBottom: 6, fontSize: 12, display: 'block' }}>
          {label}
        </label>
      ) : (
        <div style={{ color: '#aaa', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
          Strategy
        </div>
      )}
      <div
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px', background: '#111128', color: selectedName ? '#e0e0e0' : '#888',
          border: `1px solid ${isOpen ? '#64b5f6' : '#333'}`,
          borderRadius: 4, cursor: 'pointer', fontSize: 11, minHeight: 28,
          ...heightStyle,
        }}
      >
        <span>
          {selectedName
            ? <><span style={{ color: '#4caf50' }}>✓</span> {selectedName}</>
            : sourceLoaded
              ? <span style={{ color: '#888' }}>{sourceLabel}</span>
              : 'Select a strategy...'}
        </span>
        <span style={{ color: '#666', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#1a1a2e', border: '1px solid #333', borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', marginTop: 2, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px', borderBottom: '1px solid #222', ...heightStyle }}>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="quick-adder-search"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', background: '#111128', color: '#e0e0e0',
                border: '1px solid #333', borderRadius: 3, padding: '6px 8px',
                fontSize: 11, ...heightStyle,
              }}
            />
          </div>

          <div ref={listRef} id={listId} className="quick-adder-list" style={{ maxHeight: 200, overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: '12px', color: '#888', fontSize: 11, textAlign: 'center' }}>
                Loading strategies...
              </div>
            ) : error ? (
              <div style={{ padding: '12px' }}>
                <div style={{ color: '#e94560', fontSize: 11, marginBottom: 6 }}>{error}</div>
                <button
                  onClick={fetchStrategies}
                  style={{
                    padding: '4px 12px', background: '#1a1a2e', color: '#64b5f6',
                    border: '1px solid #64b5f6', borderRadius: 3, cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '12px', color: '#888', fontSize: 11, textAlign: 'center' }}>
                {search
                  ? `No strategies matching "${search}"`
                  : 'No strategies found. Write one in the editor first.'}
              </div>
            ) : (
              filtered.map((s, i) => (
                <div
                  key={s.id}
                  className={`quick-adder-item ${i === highlightIndex ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(s)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  style={{
                    padding: '6px 8px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    background: i === highlightIndex ? '#1a2a3a' : 'transparent',
                    color: i === highlightIndex ? '#fff' : '#e0e0e0',
                    fontSize: 11, borderBottom: '1px solid #1a1a2e',
                  }}
                >
                  <span>{s.name}</span>
                  <span className="quick-adder-item-badges" style={{ display: 'flex', gap: 4 }}>
                    <span className={`badge badge-type badge-${s.type}`}
                      style={{
                        padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                        background: s.type === 'strategy' ? '#1a3328' : '#1a2a3a',
                        color: s.type === 'strategy' ? '#4caf50' : '#64b5f6',
                      }}
                    >
                      {s.type === 'strategy' ? 'STG' : 'IND'}
                    </span>
                    {s.isBuiltIn && (
                      <span className="badge badge-built-in"
                        style={{
                          padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                          background: '#2a1a3a', color: '#b388ff',
                        }}
                      >
                        Built-In
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Paste as fallback */}
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setUseRawPaste(true)}
          style={{
            padding: '2px 8px', background: 'transparent', color: '#666',
            border: '1px solid #333', borderRadius: 3, cursor: 'pointer',
            fontSize: 10,
          }}
          title="Paste raw Pine Script code instead"
        >
          Paste raw source
        </button>
      </div>
    </div>
  );
}