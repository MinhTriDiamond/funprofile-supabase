import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePetState } from '@/modules/pet/hooks/usePetState';
import { usePetCosmetics } from '@/modules/pet/hooks/usePetCosmetics';
import { PetRiskBanner } from '@/modules/pet/components/PetRiskBanner';
import { PetGuideLink } from '@/modules/pet/components/PetGuideLink';
import { PetSectionNav } from '@/modules/pet/components/PetSectionNav';
import { PetGameOverview } from '@/modules/pet/components/PetGameOverview';
import { resolvePetSprite, resolveFrameSprite, resolveHatSprite, resolveAuraSprite, resolveAccessorySprite, getAccessoryPlacement, STAGE_NAMES } from '@/modules/pet/lib/petAssets';
import { cn } from '@/lib/utils';

const MOOD_LABEL: Record<string, string> = {
  happy: 'petMoodHappy',
  excited: 'petMoodExcited',
  calm: 'petMoodCalm',
  sad: 'petMoodSad',
  hungry: 'petMoodHungry',
  sleepy: 'petMoodSleepy',
};

export default function PetPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useCurrentUser();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();
  const equippedSkin = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'skin');
  const equippedFrame = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'background');
  const equippedHat = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'hat');
  const equippedAura = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'aura');
  const equippedAccessory = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'accessory');
  const sprite = pet ? resolvePetSprite(pet.evolution_stage, equippedSkin?.catalog.slug) : null;
  const framePath = resolveFrameSprite(equippedFrame?.catalog.slug);
  const hatPath = resolveHatSprite(equippedHat?.catalog.slug);
  const auraPath = resolveAuraSprite(equippedAura?.catalog.slug);
  const accessoryPath = resolveAccessorySprite(equippedAccessory?.catalog.slug);

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="container mx-auto max-w-4xl px-3 py-4 space-y-4">
        <BackToHomeBar fallback="/" inline />
        <header className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h1 className="text-xl font-bold">{t('petTitleLumi')}</h1>
          <PetGuideLink className="ml-auto" />
        </header>

        <PetSectionNav active="home" />

        <PetRiskBanner />

        {pet ? (
          <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-pink-50 border-amber-200">
            <div className="relative w-20 h-20 shrink-0">
              {auraPath && (
                <img src={auraPath} alt="" aria-hidden className="absolute -inset-2 w-24 h-24 z-0 object-contain opacity-90 pointer-events-none" />
              )}
              {framePath && (
                <img src={framePath} alt="" aria-hidden className="absolute inset-0 w-full h-full z-[1] object-contain opacity-90 pointer-events-none" />
              )}
              {sprite && (
                <img src={sprite} alt={pet.name} className="relative w-full h-full z-10 object-contain drop-shadow" />
              )}
              {hatPath && (
                <img src={hatPath} alt="" aria-hidden className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-10 z-20 object-contain pointer-events-none" />
              )}
              {accessoryPath && (() => {
                const p = getAccessoryPlacement(equippedAccessory?.catalog.slug);
                return (
                  <img
                    src={accessoryPath}
                    alt=""
                    aria-hidden
                    className={cn('absolute left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none drop-shadow-sm', p.extraClass)}
                    style={{ top: p.top, width: p.width, height: p.width, zIndex: p.zIndex }}
                  />
                );
              })()}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate">{pet.name}</h2>
                <Badge variant="secondary">{STAGE_NAMES[pet.evolution_stage]}</Badge>
              </div>
              <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span>{t('petLevelLabel')}<b className="text-foreground">{pet.level}</b></span>
                <span>XP <b className="text-foreground">{pet.xp}</b></span>
                <span>{t('petMoodLabel')}<b className="text-foreground">{MOOD_LABEL[pet.mood] ? t(MOOD_LABEL[pet.mood]) : pet.mood}</b></span>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 space-y-3 bg-gradient-to-br from-sky-50 to-indigo-50 border-sky-200">
            <div className="flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-purple-500 shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="text-foreground font-medium mb-1">{t('petNoneTitle')}</p>
                <p>
                  {isAuthenticated
                    ? t('petNoneDescAuth')
                    : t('petNoneDescGuest')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={isAuthenticated ? '/' : '/auth'}>
                  {isAuthenticated ? t('petCtaAuth') : t('petCtaGuest')}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/docs/pet-game-guide">​</Link>
              </Button>
            </div>
          </Card>
        )}

        <PetGameOverview />

      </div>
    </div>
  );
}
