import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LiveMessageRow } from '@/types/realtimeRows';

export interface LiveMessage {
  id: number;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username: string | null;
    avatar_url: string | null;
  };
}

// ── Module-level profile cache (shared across hook instances) ──
const profileCache = new Map<string, { username: string | null; avatar_url: string | null }>();
let pendingIds = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const batchCallbacks: Array<() => void> = [];

function scheduleBatchFetch() {
  if (batchTimer) return;
  batchTimer = setTimeout(async () => {
    const ids = [...pendingIds];
    pendingIds = new Set();
    batchTimer = null;
    const cbs = batchCallbacks.splice(0);

    if (ids.length === 0) { cbs.forEach(cb => cb()); return; }

    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids);

    for (const p of data || []) {
      profileCache.set(p.id, { username: p.username, avatar_url: p.avatar_url });
    }
    // Mark unfound ids so we don't re-fetch
    for (const id of ids) {
      if (!profileCache.has(id)) {
        profileCache.set(id, { username: null, avatar_url: null });
      }
    }
    cbs.forEach(cb => cb());
  }, 500); // 500ms debounce to batch multiple profile requests
}

function getCachedProfile(userId: string) {
  return profileCache.get(userId);
}

function requestProfile(userId: string): Promise<void> {
  if (profileCache.has(userId)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    pendingIds.add(userId);
    batchCallbacks.push(resolve);
    scheduleBatchFetch();
  });
}

async function enrichProfiles(rows: Array<{ user_id: string }>) {
  const uncached = [...new Set(rows.map((r) => r.user_id))].filter(id => !profileCache.has(id));
  if (uncached.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', uncached);
    for (const p of data || []) {
      profileCache.set(p.id, { username: p.username, avatar_url: p.avatar_url });
    }
  }
  return profileCache;
}

// ── Rate limiter: 1 message per second ──
const lastSendTimes = new Map<string, number>();

export function useLiveMessages(sessionId?: string) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100); // reduced from 200

      if (!active) return;
      if (error || !data) {
        setMessages([]);
        setIsLoading(false);
        return;
      }

      await enrichProfiles(data as Array<{ user_id: string }>);
      if (!active) return;

      setMessages(
        (data as Array<{ id: number; session_id: string; user_id: string; content: string; created_at: string }>).map((row) => ({
          id: row.id,
          session_id: row.session_id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profile: getCachedProfile(row.user_id),
        }))
      );
      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-messages:${sessionId}:${channelSuffix.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const row = payload.new as LiveMessageRow;

          // Use batched profile cache instead of individual query
          await requestProfile(row.user_id);

          const newMsg: LiveMessage = {
            id: row.id,
            session_id: row.session_id,
            user_id: row.user_id,
            content: row.content,
            created_at: row.created_at,
            profile: getCachedProfile(row.user_id),
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const withoutOptimistic = prev.filter(
              (m) => !(m.id < 0 && m.user_id === row.user_id && m.content === row.content)
            );
            return [...withoutOptimistic, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const value = content.trim();
      if (!sessionId || !value) return;

      // Rate limit: 1 message per second per session
      const now = Date.now();
      const lastSend = lastSendTimes.get(sessionId) || 0;
      if (now - lastSend < 1000) {
        throw new Error('Bạn đang gửi quá nhanh, vui lòng chờ 1 giây.');
      }

      // Use getSession (local cache) instead of getUser (network call)
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      lastSendTimes.set(sessionId, now);

      const optimisticMsg: LiveMessage = {
        id: -Date.now(),
        session_id: sessionId,
        user_id: user.id,
        content: value,
        created_at: new Date().toISOString(),
        profile: getCachedProfile(user.id),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { error } = await supabase.from('live_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        content: value,
      });
      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        throw error;
      }
    },
    [sessionId]
  );

  return { messages, isLoading, sendMessage };
}
