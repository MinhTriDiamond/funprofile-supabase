import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card } from '@/components/ui/card';
import { Loader2, History as HistoryIcon } from 'lucide-react';
import { BoxTierBadge } from './BoxTierBadge';
import { MysteryBoxRewardCard, formatRewardLabel } from './MysteryBoxRewardCard';
import type { BoxTier, BoxRewardPayload } from '../types';

interface OpenLogRow {
  id: string;
  opened_at: string;
  rng_seed: string;
  reward_jsonb: BoxRewardPayload | null;
  definition: { tier: BoxTier; name_vi: string } | null;
}

export function MysteryBoxHistoryTab() {
  const { userId } = useCurrentUser();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['mystery-box-history', userId],
    enabled: !!userId,
    queryFn: async (): Promise<OpenLogRow[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } } } } })
        .from('mystery_box_open_log')
        .select('id, opened_at, rng_seed, reward_jsonb, definition:mystery_box_definitions!box_def_id(tier, name_vi)')
        .eq('user_id', userId!)
        .order('opened_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OpenLogRow[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Bạn chưa mở hộp nào. Sau khi mở, lịch sử sẽ hiện ở đây (50 lần gần nhất).
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        <HistoryIcon className="w-4 h-4" /> 50 lần mở gần nhất
      </h2>
      {logs.map(log => {
        const tier = log.definition?.tier ?? 'common';
        const reward = log.reward_jsonb;
        return (
          <Card key={log.id} className="flex items-center gap-3 p-3">
            <BoxTierBadge tier={tier} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {log.definition?.name_vi ?? 'Hộp bí ẩn'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {reward ? formatRewardLabel(reward) : '—'}
              </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {new Date(log.opened_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
