import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export function useScanIncoming() {
  const [isScanning, setIsScanning] = useState(false);
  const lastScanRef = useRef<number>(0);
  const queryClient = useQueryClient();

  const scan = useCallback(async () => {
    const now = Date.now();
    const elapsed = now - lastScanRef.current;
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
      toast.info(`Vui lòng chờ ${remaining} phút trước khi quét lại`);
      return;
    }

    setIsScanning(true);
    try {
      // Scan EVM and BTC in parallel
      const [evmResult, btcResult] = await Promise.allSettled([
        supabase.functions.invoke('scan-my-incoming'),
        supabase.functions.invoke('scan-btc-transactions'),
      ]);

      lastScanRef.current = Date.now();

      let evmNew = 0;
      let btcNew = 0;

      let providerUnavailable = false;

      if (evmResult.status === 'fulfilled' && !evmResult.value.error) {
        const data = evmResult.value.data as {
          newTransfers: number;
          message: string;
          provider_unavailable?: boolean;
        };
        evmNew = data?.newTransfers || 0;
        providerUnavailable = !!data?.provider_unavailable;
      } else {
        const err = evmResult.status === 'rejected' ? evmResult.reason : evmResult.value.error;
        console.error('scan-my-incoming error:', err);
        toast.error('Lỗi quét giao dịch EVM');
      }

      if (btcResult.status === 'fulfilled' && !btcResult.value.error) {
        const data = btcResult.value.data as { newTransfers: number; message: string };
        btcNew = data?.newTransfers || 0;
      } else {
        const err = btcResult.status === 'rejected' ? btcResult.reason : btcResult.value.error;
        console.error('scan-btc-transactions error:', err);
        toast.error('Lỗi quét giao dịch BTC');
      }

      const totalNew = evmNew + btcNew;

      // Provider on-chain lỗi (hết quota / key sai): KHÔNG được báo "không có
      // giao dịch mới" vì thực tế là chưa quét được gì.
      if (providerUnavailable) {
        lastScanRef.current = 0; // cho phép quét lại ngay khi provider hồi phục
        toast.error(
          'Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được. Admin đã được thông báo, vui lòng thử lại sau.',
        );
        return;
      }

      if (totalNew > 0) {
        const parts: string[] = [];
        if (evmNew > 0) parts.push(`${evmNew} EVM`);
        if (btcNew > 0) parts.push(`${btcNew} BTC`);
        toast.success(`Tìm thấy ${totalNew} giao dịch mới (${parts.join(', ')})`);
        
        // Refresh all relevant queries
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['donation-history'] }),
          queryClient.invalidateQueries({ queryKey: ['donation-stats'] }),
          queryClient.invalidateQueries({ queryKey: ['admin-donation-history'] }),
          queryClient.invalidateQueries({ queryKey: ['highlighted-posts'] }),
          queryClient.invalidateQueries({ queryKey: ['gift-day-counts'] }),
          queryClient.invalidateQueries({ queryKey: ['notifications'] }),
          queryClient.invalidateQueries({ queryKey: ['btc-transactions'] }),
          queryClient.invalidateQueries({ queryKey: ['wallet-transfers'] }),
        ]);
      } else {
        toast.info('Không có giao dịch mới');
      }
    } catch (err) {
      console.error('scan error:', err);
      toast.error('Lỗi khi quét giao dịch');
    } finally {
      setIsScanning(false);
    }
  }, [queryClient]);

  return { scan, isScanning };
}
