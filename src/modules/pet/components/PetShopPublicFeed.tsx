import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins, ExternalLink, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { resolveItemSprite } from '@/modules/pet/lib/petAssets';
import { cn } from '@/lib/utils';

type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cosmic';

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Thường',
  rare: 'Hiếm',
  epic: 'Đặc biệt',
  legendary: 'Huyền thoại',
  cosmic: 'Vũ trụ',
};

const RARITY_COLOR: Record<Rarity, string> = {
  common: 'bg-slate-100 text-slate-700 border-slate-200',
  rare: 'bg-blue-50 text-blue-700 border-blue-200',
  epic: 'bg-purple-50 text-purple-700 border-purple-200',
  legendary: 'bg-amber-50 text-amber-700 border-amber-200',
  cosmic: 'bg-pink-50 text-pink-700 border-pink-200',
};

interface PublicShopRow {
  id: string;
  user_id: string;
  cosmetic_id: string;
  price_camly: number;
  tx_hash: string;
  from_address: string | null;
  confirmed_at: string | null;
  created_at: string;
  cosmetic_slug: string;
  cosmetic_name_vi: string;
  cosmetic_rarity: Rarity;
  cosmetic_slot: string;
  cosmetic_sprite_url: string | null;
  buyer_display_name: string | null;
  buyer_username: string | null;
  buyer_avatar_url: string | null;
}

function usePublicShopFeed(limit = 30) {
  return useQuery({
    queryKey: ['pet-shop-public-feed', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<PublicShopRow[]> => {
      const { data: rows, error } = await supabase
        .from('pet_shop_orders_public' as never)
        .select('*')
        .order('confirmed_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const list = (rows ?? []) as any[];
      if (list.length === 0) return [];
      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, display_name, username, avatar_url')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return list.map((r) => ({
        ...r,
        buyer_display_name: pmap.get(r.user_id)?.display_name ?? null,
        buyer_username: pmap.get(r.user_id)?.username ?? null,
        buyer_avatar_url: pmap.get(r.user_id)?.avatar_url ?? null,
      })) as PublicShopRow[];
    },
  });
}

export function PetShopPublicFeed() {
  const { data, isLoading } = usePublicShopFeed(30);
  const qc = useQueryClient();

  // Realtime: refetch khi có đơn confirmed mới
  useEffect(() => {
    const ch = supabase
      .channel('pet-shop-public-feed')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pet_shop_orders',
          filter: 'status=eq.confirmed',
        },
        () => qc.invalidateQueries({ queryKey: ['pet-shop-public-feed'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có giao dịch mua trang phục nào. Hãy là người đầu tiên!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Tất cả giao dịch on-chain đều được công khai để cộng đồng cùng kiểm chứng. Bấm "Xem trên BscScan" để xác minh.
      </p>
      {data.map((row) => {
        const buyerName =
          row.buyer_display_name ?? row.buyer_username ?? 'Ẩn danh';
        const sprite = resolveItemSprite(
          row.cosmetic_slot as never,
          row.cosmetic_slug,
          3,
        );
        const when = row.confirmed_at ?? row.created_at;
        return (
          <Card key={row.id} className="p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={row.buyer_avatar_url ?? undefined} />
                <AvatarFallback>{buyerName[0]}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-medium">{buyerName}</span>{' '}
                  <span className="text-muted-foreground">đã sắm</span>{' '}
                  <span className="font-medium">{row.cosmetic_name_vi}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] py-0 h-5',
                      RARITY_COLOR[row.cosmetic_rarity],
                    )}
                  >
                    {RARITY_LABEL[row.cosmetic_rarity]}
                  </Badge>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-500" />
                    {row.price_camly.toLocaleString('vi-VN')} CAMLY
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {formatDistanceToNow(new Date(when), { addSuffix: true, locale: vi })}
                  </span>
                </div>
                <a
                  href={getBscScanTxUrl(row.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline mt-1"
                >
                  Xem trên BscScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/40 dark:to-violet-950/40 flex items-center justify-center overflow-hidden">
                {sprite ? (
                  <img
                    src={sprite}
                    alt={row.cosmetic_name_vi}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Sparkles className="w-6 h-6 text-muted-foreground/50" />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
