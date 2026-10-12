import { useMemo, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins, Lock, Check, Sparkles, Backpack } from 'lucide-react';
import { PetGuideLink } from '@/modules/pet/components/PetGuideLink';
import { PetSectionNav } from '@/modules/pet/components/PetSectionNav';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { PetInventoryDialog } from '@/modules/pet/components/PetInventoryDialog';
import { MiniGameAppBar } from '@/modules/pet/components/MiniGameAppBar';
import { cn } from '@/lib/utils';
import { resolveItemSprite } from '@/modules/pet/lib/petAssets';
import {
  usePetShopCatalog,
  useShopOrdersRealtime,
  type ShopItem,
  type ShopRarity,
} from '@/modules/pet/hooks/usePetShop';
import { usePetState } from '@/modules/pet/hooks/usePetState';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { PetShopPurchaseDialog } from '@/modules/pet/components/PetShopPurchaseDialog';
import { PetShopPublicFeed } from '@/modules/pet/components/PetShopPublicFeed';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';
import { PetRiskBanner } from '@/modules/pet/components/PetRiskBanner';
import { usePetRisk, isPetActionBlocked } from '@/modules/pet/hooks/usePetRisk';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const RARITY_STYLES: Record<ShopRarity, string> = {
  common: 'border-slate-300 from-slate-100 to-slate-50',
  rare: 'border-blue-400 from-blue-100 to-blue-50',
  epic: 'border-purple-400 from-purple-100 to-purple-50',
  legendary: 'border-amber-400 from-amber-100 to-amber-50',
  cosmic: 'border-pink-400 from-pink-100 via-purple-50 to-sky-50',
};

const RARITY_LABEL: Record<ShopRarity, string> = {
  common: 'pshRarityCommon',
  rare: 'pshRarityRare',
  epic: 'pshRarityEpic',
  legendary: 'pshRarityLegendary',
  cosmic: 'pshRarityCosmic',
};

function formatCamly(n: number): string {
  return n.toLocaleString('vi-VN');
}

