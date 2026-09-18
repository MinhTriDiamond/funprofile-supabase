import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEffect } from 'react';
import { toast } from 'sonner';

export type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cosmic';
export type ShopSlot = 'hat' | 'aura' | 'background' | 'accessory' | 'skin';

export interface ShopItem {
  id: string;
  slug: string;
  name_vi: string;
  name_en: string;
  slot: ShopSlot;
  rarity: ShopRarity;
  sprite_url: string | null;
  description_vi: string | null;
  description_en: string | null;
  price_camly: number;
  level_required: number;
  for_sale: boolean;
  stock_limit: number | null;
  sold_count: number;
  owned: boolean;
}

export interface ShopConfig {
  treasury_address: string;
  chain_id: number;
  camly_token: string;
  camly_decimals: number;
  min_confirmations: number;
  is_enabled: boolean;
}

export interface CreateOrderResult {
  order_id: string;
  treasury_address: string;
  chain_id: number;
  camly_token: string;
  camly_decimals: number;
  price_camly: number;
  cosmetic_slug: string;
  expires_at: string;
}

export function petShopErrorToMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('SHOP_DISABLED')) return 'Cửa hàng đang tạm đóng.';
  if (msg.includes('PET_RISK_FROZEN')) return 'Tài khoản đang bị khoá do dấu hiệu rủi ro — vui lòng gửi kháng nghị.';
  if (msg.includes('PET_RISK_RESTRICTED')) return 'Tài khoản đang bị hạn chế do dấu hiệu rủi ro — tạm thời không thể mua sắm/cổ vũ.';
  if (msg.includes('NOT_FOR_SALE')) return 'Trang phục này không bán trong shop.';
  if (msg.includes('OUT_OF_STOCK')) return 'Trang phục đã hết hàng.';
  if (msg.includes('LEVEL_TOO_LOW')) return 'Cấp Lumi của bạn chưa đủ để mua trang phục này.';
  if (msg.includes('ALREADY_OWNED')) return 'Bạn đã sở hữu trang phục này.';
  if (msg.includes('ORDER_PENDING')) return 'Bạn có đơn hàng đang chờ — vui lòng hoàn tất hoặc đợi hết hạn.';
  if (msg.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập.';
  if (msg.includes('TX_NOT_FOUND')) return 'Chưa tìm thấy giao dịch on-chain. Hãy đợi vài giây rồi thử lại.';
  if (msg.includes('TX_REVERTED')) return 'Giao dịch bị thất bại trên blockchain.';
  if (msg.includes('TRANSFER_NOT_MATCHED')) return 'Giao dịch không khớp số tiền hoặc ví treasury.';
  if (msg.includes('NOT_ENOUGH_CONFIRMATIONS')) return 'Giao dịch chưa đủ xác nhận, vui lòng đợi thêm vài giây.';
  if (msg.includes('EXPIRED')) return 'Đơn hàng đã hết hạn, vui lòng tạo lại.';
  if (msg.includes('ORDER_NOT_PENDING')) return 'Đơn hàng đã được xử lý.';
  return msg || 'Lỗi không xác định.';
}

export function usePetShopConfig() {
  return useQuery({
    queryKey: ['pet-shop-config'],
    staleTime: 60_000,
    queryFn: async (): Promise<ShopConfig | null> => {
      const { data, error } = await supabase
        .from('pet_shop_config' as never)
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ShopConfig | null;
    },
  });
}

export function usePetShopCatalog() {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['pet-shop-catalog', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<ShopItem[]> => {
      const { data: items, error } = await supabase
        .from('pet_cosmetics_catalog' as never)
        .select('*')
        .eq('is_active', true)
        .eq('for_sale', true)
        .order('price_camly', { ascending: true });
      if (error) throw error;

      const { data: owned } = await supabase
        .from('pet_cosmetics_owned' as never)
        .select('cosmetic_id')
        .eq('user_id', userId!);
      const ownedSet = new Set((owned ?? []).map((o: any) => o.cosmetic_id));
      return (items ?? []).map((i: any) => ({
        ...i,
        owned: ownedSet.has(i.id),
      })) as ShopItem[];
    },
  });
}

export function usePetShopCreateOrder() {
  return useMutation({
    mutationFn: async (cosmeticId: string): Promise<CreateOrderResult> => {
      const { data, error } = await supabase.rpc(
        'pet_shop_create_order' as never,
        { _cosmetic_id: cosmeticId } as never,
      );
      if (error) throw new Error(error.message);
      return data as unknown as CreateOrderResult;
    },
  });
}

export function usePetShopConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { order_id: string; tx_hash: string }) => {
      const { data, error } = await supabase.functions.invoke(
        'pet-shop-confirm',
        { body: args },
      );
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet-shop-catalog'] });
      qc.invalidateQueries({ queryKey: ['pet-cosmetics'] });
      qc.invalidateQueries({ queryKey: ['pet-shop-orders'] });
      qc.invalidateQueries({ queryKey: ['pet-shop-public-feed'] });
    },
  });
}

/**
 * Realtime listener: tự refetch kho/đơn khi edge function pet-shop-confirm
 * cập nhật đơn của user → trạng thái 'confirmed'. Giúp UI luôn đồng bộ
 * kể cả khi user đã đóng dialog mua hàng.
 */
export function useShopOrdersRealtime() {
  const { userId } = useCurrentUser();
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`pet-shop-orders-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pet_shop_orders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = (payload.new ?? {}) as any;
          const prev = (payload.old ?? {}) as any;
          if (next?.status === 'confirmed' && prev?.status !== 'confirmed') {
            qc.invalidateQueries({ queryKey: ['pet-cosmetics'] });
            qc.invalidateQueries({ queryKey: ['pet-shop-orders'] });
            qc.invalidateQueries({ queryKey: ['pet-shop-catalog'] });
            qc.invalidateQueries({ queryKey: ['pet-shop-public-feed'] });
            toast.success('Đã nhận trang phục Lumi! Mở Tủ đồ để xem.');
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export function usePetShopOrders(limit = 20) {
  const { userId } = useCurrentUser();
  return useQuery({
    queryKey: ['pet-shop-orders', userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pet_shop_orders' as never)
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
