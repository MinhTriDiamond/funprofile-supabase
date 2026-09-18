import { useNavigate } from 'react-router-dom';
import { Sparkles, Target } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePetState } from '../hooks/usePetState';
import { usePetCosmetics } from '../hooks/usePetCosmetics';
import { resolvePetSprite, STAGE_NAMES, nextThreshold } from '../lib/petAssets';

/**
 * Nút Linh thú Lumi nằm cạnh logo ANGEL AI trên navbar.
 * Hover: hiện cấp độ / stage / XP và nút "Làm nhiệm vụ hôm nay".
 */
export function PetNavHoverButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useCurrentUser();
  const { data: pet } = usePetState();
  const { data: cosmetics } = usePetCosmetics();

  const equippedSkin = cosmetics?.find((c) => c.equipped && c.catalog.slot === 'skin');
  const stage = pet?.evolution_stage ?? 1;
  const sprite = resolvePetSprite(stage, equippedSkin?.catalog.slug);
  const displayName = pet?.name ?? 'Lumi';
  const stageLabel = STAGE_NAMES[stage] ?? 'Seed';
  const next = pet ? nextThreshold(stage) : null;

  const cta = isAuthenticated
    ? { to: '/quests', label: 'Làm nhiệm vụ hôm nay' }
    : { to: '/auth', label: 'Đăng nhập gặp Lumi' };

  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => navigate(cta.to)}
          aria-label={`Linh thú ${displayName}`}
          className={`relative flex items-center justify-center w-10 h-10 rounded-full border-[0.5px] border-transparent hover:border-pink-400/60 hover:bg-pink-500/10 transition-all duration-300 group ${className}`}
        >
          <img
            src={sprite}
            alt={displayName}
            className="w-7 h-7 object-contain transition-transform duration-300 group-hover:scale-110 drop-shadow-[0_0_6px_rgba(244,114,182,0.55)]"
          />
          {pet && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold leading-none px-1 py-[1px] rounded-full bg-pink-500 text-white shadow">
              {pet.level}
            </span>
          )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="bottom" align="center" className="w-60 p-3">
        <div className="flex items-center gap-3">
          <img src={sprite} alt="" aria-hidden className="w-12 h-12 object-contain" />
          <div className="min-w-0">
            <p className="text-sm font-bold flex items-center gap-1 text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              {displayName}
            </p>
            {pet ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {stageLabel} · Cấp {pet.level}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {next ? `${pet.xp}/${next} XP` : `${pet.xp} XP`}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa có linh thú</p>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate(cta.to)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 px-3 py-2 text-xs font-bold text-primary-foreground shadow-md hover:opacity-90 active:scale-95 transition"
        >
          <Target className="w-3.5 h-3.5" />
          {cta.label}
        </button>
      </HoverCardContent>
    </HoverCard>
  );
}

export default PetNavHoverButton;
