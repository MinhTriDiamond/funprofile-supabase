import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface MysteryBoxShopConfig {
  treasury_address: string;
  chain_id: number;
  camly_token: string;
  camly_decimals: number;
  min_confirmations: number;
  is_enabled: boolean;
}

export interface MysteryBoxCreateOrderResult {
  order_id: string;
  box_code: string;
  box_name: string;
  treasury_address: string;
  chain_id: number;
  camly_token: string;
  camly_decimals: number;
  price_camly: number;
  expires_at: string;
}

export function mysteryBoxShopErrorToMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/SHOP_DISABLED/.test(msg)) return 'Cửa hàng đang tạm đóng.';
  if (/PET_RISK_FROZEN/.test(msg)) return 'Tài khoản đang bị khoá do dấu hiệu rủi ro — vui lòng gửi kháng nghị.';
  if (/PET_RISK_RESTRICTED/.test(msg)) return 'Tài khoản đang bị hạn chế do dấu hiệu rủi ro — tạm thời không thể mua hộp.';
  if (/BOX_NOT_PURCHASABLE/.test(msg)) return 'Hộp này hiện không bán.';
  if (/ORDER_PENDING/.test(msg)) return 'Bạn đã có đơn hàng đang chờ thanh toán cho hộp này — vui lòng hoàn tất hoặc đợi hết hạn.';
  if (/UNAUTHENTICATED/.test(msg)) return 'Vui lòng đăng nhập lại.';
  if (/TX_NOT_FOUND/.test(msg)) return 'Chưa tìm thấy giao dịch on-chain, vui lòng đợi vài giây.';
  if (/TX_REVERTED/.test(msg)) return 'Giao dịch thất bại trên blockchain.';
  if (/TRANSFER_NOT_MATCHED/.test(msg)) return 'Giao dịch không khớp số CAMLY hoặc ví treasury.';
  if (/NOT_ENOUGH_CONFIRMATIONS/.test(msg)) return 'Giao dịch chưa đủ xác nhận, đang đợi…';
  if (/EXPIRED/.test(msg)) return 'Đơn hàng đã hết hạn, vui lòng tạo lại.';
  if (/ORDER_NOT_PENDING/.test(msg)) return 'Đơn hàng đã được xử lý trước đó.';
  if (/FORBIDDEN/.test(msg)) return 'Không có quyền với đơn hàng này.';
  if (/ORDER_NOT_FOUND/.test(msg)) return 'Không tìm thấy đơn hàng.';
  return msg || 'Lỗi không xác định.';
}

export function useMysteryBoxShopConfig() {
  return useQuery({
    queryKey: ['mystery-box-shop-config'],
    staleTime: 60_000,
    queryFn: async (): Promise<MysteryBoxShopConfig | null> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: number) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } } } })
        .from('mystery_box_shop_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MysteryBoxShopConfig | null;
    },
  });
}

export function useMysteryBoxCreateOrder() {
  return useMutation({
    mutationFn: async (boxCode: string): Promise<MysteryBoxCreateOrderResult> => {
      const { data, error } = await supabase.rpc('mystery_box_create_order' as never, { _box_code: boxCode } as never);
      if (error) throw new Error(error.message);
      return data as unknown as MysteryBoxCreateOrderResult;
    },
  });
}

export function useMysteryBoxConfirm() {
  const qc = useQueryClient();
  const { userId } = useCurrentUser();
  return useMutation({
    mutationFn: async (args: { order_id: string; tx_hash: string }) => {
      const { data, error } = await supabase.functions.invoke('mystery-box-confirm', { body: args });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mystery-box-inventory', userId] });
      qc.invalidateQueries({ queryKey: ['mystery-box-orders', userId] });
    },
  });
}

export function useMysteryBoxOrders(limit = 20) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['mystery-box-orders', userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } } } } })
        .from('mystery_box_orders')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}
