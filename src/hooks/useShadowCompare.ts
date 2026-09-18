/**
 * useShadowCompare — chạy ngầm cùng UI Legacy để so sánh count + sum với Unified.
 *
 * - Sampling theo `app_settings.unified_shadow_sampling` (0..1). Admin luôn 1.0.
 * - Mỗi mount chỉ chạy tối đa 1 lần / surface / phiên.
 * - Khi flag `unified_tx_read_enabled` ON: KHÔNG chạy (đã unified).
 * - Khi `legacy.count` chưa load xong (null/undefined): bỏ qua.
 * - Fire-and-forget; lỗi/timeout không ảnh hưởng UI.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useUnifiedHistoryEnabled } from '@/hooks/useUnifiedHistoryEnabled';

interface ShadowInput {
  surface:
    | 'wallet_recent'
    | 'wallet_history'
    | 'profile_history'
    | 'donations'
    /** Batch 2.3.1 — probe `usePublicDonationHistory` trên HistoryTab (`/wallet/history`) & WalletTransactionHistory (`/:username`). */
    | 'public_profile_history';
  legacyCount: number | null | undefined;
  legacySumIn?: number | null;
  legacySumOut?: number | null;
  targetUserId?: string | null;
  /**
   * Scope RPC unified để probe. Mặc định 'self'. Dùng 'profile' khi đo
   * guest-view của user khác (WalletTransactionHistory).
   */
  scope?: 'self' | 'profile';
}

const ranSet = new Set<string>();

function useShadowSampling() {
  const { data } = useQuery({
    queryKey: ['app-settings', 'unified_shadow_sampling'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'unified_shadow_sampling')
        .maybeSingle();
      const v = data?.value as unknown;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return Number(v) || 0;
      return 0;
    },
  });
  return Number(data ?? 0);
}

export function useShadowCompare(input: ShadowInput) {
  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminRole();
  const { enabled: unifiedOn } = useUnifiedHistoryEnabled();
  const sampling = useShadowSampling();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (unifiedOn) return;
    if (!userId) return;
    if (input.legacyCount == null) return;

    const scope = input.scope ?? 'self';
    const probeTarget = input.targetUserId ?? userId;
    const key = `${input.surface}:${probeTarget}`;
    if (ranSet.has(key)) return;

    const rate = isAdmin ? 1 : sampling;
    if (!(rate > 0 && Math.random() < rate)) return;

    fired.current = true;
    ranSet.add(key);

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_unified_summary', {
          _scope: scope,
          _target_user_id: probeTarget,
        });
        if (error) return;
        const summary = (data || {}) as { total_count?: number; sum_in?: number; sum_out?: number };
        const uCount = Number(summary.total_count ?? 0);
        const uIn = Number(summary.sum_in ?? 0);
        const uOut = Number(summary.sum_out ?? 0);

        const cDiff = uCount - input.legacyCount!;
        const inDiff = input.legacySumIn != null ? uIn - input.legacySumIn : 0;
        const outDiff = input.legacySumOut != null ? uOut - input.legacySumOut : 0;
        const hasDiff = cDiff !== 0 || Math.abs(inDiff) > 1e-8 || Math.abs(outDiff) > 1e-8;
        if (!hasDiff) return;

        const diff_type = cDiff !== 0 ? 'count_mismatch' : 'sum_mismatch';
        await supabase.functions.invoke('tx-shadow-report', {
          body: {
            surface: input.surface,
            diff_type,
            legacy_count: input.legacyCount,
            unified_count: uCount,
            legacy_sum: (input.legacySumIn ?? 0) + (input.legacySumOut ?? 0),
            unified_sum: uIn + uOut,
            details: {
              cDiff, inDiff, outDiff,
              scope,
              targetUserId: probeTarget,
              isAdmin,
            },
          },
        });
      } catch { /* fire-and-forget */ }
      finally { clearTimeout(timeout); }
    })();

    return () => { clearTimeout(timeout); ctrl.abort(); };
  }, [input.surface, input.legacyCount, input.legacySumIn, input.legacySumOut, input.targetUserId, input.scope, userId, isAdmin, sampling, unifiedOn]);
}
