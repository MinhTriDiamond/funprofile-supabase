import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExternalWalletLabel {
  id: string;
  wallet_address: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export function useExternalWalletLabels() {
  return useQuery({
    queryKey: ['external-wallet-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_wallet_labels')
        .select('*')
        .order('label');
      if (error) throw error;
      return (data || []) as ExternalWalletLabel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Returns a Map<lowercase_address, label> for quick lookup */
export function useWalletLabelMap() {
  const { data: labels } = useExternalWalletLabels();
  const map = new Map<string, string>();
  if (labels) {
    for (const l of labels) {
      map.set(l.wallet_address.toLowerCase(), l.label);
    }
  }
  return map;
}

export function useUpsertWalletLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wallet_address, label }: { wallet_address: string; label: string }) => {
      const { error } = await supabase
        .from('external_wallet_labels')
        .upsert(
          { wallet_address: wallet_address.toLowerCase(), label },
          { onConflict: 'wallet_address' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['external-wallet-labels'] });
      toast.success('Đã lưu nhãn ví');
    },
    onError: (e: Error) => toast.error('Lỗi: ' + e.message),
  });
}

export function useDeleteWalletLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('external_wallet_labels')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['external-wallet-labels'] });
      toast.success('Đã xoá nhãn ví');
    },
    onError: (e: Error) => toast.error('Lỗi: ' + e.message),
  });
}
