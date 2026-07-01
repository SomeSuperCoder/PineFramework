import { useState, useEffect, useCallback } from 'react';

export interface ScriptEntry {
  id: string;
  name: string;
  source: string;
  scriptType: 'strategy' | 'indicator';
  createdAt: number;
  updatedAt: number;
}

interface ScriptBankPanelProps {
  onLoadScript: (source: string) => void;
}

async function fetchScripts(q?: string): Promise<{ scripts: ScriptEntry[]; activeScriptId: string | null }> {
  const url = q ? `/api/scripts?q=${encodeURIComponent(q)}` : '/api/scripts';
  const res = await fetch(url);
  return res.json();
}

async function setActiveScript(scriptId: string): Promise<{ script: ScriptEntry }> {
  const res = await fetch('/api/scripts/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptId }),
  });
  return res.json();
}

async function createScript(name: string, source: string): Promise<{ script: ScriptEntry }> {
  const res = await fetch('/api/scripts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source }),
  });
  return res.json();
}

async function updateScript(id: string, updates: { name?: string; source?: string }): Promise<{ script: ScriptEntry }> {
  const res = await fetch(`/api/scripts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

async function deleteScript(id: string): Promise<void> {
  await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
}

export function ScriptBankPanel({ onLoadScript }: ScriptBankPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadScripts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchScripts(searchQuery || undefined);
      setScripts(data.scripts);
      setActiveScriptId(data.activeScriptId);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (isOpen) loadScripts();
  }, [isOpen, loadScripts]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(loadScripts, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, isOpen, loadScripts]);

  const handleSelect = async (script: ScriptEntry) => {
    try {
      await setActiveScript(script.id);
      setActiveScriptId(script.id);
      onLoadScript(script.source);
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const result = await createScript(newName, newSource);
      setScripts((prev) => [...prev, result.script]);
      setActiveScriptId(result.script.id);
      setNewName('');
      setNewSource('');
      setShowCreate(false);
      onLoadScript(result.script.source);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (script: ScriptEntry) => {
    setEditingId(script.id);
    setEditName(script.name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const result = await updateScript(editingId, { name: editName });
      setScripts((prev) => prev.map((s) => (s.id === editingId ? result.script : s)));
      setEditingId(null);
      setEditName('');
    } catch {
      // ignore
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId || deleting) return;
    setDeleting(true);
    try {
      await deleteScript(confirmDeleteId);
      setScripts((prev) => prev.filter((s) => s.id !== confirmDeleteId));
      if (activeScriptId === confirmDeleteId) {
        setActiveScriptId(null);
      }
      setConfirmDeleteId(null);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '200px',
          right: '20px',
          zIndex: 100,
          padding: '10px 16px',
          background: '#0f3460',
          color: '#e0e0e0',
          border: '1px solid #2196f3',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {isOpen ? '✕ Close Bank' : '📚 Scripts'}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: '60px',
            right: '20px',
            width: '420px',
            maxHeight: 'calc(100vh - 180px)',
            overflowY: 'auto',
            background: '#16213e',
            border: '1px solid #0f3460',
            borderRadius: '8px',
            padding: '20px',
            zIndex: 99,
            color: '#e0e0e0',
            fontSize: '13px',
          }}
        >
          <h3 style={{ margin: '0 0 12px', color: '#2196f3' }}>Script Bank</h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scripts..."
              style={{
                flex: 1,
                padding: '6px',
                background: '#1a1a2e',
                color: '#e0e0e0',
                border: '1px solid #0f3460',
                borderRadius: '4px',
              }}
            />
            <button
              onClick={() => {
                setShowCreate(!showCreate);
                setNewName('');
                setNewSource('');
              }}
              style={{
                padding: '6px 12px',
                background: '#4caf50',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + New
            </button>
          </div>

          {showCreate && (
            <div
              style={{
                marginBottom: '12px',
                padding: '12px',
                background: '#1a1a2e',
                borderRadius: '4px',
                border: '1px solid #0f3460',
              }}
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Script name"
                style={{
                  width: '100%',
                  padding: '6px',
                  marginBottom: '8px',
                  background: '#16213e',
                  color: '#e0e0e0',
                  border: '1px solid #0f3460',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
              <textarea
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="Paste Pine Script source code..."
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '8px',
                  background: '#16213e',
                  color: '#d4d4d4',
                  border: '1px solid #0f3460',
                  borderRadius: '4px',
                  fontFamily: "'Fira Code', monospace",
                  fontSize: '12px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                spellCheck={false}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  style={{
                    padding: '6px 12px',
                    background: creating || !newName.trim() ? '#333' : '#4caf50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: '6px 12px',
                    background: '#333',
                    color: '#e0e0e0',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading && <div style={{ color: '#888', marginBottom: '8px' }}>Loading...</div>}

          {!loading && scripts.length === 0 && (
            <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>
              {searchQuery ? 'No scripts match your search.' : 'No scripts saved yet. Click "+ New" to create one.'}
            </div>
          )}

          {scripts.map((script) => (
            <div
              key={script.id}
              style={{
                padding: '10px',
                marginBottom: '6px',
                background: activeScriptId === script.id ? '#1a3a5c' : '#1a1a2e',
                borderRadius: '4px',
                border: activeScriptId === script.id ? '1px solid #2196f3' : '1px solid #0f3460',
                cursor: 'pointer',
              }}
              onClick={() => handleSelect(script)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                {editingId === script.id ? (
                  <div style={{ display: 'flex', gap: '4px', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        background: '#16213e',
                        color: '#e0e0e0',
                        border: '1px solid #2196f3',
                        borderRadius: '3px',
                        fontSize: '13px',
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit || !editName.trim()}
                      style={{
                        padding: '2px 6px',
                        background: '#2196f3',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '2px 6px',
                        background: '#333',
                        color: '#e0e0e0',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ fontWeight: 'bold', color: activeScriptId === script.id ? '#2196f3' : '#e0e0e0' }}>
                    {script.name}
                    {activeScriptId === script.id && (
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: '#4caf50' }}>● ACTIVE</span>
                    )}
                  </div>
                )}

                {editingId !== script.id && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleStartEdit(script)}
                      style={{
                        padding: '2px 6px',
                        background: '#333',
                        color: '#aaa',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      Edit
                    </button>
                    {confirmDeleteId === script.id ? (
                      <>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          style={{
                            padding: '2px 6px',
                            background: '#e94560',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          {deleting ? '...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            padding: '2px 6px',
                            background: '#333',
                            color: '#e0e0e0',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(script.id)}
                        style={{
                          padding: '2px 6px',
                          background: '#333',
                          color: '#e94560',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: '#888' }}>
                <span style={{
                  padding: '1px 5px',
                  background: script.scriptType === 'strategy' ? '#1a3a2e' : '#2e2a1a',
                  color: script.scriptType === 'strategy' ? '#4caf50' : '#ff9800',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}>
                  {script.scriptType}
                </span>
                <span style={{ marginLeft: '8px' }}>
                  Updated {new Date(script.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
