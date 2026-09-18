import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SearchHistoryItem,
  getHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getFilteredHistory,
  syncFromCloud,
  syncToCloud,
  clearCloudHistory,
  removeCloudItem,
  isHistoryEnabled,
  setHistoryEnabled,
} from '@/lib/searchHistory';

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [enabled, setEnabled] = useState(isHistoryEnabled);
  const syncedRef = useRef(false);

  // Load local on mount + cloud sync once
  useEffect(() => {
    setHistory(getHistory());

    if (!syncedRef.current) {
      syncedRef.current = true;
      syncFromCloud().then((merged) => setHistory(merged));
    }
  }, []);

  const addItem = useCallback(
    (query: string, type: SearchHistoryItem['type'] = 'text', metadata?: SearchHistoryItem['metadata']) => {
      if (!enabled) return;
      const item = addToHistory(query, type, metadata);
      if (!item) return; // bị reject vì không hợp lệ
      setHistory(getHistory());
      // Background cloud sync
      syncToCloud(item);
    },
    [enabled]
  );

  const removeItem = useCallback((id: string) => {
    const items = getHistory();
    const item = items.find((i) => i.id === id);
    removeFromHistory(id);
    setHistory(getHistory());
    if (item) removeCloudItem(item.query, item.type);
  }, []);

  const clearAll = useCallback(() => {
    clearHistory();
    setHistory([]);
    clearCloudHistory();
  }, []);

  const toggleEnabled = useCallback((val: boolean) => {
    setEnabled(val);
    setHistoryEnabled(val);
  }, []);

  const filteredHistory = useCallback(
    (prefix: string, limit = 5) => getFilteredHistory(prefix, limit),
    []
  );

  return {
    history,
    addItem,
    removeItem,
    clearAll,
    filteredHistory,
    isEnabled: enabled,
    toggleEnabled,
  };
}
