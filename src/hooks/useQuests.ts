import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCallback, useEffect, useRef } from 'react';

export interface QuestDefinition {
  id: string;
  code: string;
  title_vi: string;
  title_en: string;
  description: string | null;
  category: string;
  ls_base: number;
  target_count: number;
  frequency: 'daily' | 'weekly' | 'once' | 'per_event';
  trust_tier_min: string;
  icon: string | null;
  sort_order: number;
}

export interface QuestProgress {
  id: string;
  quest_id: string;
  period_key: string;
  progress_count: number;
  target_count: number;
  completed_at: string | null;
  ls_awarded: number;
  ls_capped: boolean;
}

export interface QuestWithProgress extends QuestDefinition {
  progress?: QuestProgress;
  current: number;
}

function periodKey(freq: QuestDefinition['frequency']): string {
  const d = new Date();
  if (freq === 'daily') return d.toISOString().slice(0, 10);
  if (freq === 'weekly') {
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  if (freq === 'once') return 'lifetime';
  return d.toISOString();
}

const MIN_INVOKE_INTERVAL_MS = 15_000;

/**
 * Trigger quest-evaluate edge function then refetch quest queries.
 * Throttled to avoid spamming.
 */
export function useQuestEvaluator() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const lastInvokeRef = useRef<number>(0);

  return useCallback(async (force = false) => {
    if (!user?.id) return;
    const now = Date.now();
    if (!force && now - lastInvokeRef.current < MIN_INVOKE_INTERVAL_MS) return;
    lastInvokeRef.current = now;
    try {
      await supabase.functions.invoke('quest-evaluate', { body: { user_id: user.id } });
    } catch {
      /* ignore */
    } finally {
      qc.invalidateQueries({ queryKey: ['quests', user.id] });
      qc.invalidateQueries({ queryKey: ['quest-streak', user.id] });
    }
  }, [user?.id, qc]);
}

export function useQuests() {
  const { user } = useCurrentUser();
  const evaluate = useQuestEvaluator();

  // Auto-evaluate on mount + on window focus / visibility change
  useEffect(() => {
    if (!user?.id) return;
    evaluate(true);

    const onFocus = () => evaluate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    // Periodic re-evaluate (only when tab visible)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') evaluate();
    }, 30_000);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [user?.id, evaluate]);

  return useQuery({
    queryKey: ['quests', user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async (): Promise<QuestWithProgress[]> => {
      const { data: defs, error } = await supabase
        .from('quest_definitions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;

      const periods = Array.from(new Set((defs ?? []).map((d: any) => periodKey(d.frequency))));
      const { data: progress } = await supabase
        .from('quest_user_progress')
        .select('*')
        .eq('user_id', user!.id)
        .in('period_key', periods);

      const progressByQuest = new Map((progress ?? []).map((p: any) => [`${p.quest_id}|${p.period_key}`, p]));

      return (defs ?? []).map((d: any) => {
        const p = progressByQuest.get(`${d.id}|${periodKey(d.frequency)}`);
        return {
          ...d,
          progress: p as QuestProgress | undefined,
          current: p?.progress_count ?? 0,
        };
      });
    },
  });
}

export function useQuestStreak() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ['quest-streak', user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('quest_streaks')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ?? {
        user_id: user!.id,
        current_streak: 0,
        longest_streak: 0,
        freeze_passes_remaining: 0,
        total_quests_completed: 0,
        total_ls_from_quests: 0,
        last_active_date: null,
      };
    },
  });
}
