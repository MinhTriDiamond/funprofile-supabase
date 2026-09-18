/**
 * useUnifiedHistoryEnabled — đọc feature flag `app_settings.unified_tx_read_enabled`.
 *
 * - OFF (mặc định): tất cả surface render legacy.
 * - ON: render Unified Transaction History (component mới).
 *
 * Override qua URL `?unified_history=1|0` để admin QA route mới khi flag tắt.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

const QK = ['app-settings', 'unified_tx_read_enabled'] as const;

export function useUnifiedHistoryEnabled(): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'unified_tx_read_enabled')
        .maybeSingle();
      if (error) return false;
      const v = data?.value as unknown;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v === 'true' || v === '1';
      if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) {
        return Boolean((v as Record<string, unknown>).enabled);
      }
      return false;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const urlOverride = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('unified_history');
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  }, []);

  return {
    enabled: urlOverride ?? Boolean(data),
    isLoading,
  };
}
