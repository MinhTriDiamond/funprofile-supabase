import { useState, MouseEvent } from 'react';
import { usePublicPet } from '../hooks/usePublicPet';
import { resolvePetSprite } from '../lib/petAssets';
import { PetQuickViewDialog } from './PetQuickViewDialog';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  currentUserId?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function PetMiniBadge({ userId, currentUserId, size = 'sm', className }: Props) {
  const { data: pet } = usePublicPet(userId);
  const [open, setOpen] = useState(false);

  if (!pet || !pet.visible) return null;

  const sprite = resolvePetSprite(pet.evolution_stage, pet.equipped_skin_slug);
  const dim = size === 'md' ? 'w-9 h-9' : 'w-7 h-7';

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={`Lumi ${pet.name} • Lv ${pet.level} • ${pet.cheers_received_total} cổ vũ`}
        aria-label={`Xem Linh thú Lumi của ${pet.name}`}
        className={cn(
          'relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-950/60 dark:to-purple-950/40 border border-pink-300/70 dark:border-pink-800/60 shadow-sm hover:scale-110 transition-transform',
          dim,
          className,
        )}
      >
        <img
          src={sprite}
          alt=""
          className="w-full h-full object-contain p-0.5"
          aria-hidden
          loading="lazy"
        />
        <span className="absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded-full bg-pink-500 text-white leading-tight shadow">
          {pet.level}
        </span>
      </button>

      {open && (
        <PetQuickViewDialog
          userId={userId}
          currentUserId={currentUserId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
