import { useLanguage } from '@/i18n/LanguageContext';
import { usePetCosmetics, type CosmeticRarity } from '../hooks/usePetCosmetics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveItemSprite } from '../lib/petAssets';


const RARITY_STYLES: Record<CosmeticRarity, string> = {
  common: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
  rare: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
  epic: 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200',
  legendary: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  cosmic: 'border-pink-400 bg-gradient-to-br from-pink-50 to-purple-50 text-pink-800 dark:from-pink-950/40 dark:to-purple-950/40 dark:text-pink-200',
};

const SLOT_LABELS_VI: Record<string, string> = {
  hat: 'Mũ',
  aura: 'Hào quang',
  background: 'Nền',
  accessory: 'Phụ kiện',
  skin: 'Da',
};

export function PetCosmeticInventory() {
  const { language } = useLanguage();
  const { data, isLoading, equip, unequip } = usePetCosmetics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-24" /><Skeleton className="h-24" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
        Chưa có trang phục. Mở Hộp Bí Ẩn để nhận skin/cosmetic cho Lumi.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((item) => {
        const name = language === 'vi' ? item.catalog.name_vi : item.catalog.name_en;
        const desc = language === 'vi' ? item.catalog.description_vi : item.catalog.description_en;
        const slotLabel = SLOT_LABELS_VI[item.catalog.slot] || item.catalog.slot;
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border p-3 transition',
              RARITY_STYLES[item.catalog.rarity],
            )}
          >
            <div
              className={cn(
                'shrink-0 w-12 h-12 rounded-md flex items-center justify-center overflow-hidden',
                item.catalog.slot === 'aura'
                  ? 'bg-gradient-to-br from-amber-50 to-rose-50'
                  : 'bg-gradient-to-br from-sky-50 to-violet-50',
              )}
            >
              {(() => {
                const sprite = resolveItemSprite(item.catalog.slot, item.catalog.slug, 3);
                return sprite ? (
                  <img src={sprite} alt={name} className="w-full h-full object-contain" />
                ) : (
                  <Sparkles className="w-5 h-5 text-muted-foreground/60" />
                );
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{name}</span>
                <Badge variant="outline" className="text-[10px] py-0 h-4">{slotLabel}</Badge>
                <Badge variant="outline" className="text-[10px] py-0 h-4 capitalize">{item.catalog.rarity}</Badge>
              </div>
              {desc && <p className="text-xs opacity-80 mt-0.5 line-clamp-1">{desc}</p>}
            </div>

            {item.equipped ? (
              <div className="flex items-center gap-1.5">
                <Badge className="bg-emerald-500 hover:bg-emerald-500 gap-1">
                  <Check className="w-3 h-3" /> Đang mặc
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 gap-1"
                  onClick={() => unequip.mutate(item.cosmetic_id)}
                  disabled={unequip.isPending}
                >
                  <X className="w-3 h-3" /> Tháo
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => equip.mutate(item.cosmetic_id)}
                disabled={equip.isPending}
              >
                Trang bị
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
