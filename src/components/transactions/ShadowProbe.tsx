/**
 * ShadowProbe — chạy ngầm so sánh Legacy vs Unified cho 1 user.
 *
 * - Khi `unified_tx_read_enabled` ON: tự skip (đã unified).
 * - Sampling theo `app_settings.unified_shadow_sampling`. Admin luôn 1.0.
 * - Legacy count = SELECT COUNT(*) trên 3 bảng nguồn cho `targetUserId`.
 * - Unified count = `get_unified_summary(_target_user_id)`.
 * - Diff > 0 → POST `tx-shadow-report` (fire-and-forget, timeout 3s).
 *
 * Không render gì.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useUnifiedHistoryEnabled } from '@/hooks/useUnifiedHistoryEnabled';

interface Props {
  surface: 'wallet_recent' | 'wallet_history' | 'profile_history' | 'donations';
  /** User cần đo. Nếu null → dùng auth user. */
  targetUserId?: string | null;
}

const ranSet = new Set<string>();

async function getSampling(): Promise<number> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'unified_shadow_sampling')
      .maybeSingle();
    const v = data?.value as unknown;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v) || 0;
  } catch { /* ignore */ }
  return 0;
}

export function ShadowProbe({ surface, targetUserId }: Props) {
  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminRole();
  const { enabled: unifiedOn } = useUnifiedHistoryEnabled();
  const fired = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (fired.current) return;
    if (unifiedOn) return;
    const uid = targetUserId ?? userId;
    if (!uid) return;
    const key = `${surface}:${uid}`;
    if (ranSet.has(key)) return;

    let aborted = false;
    fired.current = true;
    ranSet.add(key);

    (async () => {
      try {
        const rate = isAdmin ? 1 : await getSampling();
        if (!(rate > 0 && Math.random() < rate)) return;
        if (aborted) return;

        // Legacy count — count rows on 3 source tables
        const [d, w, t] = await Promise.all([
          supabase.from('donations').select('id', { head: true, count: 'exact' })
            .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`),
          supabase.from('wallet_transfers').select('id', { head: true, count: 'exact' }).eq('user_id', uid),
          supabase.from('transactions').select('id', { head: true, count: 'exact' }).eq('user_id', uid),
        ]);
        const legacyCount = (d.count ?? 0) + (w.count ?? 0) + (t.count ?? 0);

        const { data: summary } = await supabase.rpc('get_unified_summary', { _scope: 'self', _target_user_id: uid });
        const s = (summary || {}) as { total_count?: number; sum_in?: number; sum_out?: number };
        const unifiedCount = Number(s.total_count ?? 0);
        const countDiff = unifiedCount - legacyCount;
        if (countDiff === 0) return; // perfect match — không cần report

        await supabase.functions.invoke('tx-shadow-report', {
          body: {
            surface,
            diff_type: 'count_mismatch',
            legacy_count: legacyCount,
            unified_count: unifiedCount,
            legacy_sum: null,
            unified_sum: Number(s.sum_in ?? 0) + Number(s.sum_out ?? 0),
            details: {
              legacy_breakdown: { donations: d.count, wallet_transfers: w.count, transactions: t.count },
              countDiff,
              targetUserId: uid,
            },
          },
        });
        setTick((n) => n + 1);
      } catch { /* fire-and-forget */ }
    })();

    return () => { aborted = true; };
  }, [surface, targetUserId, userId, isAdmin, unifiedOn]);

  return null;
}
