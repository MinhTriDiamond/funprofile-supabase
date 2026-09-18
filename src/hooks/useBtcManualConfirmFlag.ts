import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useBtcManualConfirmFlag — cờ cho phép user tự bấm "Tôi đã gửi xong" (BTC).
 *
 * Nguồn: `app_settings.btc_manual_confirm_enabled` đọc qua RPC
 * `btc_manual_confirm_enabled()` (app_settings chỉ admin đọc trực tiếp).
 *
 * Mặc định = false (khoá) khi lỗi mạng/không đọc được → fail-safe.
 */
export const BTC_MANUAL_CONFIRM_LOCK_MESSAGE =
  'Đang chờ xác nhận tự động từ blockchain, vui lòng đợi (thường vài phút tới ~1 giờ).';

export async function fetchBtcManualConfirmEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('btc_manual_confirm_enabled');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export function useBtcManualConfirmFlag() {
  return useQuery({
    queryKey: ['btc-manual-confirm-enabled'],
    queryFn: fetchBtcManualConfirmEnabled,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    initialData: false,
  });
}
