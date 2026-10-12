import { ReactNode, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Link } from 'react-router-dom';
import { Sparkles, Gift, Target, BookOpen, ShoppingBag, BicepsFlexed, ShieldAlert, Gamepad2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePetState } from '@/modules/pet/hooks/usePetState';
import { usePetCosmetics } from '@/modules/pet/hooks/usePetCosmetics';
import { resolvePetSprite, resolveFrameSprite, STAGE_NAMES } from '@/modules/pet/lib/petAssets';

interface MiniGameItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  descKey: string;
  color: string;
}

const PET_ITEMS: MiniGameItem[] = [
  { to: '/pet/shop', icon: ShoppingBag, labelKey: 'queNavShop', descKey: 'mgmShopDesc', color: 'text-amber-500' },
  { to: '/pet/arena', icon: BicepsFlexed, labelKey: 'mgmArenaLabel', descKey: 'mgmArenaDesc', color: 'text-orange-500' },
  { to: '/pet/appeal', icon: ShieldAlert, labelKey: 'mgmAppealLabel', descKey: 'mgmAppealDesc', color: 'text-slate-500' },
];

const OTHER_ITEMS: MiniGameItem[] = [
  { to: '/mystery-box', icon: Gift, labelKey: 'mysteryBox', descKey: 'mgmMysteryDesc', color: 'text-purple-500' },
  { to: '/quests', icon: Target, labelKey: 'mgmQuestsLabel', descKey: 'mgmQuestsDesc', color: 'text-emerald-500' },
  { to: '/docs/pet-game-guide', icon: BookOpen, labelKey: 'mgmGuideLabel', descKey: 'mgmGuideDesc', color: 'text-sky-500' },
];

const MOOD_LABEL_KEYS: Record<string, string> = {
  happy: 'petMoodHappy',
  excited: 'petMoodExcited',
  calm: 'petMoodCalm',
  sad: 'petMoodSad',
  hungry: 'petMoodHungry',
  sleepy: 'petMoodSleepy',
};

function LumiStatusTile({ onClick, large = false }: { onClick?: () => void; large?: boolean }) {
  const { t } = useLanguage();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();
  const equippedSkin = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'skin');
  const equippedFrame = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'background');
  const sprite = pet ? resolvePetSprite(pet.evolution_stage, equippedSkin?.catalog.slug) : null;
  const framePath = resolveFrameSprite(equippedFrame?.catalog.slug);

  if (!pet) {
    return (
      <Link
        to="/pet"
        onClick={onClick}
        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-pink-500 shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">{t('mgmPetName')}</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {t('mgmStartRaising')}
          </div>
        </div>
      </Link>
    );
  }

  const avatarSize = large ? 'w-16 h-16' : 'w-14 h-14';

  return (
    <Link
      to="/pet"
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-pink-50 border border-amber-200 hover:shadow-sm transition-all"
    >
      <div className={`relative ${avatarSize} shrink-0`}>
        {framePath && (
          <img
            src={framePath}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-contain opacity-90"
          />
        )}
        {sprite && (
          <img
            src={sprite}
            alt={pet.name}
            className="relative w-full h-full object-contain drop-shadow"
          />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-foreground break-words">{pet.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{STAGE_NAMES[pet.evolution_stage]}</Badge>
        </div>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
          <span>{t('petLevelLabel')}<b className="text-foreground">{pet.level}</b></span>
          <span>XP <b className="text-foreground">{pet.xp}</b></span>
          <span>{t('petMoodLabel')}<b className="text-foreground">{MOOD_LABEL_KEYS[pet.mood] ? t(MOOD_LABEL_KEYS[pet.mood]) : pet.mood}</b></span>
        </div>
      </div>
    </Link>
  );
}

interface MiniGameMenuProps {
  children: ReactNode;
  onItemClick?: () => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

function MenuBody({ onItemClick, large = false }: { onItemClick?: () => void; large?: boolean }) {
  const { t } = useLanguage();
  const itemPadding = large ? 'p-3' : 'p-2';
  const iconBox = large ? 'w-11 h-11' : 'w-9 h-9';
  const iconSvg = large ? 'w-6 h-6' : 'w-5 h-5';

  const renderItem = (item: MiniGameItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onItemClick}
        className={`flex items-start gap-3 ${itemPadding} rounded-xl hover:bg-muted active:bg-muted/80 transition-colors`}
      >
        <div className={`${iconBox} rounded-full bg-secondary flex items-center justify-center shrink-0 ${item.color}`}>
          <Icon className={iconSvg} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm break-words">{t(item.labelKey)}</div>
          <div className="text-xs text-muted-foreground leading-snug break-words">{t(item.descKey)}</div>
        </div>
      </Link>
    );
  };

  return (
    <div className={large ? 'space-y-4' : 'space-y-3'}>
      <div>
        <h4 className="font-bold text-xs uppercase text-muted-foreground mb-2 px-1">{t('mgmPetSection')}</h4>
        <div className={large ? 'space-y-1' : 'space-y-0.5'}>
          <LumiStatusTile onClick={onItemClick} large={large} />
          {PET_ITEMS.map(renderItem)}
        </div>
      </div>
      <div className="border-t pt-3">
        <h4 className="font-bold text-xs uppercase text-muted-foreground mb-2 px-1">{t('mgmOtherSection')}</h4>
        <div className={large ? 'space-y-1' : 'space-y-0.5'}>{OTHER_ITEMS.map(renderItem)}</div>
      </div>
    </div>
  );
}

export function MiniGameMenu({ children, onItemClick, align = 'start', side = 'right' }: MiniGameMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleItemClick = () => {
    setOpen(false);
    onItemClick?.();
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="p-0 max-h-[85vh] flex flex-col rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Gamepad2 className="w-5 h-5 text-pink-500" />
              Mini Game
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 py-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <MenuBody onItemClick={handleItemClick} large />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-80 p-3 z-50 bg-popover" sideOffset={8}>
        <MenuBody onItemClick={handleItemClick} />
      </PopoverContent>
    </Popover>
  );
}
