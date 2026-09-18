import { Link } from 'react-router-dom';
import { Sparkles, Target, Star } from 'lucide-react';
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

const SPARKLES: Array<{ top: string; left: string; size: number; delay: string }> = [
  { top: '6%', left: '10%', size: 10, delay: '0s' },
  { top: '14%', left: '78%', size: 12, delay: '0.4s' },
  { top: '62%', left: '4%', size: 10, delay: '0.8s' },
  { top: '70%', left: '82%', size: 12, delay: '1.2s' },
  { top: '40%', left: '92%', size: 8, delay: '0.6s' },
];

/**
 * Mini Lumi card hiển thị trong LeftSidebar — ngay dưới mục "Về FUN Profile".
 * Nhỏ gọn, có glow + sparkle, CTA dẫn tới nhiệm vụ hàng ngày.
 * Hiển thị đầy đủ cosmetic đã trang bị (skin/frame/hat/aura/accessory).
 */
export function PetSidebarCard({ onItemClick }: { onItemClick?: () => void }) {
  const { isAuthenticated } = useCurrentUser();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();

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
  const displayName = pet?.name ?? 'Linh thú Lumi';
  const stageLabel = STAGE_NAMES[stage] ?? 'Seed';


  const cta = !isAuthenticated
    ? { to: '/auth', label: 'Đăng nhập gặp Linh thú Lumi' }
    : { to: '/quests', label: 'Làm nhiệm vụ hôm nay' };

  return (
    <div className="mt-2">
      <div className="relative overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-br from-pink-50 via-amber-50 to-violet-50 shadow-[0_4px_14px_-6px_rgba(244,114,182,0.4)]">
        {/* Aura glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-pet-aura"
          style={{
            background:
              'radial-gradient(circle, rgba(253,224,71,0.55) 0%, rgba(244,114,182,0.3) 40%, rgba(167,139,250,0) 75%)',
            filter: 'blur(6px)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-2 px-3 py-3">
          {/* Pet sprite */}
          <div className="relative h-[96px] w-[96px] motion-safe:animate-pet-float">
            {SPARKLES.map((s, i) => (
              <Star
                key={i}
                aria-hidden
                className="absolute text-amber-400 motion-safe:animate-sparkle drop-shadow-[0_0_3px_rgba(253,224,71,0.9)]"
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
            {auraPath && (
              <img
                src={auraPath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -inset-2 z-0 h-[calc(100%+1rem)] w-[calc(100%+1rem)] object-contain opacity-90"
              />
            )}
            {framePath && (
              <img
                src={framePath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain opacity-95"
              />
            )}
            <img
              src={sprite}
              alt={displayName}
              className="relative z-10 h-full w-full object-contain drop-shadow-[0_6px_12px_rgba(251,191,36,0.5)]"
            />
            {hatPath && (
              <img
                src={hatPath}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -top-2 left-1/2 z-20 h-7 w-7 -translate-x-1/2 object-contain"
              />
            )}
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

          {/* Name + stage */}
          <div className="text-center leading-tight">
            <div className="inline-flex items-center gap-1 text-sm font-bold text-amber-900">
              <Sparkles className="h-3.5 w-3.5 text-pink-500" />
              {displayName}
            </div>
            {pet && (
              <div className="text-[11px] font-semibold text-amber-700">
                {stageLabel} · Cấp {pet.level}
              </div>
            )}
          </div>

          {/* CTA */}
          <Link
            to={cta.to}
            onClick={onItemClick}
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-[0_4px_14px_-4px_rgba(244,63,94,0.55)] hover:shadow-[0_6px_18px_-4px_rgba(244,63,94,0.7)] hover:scale-[1.03] transition active:scale-95"
          >
            <Target className="h-3.5 w-3.5" />
            {cta.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PetSidebarCard;
