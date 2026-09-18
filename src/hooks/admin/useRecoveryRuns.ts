import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface RecoveryRun {
  id: string;
  approved_by: string;
  approved_at: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled';
  max_per_run: number;
  total_eligible: number;
  total_recovered: number;
  total_skipped: number;
  reason_filter: string;
  month_filter: string;
  notes: string | null;
  last_tick_at: string | null;
  created_at: string;
}

export function useRecoveryRuns() {
  return useQuery({
    queryKey: ['admin', 'pplp-recovery-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pplp_recovery_runs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as RecoveryRun[];
    },
    refetchInterval: 30_000,
  });
}

export function useApproveRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, maxPerRun }: { month: string; maxPerRun: number }) => {
      const { data, error } = await supabase.functions.invoke('pplp-recovery-run', {
        body: { action: 'approve', month, max_per_run: maxPerRun },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { run_id: string; total_eligible: number };
    },
    onSuccess: (d) => {
      toast({ title: 'Đã duyệt đợt recovery', description: `${d.total_eligible} lệnh đủ điều kiện` });
      qc.invalidateQueries({ queryKey: ['admin', 'pplp-recovery-runs'] });
    },
    onError: (e: Error) => toast({ title: 'Lỗi', description: e.message, variant: 'destructive' }),
  });
}

export function useCancelRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.functions.invoke('pplp-recovery-run', {
        body: { action: 'cancel', run_id: runId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Đã huỷ đợt recovery' });
      qc.invalidateQueries({ queryKey: ['admin', 'pplp-recovery-runs'] });
    },
    onError: (e: Error) => toast({ title: 'Lỗi', description: e.message, variant: 'destructive' }),
  });
}

export function useManualTickRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pplp-recovery-run', {
        body: { action: 'tick' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast({
        title: 'Tick recovery xong',
        description: `+${d?.recovered || 0} hồi phục, ${d?.skipped || 0} bỏ qua`,
      });
      qc.invalidateQueries({ queryKey: ['admin', 'pplp-recovery-runs'] });
    },
    onError: (e: Error) => toast({ title: 'Lỗi', description: e.message, variant: 'destructive' }),
  });
}
