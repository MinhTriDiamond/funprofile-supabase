import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'fun_search_history_v1';
const ENABLED_KEY = 'fun_search_history_enabled';
const MAX_ITEMS = 20;
const MIN_QUERY_LENGTH = 3;

/** Trim, collapse whitespace, lowercase. */
export function normalizeQuery(q: string): string {
  return (q ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** EVM/BTC address detector — bypass length check. */
function isWalletAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s)
    || /^(bc1[a-z0-9]{20,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/.test(s);
}

/**
 * Validate query before saving.
 * - text: >=3 chars, not whitespace/special-only
 * - user (@username) and wallet address: bypass length rule
 */
export function isValidQuery(query: string, type: SearchHistoryItem['type'] = 'text'): boolean {
  const raw = (query ?? '').trim();
  if (!raw) return false;
  if (/^[\W_]+$/.test(raw)) return false; // chỉ ký tự đặc biệt
  if (type === 'user' && raw.startsWith('@') && raw.length >= 2) return true;
  if (isWalletAddress(raw)) return true;
  const norm = normalizeQuery(raw);
  return norm.length >= MIN_QUERY_LENGTH;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  type: 'text' | 'user' | 'post';
  metadata?: {
    userId?: string;
    username?: string;
    avatarUrl?: string | null;
    [key: string]: unknown;
  };
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isHistoryEnabled(): boolean {
  try {
    const val = localStorage.getItem(ENABLED_KEY);
    return val === null ? true : val === 'true';
  } catch { /* localStorage unavailable — safe to ignore */
    return true;
  }
}

export function setHistoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch { /* localStorage unavailable — safe to ignore */ }
}

export function getHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items: SearchHistoryItem[] = JSON.parse(raw);
    return items.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
  } catch { /* localStorage parse error — safe to ignore */
    return [];
  }
}

function saveHistory(items: SearchHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* localStorage full or unavailable — safe to ignore */ }
}

export function addToHistory(
  query: string,
  type: SearchHistoryItem['type'] = 'text',
  metadata?: SearchHistoryItem['metadata']
): SearchHistoryItem | null {
  // Validate + normalize trước khi lưu
  if (!isValidQuery(query, type)) return null;

  // Text → normalize. User/post → giữ nguyên case (vd "@angelGiau") nhưng trim.
  const cleanQuery = type === 'text' ? normalizeQuery(query) : query.trim();

  const items = getHistory();
  const now = new Date().toISOString();
  const existingIdx = items.findIndex(
    (i) => i.query.toLowerCase() === cleanQuery.toLowerCase() && i.type === type
  );

  let item: SearchHistoryItem;

  if (existingIdx >= 0) {
    item = items[existingIdx];
    item.useCount += 1;
    item.lastUsedAt = now;
    if (metadata) item.metadata = { ...item.metadata, ...metadata };
    items.splice(existingIdx, 1);
    items.unshift(item);
  } else {
    item = { id: generateId(), query: cleanQuery, type, metadata, useCount: 1, lastUsedAt: now, createdAt: now };
    items.unshift(item);
  }

  // Trim to max
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  saveHistory(items);
  return item;
}

export function removeFromHistory(id: string): void {
  const items = getHistory().filter((i) => i.id !== id);
  saveHistory(items);
}

export function clearHistory(): void {
  saveHistory([]);
}

export function getFilteredHistory(prefix: string, limit = 10): SearchHistoryItem[] {
  const lower = prefix.toLowerCase();
  return getHistory()
    .filter((i) => i.query.toLowerCase().startsWith(lower))
    .slice(0, limit);
}

// ---- Cloud sync ----
// search_history table is not in generated types — cast at call site
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchHistoryTable = () => (supabase as any).from('search_history');

export async function syncToCloud(item: SearchHistoryItem): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await searchHistoryTable().upsert(
      {
        user_id: session.user.id,
        query: item.query,
        type: item.type,
        metadata: item.metadata ?? {},
        use_count: item.useCount,
        last_used_at: item.lastUsedAt,
      },
      { onConflict: 'user_id,query,type' }
    );
  } catch { /* cloud sync failure — non-critical, local copy preserved */ }
}

export async function syncFromCloud(): Promise<SearchHistoryItem[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return getHistory();

    const { data } = await searchHistoryTable()
      .select('*')
      .eq('user_id', session.user.id)
      .order('last_used_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return getHistory();

    const local = getHistory();
    const merged = [...local];

    for (const cloud of data) {
      const key = `${cloud.query.toLowerCase()}::${cloud.type}`;
      const localIdx = merged.findIndex(
        (i) => `${i.query.toLowerCase()}::${i.type}` === key
      );
      if (localIdx >= 0) {
        // Keep whichever is more recent
        const localItem = merged[localIdx];
        if (new Date(cloud.last_used_at) > new Date(localItem.lastUsedAt)) {
          localItem.lastUsedAt = cloud.last_used_at;
          localItem.useCount = Math.max(localItem.useCount, cloud.use_count);
          if (cloud.metadata) localItem.metadata = { ...localItem.metadata, ...cloud.metadata };
        }
      } else {
        merged.push({
          id: cloud.id,
          query: cloud.query,
          type: cloud.type,
          metadata: cloud.metadata,
          useCount: cloud.use_count,
          lastUsedAt: cloud.last_used_at,
          createdAt: cloud.created_at,
        });
      }
    }

    merged.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
    if (merged.length > MAX_ITEMS) merged.length = MAX_ITEMS;
    saveHistory(merged);
    return merged;
  } catch { /* cloud sync failure — return local copy */
    return getHistory();
  }
}

export async function clearCloudHistory(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await searchHistoryTable().delete().eq('user_id', session.user.id);
  } catch { /* cloud deletion failure — non-critical */ }
}

export async function removeCloudItem(query: string, type: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await searchHistoryTable()
      .delete()
      .eq('user_id', session.user.id)
      .eq('query', query)
      .eq('type', type);
  } catch { /* cloud deletion failure — non-critical */ }
}
