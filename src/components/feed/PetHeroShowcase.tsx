import { useEffect, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Link } from 'react-router-dom';
import { Sparkles, Target, X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePetState } from '@/modules/pet/hooks/usePetState';
import { usePetCosmetics } from '@/modules/pet/hooks/usePetCosmetics';
import {
  resolvePetSprite,
  resolveFrameSprite,
  resolveHatSprite,
  resolveAuraSprite,
  resolveAccessorySprite,
  getAccessoryPlacement,

  STAGE_NAMES,
} from '@/modules/pet/lib/petAssets';

const STORAGE_KEY = 'fun:feed:hide-pet-hero';

// Vị trí + delay cho các ngôi sao lấp lánh quanh pet
const SPARKLES: Array<{ top: string; left: string; size: number; delay: string }> = [
  { top: '8%', left: '12%', size: 14, delay: '0s' },
  { top: '22%', left: '82%', size: 18, delay: '0.4s' },
  { top: '58%', left: '4%', size: 12, delay: '0.8s' },
  { top: '72%', left: '88%', size: 16, delay: '1.2s' },
  { top: '4%', left: '52%', size: 12, delay: '0.2s' },
  { top: '82%', left: '46%', size: 14, delay: '1.0s' },
  { top: '40%', left: '94%', size: 10, delay: '0.6s' },
];

export function PetHeroShowcase() {
  const { t } = useLanguage();
  const { isAuthenticated } = useCurrentUser();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();

  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, hidden ? 'true' : 'false');
  }, [hidden]);

  if (hidden) {
    return (
      <div className="mb-3 flex justify-end px-3">
        <button
          type="button"
          onClick={() => setHidden(false)}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-gradient-to-r from-amber-50 to-pink-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm hover:shadow active:scale-95 transition"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('phsShowLumi')}
        </button>
      </div>
    );
  }

  const equippedSkin = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'skin');
  const equippedFrame = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'background');
  const equippedHat = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'hat');
  const equippedAura = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'aura');
  const equippedAccessory = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'accessory');

  const stage = pet?.evolution_stage ?? 0;
  const sprite = resolvePetSprite(stage, equippedSkin?.catalog.slug);
  const framePath = resolveFrameSprite(equippedFrame?.catalog.slug);
  const hatPath = resolveHatSprite(equippedHat?.catalog.slug);
  const auraPath = resolveAuraSprite(equippedAura?.catalog.slug);
  const accessoryPath = resolveAccessorySprite(equippedAccessory?.catalog.slug);

  const displayName = pet?.name ?? t('phsDefaultName');
  const stageLabel = STAGE_NAMES[stage] ?? 'Seed';

  const subtitle = !isAuthenticated
    ? t('phsSubtitleGuest')
    : pet
      ? t('phsSubtitleHasPet')
      : t('phsSubtitleNoPet');

  const primaryCta = !isAuthenticated
    ? { to: '/auth', label: t('phsCtaLogin') }
    : { to: '/quests', label: t('phsCtaQuests') };

  return (
    <div className="mb-3 px-2 sm:px-0">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-pink-50 via-amber-50 to-violet-50 shadow-[0_8px_30px_-12px_rgba(244,114,182,0.35)]">
        {/* Lớp aura nền tỏa sáng */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-pet-aura"
          style={{
            background:
              'radial-gradient(circle, rgba(253,224,71,0.55) 0%, rgba(244,114,182,0.35) 35%, rgba(167,139,250,0.0) 70%)',
            filter: 'blur(8px)',
          }}
        />

        {/* Viền shimmer vàng nhẹ */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              'linear-gradient(120deg, transparent 30%, rgba(255,215,0,0.18) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
          }}
        />

        {/* Nút thu gọn */}
        <button
          type="button"
          aria-label={t('phsHideLumi')}
          onClick={() => setHidden(true)}
          className="absolute right-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-amber-700 backdrop-blur hover:bg-white active:scale-90 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="relative z-10 flex flex-col items-center gap-3 px-4 py-6 sm:py-7">
          {/* Khung pet */}
          <div className="relative h-[170px] w-[170px] sm:h-[200px] sm:w-[200px] motion-safe:animate-pet-float">
            {/* Sparkles xoay quanh */}
            {SPARKLES.map((s, i) => (
              <Star
                key={i}
                aria-hidden
                className="absolute text-amber-400 motion-safe:animate-sparkle drop-shadow-[0_0_4px_rgba(253,224,71,0.9)]"
                style={{
                  top: s.top,
                  left: s.left,
                  width: s.size,
                  height: s.size,
                  animationDelay: s.delay,
                  fill: 'currentColor',
                }}
              />
            ))}

            {/* Aura cosmetic */}
            {auraPath && (
              <img
                src={auraPath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -inset-3 z-0 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] object-contain opacity-90"
              />
            )}
            {/* Frame */}
            {framePath && (
              <img
                src={framePath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain opacity-95"
              />
            )}
            {/* Sprite chính */}
            <img
              src={sprite}
              alt={displayName}
              className="relative z-10 h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(251,191,36,0.55)]"
            />
            {/* Hat */}
            {hatPath && (
              <img
                src={hatPath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -top-4 left-1/2 z-20 h-12 w-12 -translate-x-1/2 object-contain"
              />
            )}
            {/* Accessory */}
            {accessoryPath && (() => {
              const p = getAccessoryPlacement(equippedAccessory?.catalog.slug);
              return (
                <img
                  src={accessoryPath}
                  alt=""
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-sm ${p.extraClass ?? ''}`}
                  style={{ top: p.top, width: p.width, height: p.width, zIndex: p.zIndex }}
                />
              );
            })()}

          </div>

          {/* Thông tin */}
          <div className="text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 text-base font-bold text-amber-900 sm:text-lg">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-pink-500" />
                {displayName}
              </span>
              {pet && (
                <>
                  <span className="text-amber-400">•</span>
                  <span className="text-sm font-semibold text-amber-700">{stageLabel}</span>
                  <span className="text-amber-400">•</span>
                  <span className="text-sm font-semibold text-amber-700">
                    {t('petLevelLabel')}{pet.level} · XP {pet.xp}
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-amber-800/80">{subtitle}</p>
          </div>

          {/* CTA */}
          <div className="mt-1 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 px-6 text-base font-bold text-white shadow-[0_8px_24px_-6px_rgba(244,63,94,0.55)] hover:shadow-[0_10px_28px_-4px_rgba(244,63,94,0.7)] hover:scale-[1.03] border-0 transition motion-safe:animate-glow-radiate"
            >
              <Link to={primaryCta.to}>
                <Target className="h-5 w-5" />
                {primaryCta.label}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full border-2 border-amber-300 bg-white/80 px-6 text-base font-semibold text-amber-700 hover:bg-amber-50 hover:text-amber-800 transition"
            >
              <Link to="/pet">
                <Sparkles className="h-5 w-5" />
                {t('phsVisitLumi')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PetHeroShowcase;
