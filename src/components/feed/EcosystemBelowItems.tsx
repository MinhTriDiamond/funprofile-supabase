import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ecosystemItems, type EcosystemItem } from '@/config/navigation';

import { useLanguage } from '@/i18n/LanguageContext';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

const BELOW_IDS = ['law-of-light', 'about'];

/**
 * Mục "Law of Light" + "Về FUN Profile" + Lumi mini card.
 * Tách ra khỏi EcosystemWheel để có thể render ở vị trí khác (dưới phần Lối tắt).
 */
export function EcosystemBelowItems({ onItemClick }: { onItemClick?: () => void }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const descriptions: Record<string, { subtitle: string; description: string }> = {
    about: {
      subtitle: 'Web3 Social Network',
      description: t('ecoFunProfileDesc'),
    },
    'law-of-light': {
      subtitle: t('ecoLawSubtitle'),
      description: t('ecoLawDesc'),
    },
  };
  const belowItems = ecosystemItems.filter((i) => BELOW_IDS.includes(i.id));

  const handleClick = (item: EcosystemItem) => {
    if (item.isExternal) {
      window.open(item.path, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.path);
    }
    onItemClick?.();
  };

  return (
    <div className="space-y-1">
      {belowItems.map((item) => (
        <HoverCard openDelay={200} closeDelay={100} key={item.id}>
          <HoverCardTrigger asChild>
            <Button variant="sidebar"
              onClick={() => handleClick(item)}
              className={`sidebar-metallic-pill sidebar-link-pill ${item.isSpecial ? "sidebar-gold-pill" : "sidebar-emerald-pill"} w-full flex items-center gap-3 p-2 transition-all duration-300 group`}
            >
              {item.isSpecial ? (
                <div
                  className="sidebar-direct-logo w-9 h-9 flex items-center justify-center"
                >
                  <Sparkles className="sidebar-gold-icon w-7 h-7" />
                </div>
              ) : (
                <img
                  src={item.avatar}
                  alt={item.name}
                  width={36}
                  height={36}
                  loading="lazy"
                  className="sidebar-direct-logo w-9 h-9 object-contain"
                />
              )}
              <span
                className={`font-semibold text-sm ${item.isSpecial ? "sidebar-gold-pill-label" : "sidebar-gold-text"}`}
              >
                {item.id === 'about' ? t('aboutFunProfile') : item.name}
              </span>
            </Button>
          </HoverCardTrigger>
          {descriptions[item.id] && (
            <HoverCardContent
              side="right"
              align="start"
              sideOffset={12}
              collisionPadding={16}
              className="w-60 z-[100] rounded-xl border border-yellow-300/30 bg-card shadow-xl p-3"
            >
              <div className="flex items-center gap-2.5 mb-2">
                {item.isSpecial ? (
                  <Sparkles className="w-9 h-9 text-yellow-400 flex-shrink-0" />
                ) : (
                  <img
                    src={item.avatar}
                    alt={item.name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground leading-tight">{item.name}</p>
                  <p className="text-[11px] text-primary italic leading-tight">
                    {descriptions[item.id].subtitle}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {descriptions[item.id].description}
              </p>
            </HoverCardContent>
          )}
        </HoverCard>
      ))}

    </div>
  );
}

export default EcosystemBelowItems;
