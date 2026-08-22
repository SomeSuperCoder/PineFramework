import { useState, useCallback } from 'react';

export interface MergedStrategy {
  id: string;
  name: string;
  source: string;
  type: 'strategy' | 'indicator';
  isBuiltIn: boolean;
}

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

/**
 * Shared strategy fetcher. Merges `/api/scripts` (user) + `/api/scripts/built-in`
 * and filters to strategies. Extracted from `StrategySelector` so the new
 * `StrategyMultiSelect` (and a future refactor of `StrategySelector`) reuse the
 * same merge logic instead of duplicating it.
 */
export function useStrategies() {
  const [strategies, setStrategies] = useState<MergedStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, builtInRes] = await Promise.all([
        fetch('/api/scripts'),
        fetch('/api/scripts/built-in'),
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
  }, []);

  return { strategies, loading, error, fetchStrategies };
}