function ShopItemCard({
  item,
  petLevel,
  onBuy,
}: {
  item: ShopItem;
  petLevel: number;
  onBuy: (item: ShopItem) => void;
}) {
  const { t } = useLanguage();
  const sprite = resolveItemSprite(item.slot, item.slug, 3);
  const owned = item.owned;
  const levelLow = petLevel < item.level_required;
  const outOfStock =
    item.stock_limit !== null && item.sold_count >= (item.stock_limit ?? 0);

  // Nền sáng cho overlay trong suốt (aura/hat/accessory) để nhìn rõ
  const previewBgClass =
    item.slot === 'aura'
      ? 'bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/40 dark:to-rose-950/40'
      : item.slot === 'hat' || item.slot === 'accessory'
      ? 'bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/40 dark:to-violet-950/40'
      : 'bg-background/60 backdrop-blur-sm';

  return (
    <Card
      className={cn(
        'p-3 flex flex-col gap-3 bg-gradient-to-br border-2',
        RARITY_STYLES[item.rarity],
      )}
    >
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] py-0 h-5 capitalize">
          {RARITY_LABEL[item.rarity]}
        </Badge>
        <Badge variant="outline" className="text-[10px] py-0 h-5">
          {item.slot}
        </Badge>
      </div>

      <div className={cn('aspect-square rounded-xl flex items-center justify-center overflow-hidden', previewBgClass)}>
        {sprite ? (
          <img
            src={sprite}
            alt={item.name_vi}
            className={cn(
              'w-3/4 h-3/4 object-contain drop-shadow',
              owned && 'opacity-80',
            )}
          />
        ) : (
          <Sparkles className="w-10 h-10 text-muted-foreground/50" />
        )}
      </div>


      <div className="space-y-0.5">
        <h3 className="font-semibold text-sm leading-tight line-clamp-1">
          {item.name_vi}
        </h3>
        {item.description_vi && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {item.description_vi}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm font-semibold">
          <Coins className="w-4 h-4 text-amber-500" />
          <span>{formatCamly(item.price_camly)}</span>
          <span className="text-[10px] text-muted-foreground font-normal">CAMLY</span>
        </div>
        {owned ? (
          <Badge className="bg-emerald-500 hover:bg-emerald-500 gap-1">
            <Check className="w-3 h-3" />{t('pshOwned')}
          </Badge>
        ) : levelLow ? (
          <Badge variant="outline" className="gap-1 text-amber-700 border-amber-500/40">
            <Lock className="w-3 h-3" /> Lv {item.level_required}
          </Badge>
        ) : outOfStock ? (
          <Badge variant="outline">{t('pshSoldOut')}</Badge>
        ) : (
          <Button size="sm" onClick={() => onBuy(item)} className="h-7 text-xs">
            Mua
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function PetShopPage() {
  const { t } = useLanguage();
  const { userId: _uid } = useCurrentUser();
  void _uid;
  const { data: items, isLoading } = usePetShopCatalog();
  const { data: pet } = usePetState();
  const [filterRarity, setFilterRarity] = useState<ShopRarity | 'all'>('all');
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [tab, setTab] = useState<'catalog' | 'feed'>('catalog');

  // Realtime: tự cập nhật kho + thông báo khi backend xác nhận đơn của user.
  useShopOrdersRealtime();

  const filtered = useMemo(() => {
    if (!items) return [];
    return filterRarity === 'all'
      ? items
      : items.filter((i) => i.rarity === filterRarity);
  }, [items, filterRarity]);

  const petLevel = pet?.level ?? 0;

  const { data: risk } = usePetRisk();
  const shopBlocked = isPetActionBlocked(risk?.risk_tier, 'shop');

  const handleSelect = (item: ShopItem) => {
    if (shopBlocked) {
      toast.error(t('pshRestricted'));
      return;
    }
    setSelected(item);
  };

  return (
    <div className="container mx-auto px-3 py-4 max-w-5xl space-y-4">
      <PetRiskBanner />
      <header className="space-y-2">
        <MiniGameAppBar
          title={t('queNavShop')}
          icon={Sparkles}
          right={
            <>
              <Button size="sm" variant="outline" onClick={() => setInventoryOpen(true)} className="h-8 gap-1.5">
                <Backpack className="w-4 h-4" />
                {t('pshWardrobe')}
              </Button>
              <PetGuideLink />
            </>
          }
        />
        <p className="text-sm text-muted-foreground">
          {t('pshDescA')}<span className="font-medium text-foreground">{t('pshWardrobe')}</span>{t('pshDescB')}<span className="font-medium text-foreground">{t('pshEquip')}</span>{t('pshDescC')}
        </p>
        <div className="flex flex-wrap gap-1">
          {(['all', 'common', 'rare', 'epic', 'legendary', 'cosmic'] as const).map(
            (r) => (
              <Button
                key={r}
                size="sm"
                variant={filterRarity === r ? 'default' : 'outline'}
                className="h-7 text-xs capitalize"
                onClick={() => setFilterRarity(r as ShopRarity | 'all')}
              >
                {r === 'all' ? t('benAll') : t(RARITY_LABEL[r as ShopRarity])}
              </Button>
            ),
          )}
        </div>
      </header>

      <BackToHomeBar fallback="/pet" inline />
      <PetSectionNav active="shop" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'catalog' | 'feed')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="catalog">{t('pshTabCatalog')}</TabsTrigger>
            <TabsTrigger value="feed">{t('pshTabFeed')}</TabsTrigger>
          </TabsList>
          <a
            href="/treasury"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            {t('mbpTreasury')}
          </a>
        </div>

        <TabsContent value="catalog" className="space-y-3">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('pshEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <ShopItemCard
                  key={item.id}
                  item={item}
                  petLevel={petLevel}
                  onBuy={handleSelect}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="feed">
          <PetShopPublicFeed />
        </TabsContent>
      </Tabs>

      {selected && (
        <OptionalWeb3Provider>
          <PetShopPurchaseDialog
            item={selected}
            open={!!selected}
            onOpenChange={(o) => !o && setSelected(null)}
            onOpenInventory={() => setInventoryOpen(true)}
          />
        </OptionalWeb3Provider>
      )}

      <PetInventoryDialog open={inventoryOpen} onOpenChange={setInventoryOpen} />
    </div>
  );
}
