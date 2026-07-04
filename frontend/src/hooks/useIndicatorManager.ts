import { useState, useCallback, useEffect, useRef } from 'react';

export interface RunningIndicator {
  id: string;
  scriptId: string;
  name: string;
  overlay: boolean;
  source: string;
  active: boolean;
}

export function useIndicatorManager() {
  const [indicators, setIndicators] = useState<RunningIndicator[]>([]);
  const onIndicatorRemovedCallbacksRef = useRef<Set<(indicatorIds: string[]) => void>>(new Set());

  const fetchIndicators = useCallback(async (): Promise<RunningIndicator[]> => {
    try {
      const res = await fetch('/api/indicators');
      const data = await res.json();
      const list: RunningIndicator[] = (data.indicators || []).map((ind: { id: string; scriptId: string; name: string; overlay: boolean; source: string }) => ({
        ...ind,
        active: true,
      }));
      setIndicators(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    fetchIndicators();
  }, [fetchIndicators]);

  const addIndicator = useCallback(async (
    scriptId: string,
    name: string,
    overlay: boolean,
    source: string,
  ): Promise<RunningIndicator | null> => {
    const existing = indicators.find((i) => i.scriptId === scriptId);
    if (existing) return existing;

    try {
      const res = await fetch('/api/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId, name, overlay, source }),
      });
      const data = await res.json();
      if (data.indicator) {
        const newIndicator: RunningIndicator = { ...data.indicator, active: true };
        setIndicators((prev) => [...prev, newIndicator]);
        return newIndicator;
      }
    } catch {
      // ignore
    }
    return null;
  }, [indicators]);

  const removeIndicator = useCallback(async (indicatorId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/indicators/${indicatorId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setIndicators((prev) => prev.filter((i) => i.id !== indicatorId));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const handleIndicatorRemoved = useCallback((indicatorIds: string[]) => {
    setIndicators((prev) => prev.filter((i) => !indicatorIds.includes(i.id)));
    for (const cb of onIndicatorRemovedCallbacksRef.current) {
      cb(indicatorIds);
    }
  }, []);

  const getOverlayIndicators = useCallback(() => {
    return indicators.filter((i) => i.overlay);
  }, [indicators]);

  const getPaneIndicators = useCallback(() => {
    return indicators.filter((i) => !i.overlay);
  }, [indicators]);

  const registerOnIndicatorRemoved = useCallback((callback: (indicatorIds: string[]) => void) => {
    onIndicatorRemovedCallbacksRef.current.add(callback);
    return () => {
      onIndicatorRemovedCallbacksRef.current.delete(callback);
    };
  }, []);

  return {
    indicators,
    addIndicator,
    removeIndicator,
    handleIndicatorRemoved,
    getOverlayIndicators,
    getPaneIndicators,
    fetchIndicators,
    registerOnIndicatorRemoved,
  };
}
