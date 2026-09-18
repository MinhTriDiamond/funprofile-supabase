import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag, BicepsFlexed, ShieldAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PetSection = 'home' | 'shop' | 'arena' | 'appeal';

interface PetSectionNavProps {
  active?: PetSection;
  className?: string;
}

interface PetSectionItem {
  key: PetSection;
  to: string;
  label: string;
  Icon: LucideIcon;
}

const ITEMS: PetSectionItem[] = [
  { key: 'home', to: '/pet', label: 'Lumi của tôi', Icon: Sparkles },
  { key: 'shop', to: '/pet/shop', label: 'Shop CAMLY', Icon: ShoppingBag },
  { key: 'arena', to: '/pet/arena', label: 'Arena 1v1', Icon: BicepsFlexed },
  { key: 'appeal', to: '/pet/appeal', label: 'Kháng nghị', Icon: ShieldAlert },
];

/**
 * Thanh điều hướng dùng chung cho 4 trang Lumi (/pet, /pet/shop, /pet/arena, /pet/appeal).
 * Luôn hiển thị để user nhảy nhanh giữa các mục chơi game.
 */
export function PetSectionNav({ active, className }: PetSectionNavProps) {
  return (
    <nav
      aria-label="Điều hướng Linh thú Lumi"
      className={cn(
        'sticky top-[6.5rem] z-20 -mx-3 px-3 py-2 border-b border-border/60',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {ITEMS.map(({ key, to, label, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            to={to}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs sm:text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-foreground hover:bg-muted/70',
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
