import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from 'sonner';

export interface ImpersonationAlert {
  id: string;
  victim_user_id: string;
  suspect_user_id: string;
  name_similarity: number;
  avatar_similarity: number;
  overall_score: number;
  status: 'pending' | 'victim_confirmed_impersonator' | 'victim_confirmed_self' | 'dismissed_by_admin' | 'auto_resolved';
  victim_response_at: string | null;
  details: {
    suspect?: { id: string; username: string; display_name?: string | null; full_name?: string | null; avatar_url?: string | null; created_at?: string };
    victim?: { id: string; username: string; display_name?: string | null; full_name?: string | null; avatar_url?: string | null; created_at?: string };
    signals?: { name_similarity: number; avatar_similarity: number; phash_distance?: number; trigger?: string };
  };
  created_at: string;
}

export function useImpersonationAlerts() {
  const { userId } = useCurrentUser();
  const qc = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: ['impersonation-alerts', userId],
    queryFn: async () => {
      if (!userId) return [] as ImpersonationAlert[];
      const { data, error } = await supabase
        .from('impersonation_alerts')
        .select('*')
        .eq('victim_user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImpersonationAlert[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const respond = useMutation({
    mutationFn: async ({ alertId, response }: { alertId: string; response: 'impersonator' | 'self' }) => {
      const { data, error } = await supabase.functions.invoke('identity-impersonation-respond', {
        body: { alert_id: alertId, response },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['impersonation-alerts'] });
      toast.success(
        vars.response === 'impersonator'
          ? 'Đã báo cáo. Đội ngũ quản trị sẽ xem xét và xử lý tài khoản giả mạo.'
          : 'Đã ghi nhận đây là tài khoản của bạn. Cảnh báo đã được đóng.',
      );
    },
    onError: (e: Error) => toast.error(e.message ?? 'Có lỗi xảy ra'),
  });

  const pending = (alertsQuery.data ?? []).filter((a) => a.status === 'pending');

  return {
    alerts: alertsQuery.data ?? [],
    pending,
    isLoading: alertsQuery.isLoading,
    respond,
  };
}
