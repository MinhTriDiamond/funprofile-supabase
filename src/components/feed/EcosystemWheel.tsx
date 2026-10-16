import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { ecosystemItems, type EcosystemItem } from '@/config/navigation';
import FunEcosystemLogo from './FunEcosystemLogo';
import { Button } from '@/components/ui/button';

import { useLanguage } from '@/i18n/LanguageContext';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

// Items excluded from orbit — rendered as list below
const BELOW_IDS = ['law-of-light', 'about'];

// Per-item scale overrides to visually equalize logo sizes
const logoScaleOverrides: Record<string, number> = {
  'angel-ai': 0.95,
  'fun-play': 1.25,
  'fun-farm': 1.25,
  'fun-planet': 1.25,
  'fun-charity': 1.25,
  'green-earth': 1.25,
  'fun-wallet': 1.15,
  'lovehub': 1.0,
  'urantia': 0.95,

  'fun-academy': 0.95,
};

// Ecosystem item description keys (translated at render time)
const ecosystemDescriptionKeys: Record<string, { subtitleKey: string; descriptionKey: string }> = {
  'fun-play': {
    subtitleKey: 'ecwPlaySub',
    descriptionKey: 'ecwPlayDesc',
  },
  'fun-farm': {
    subtitleKey: 'ecwFarmSub',
    descriptionKey: 'ecwFarmDesc',
  },
  'fun-planet': {
    subtitleKey: 'ecwPlanetSub',
    descriptionKey: 'ecwPlanetDesc',
  },
  'fun-wallet': {
    subtitleKey: 'ecwWalletSub',
    descriptionKey: 'ecwWalletDesc',
  },
  'fun-charity': {
    subtitleKey: 'ecwCharitySub',
    descriptionKey: 'ecwCharityDesc',
  },
  'fun-academy': {
    subtitleKey: 'ecwAcademySub',
    descriptionKey: 'ecwAcademyDesc',
  },
  'green-earth': {
    subtitleKey: 'ecwGreenEarthSub',
    descriptionKey: 'ecwGreenEarthDesc',
  },
  'lovehub': {
    subtitleKey: 'ecwLovehubSub',
    descriptionKey: 'ecwLovehubDesc',
  },
  'urantia': {
    subtitleKey: 'ecwUrantiaSub',
    descriptionKey: 'ecwUrantiaDesc',
  },

  'angel-ai': {
    subtitleKey: 'ecwAngelSub',
    descriptionKey: 'ecwAngelDesc',
  },
  'about': {
    subtitleKey: 'ecwAboutSub',
    descriptionKey: 'ecwAboutDesc',
  },
  'law-of-light': {
    subtitleKey: 'ecwLawSub',
    descriptionKey: 'ecwLawDesc',
  },
};

export default function EcosystemWheel({ onItemClick }: { onItemClick?: () => void }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [rotation, setRotation] = useState(0);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const orbitItems = ecosystemItems.filter(i => !BELOW_IDS.includes(i.id));

  const handleClick = (item: EcosystemItem) => {
    if (item.isExternal) {
      window.open(item.path, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.path);
    }
    onItemClick?.();
  };

  // Measure container and recalculate on resize/zoom
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Responsive sizing: fit wheel within container width with padding
  const dims = useMemo(() => {
    const availableWidth = containerWidth > 0 ? containerWidth - 8 : 300;
    const maxWheelSize = Math.min(availableWidth, 400);
    const orbitRadius = maxWheelSize * 0.40;
    const itemSize = maxWheelSize * 0.24 + 6; // circle size stays the same
    const logoSize = itemSize; // logo fills entire circle
    const halfItem = itemSize / 2;
    const size = (orbitRadius + halfItem) * 2;
    const centerSize = maxWheelSize * 0.34;
    const centerImgSize = centerSize - 8;
    return { orbitRadius, logoSize, itemSize, halfItem, size, centerSize, centerImgSize };
  }, [containerWidth]);

  // JS-based rotation — pauses on hover so images stay upright
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current) {
      const delta = time - lastTimeRef.current;
      setRotation(prev => (prev + delta * 0.009) % 360);
    }
    lastTimeRef.current = time;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!paused) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, animate]);

  return (
    <div className="sidebar-metallic-wheel space-y-3" ref={containerRef}>
      {/* Rotating wheel */}
      <div className="flex justify-center py-1">
        <div
          className="sidebar-wheel-stage relative overflow-visible"
          style={{ width: dims.size, height: dims.size, zIndex: 20 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <span aria-hidden="true" className="sidebar-wheel-star sidebar-wheel-star-one">✦</span>
          <span aria-hidden="true" className="sidebar-wheel-star sidebar-wheel-star-two">✧</span>
          <span aria-hidden="true" className="sidebar-wheel-star sidebar-wheel-star-three">✦</span>
          {/* Orbit ring */}
          <div
            className="sidebar-orbit-ring absolute rounded-full"
            style={{
              width: dims.orbitRadius * 2,
              height: dims.orbitRadius * 2,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Orbit items — always upright, positioned via JS */}
          {orbitItems.map((item, idx) => {
            const baseAngle = (360 / orbitItems.length) * idx - 90;
            const angle = baseAngle + rotation;
            const rad = (angle * Math.PI) / 180;
            const cx = dims.size / 2 + Math.cos(rad) * dims.orbitRadius - dims.halfItem;
            const cy = dims.size / 2 + Math.sin(rad) * dims.orbitRadius - dims.halfItem;

            return (
              <HoverCard openDelay={200} closeDelay={100} key={item.id}>
                <HoverCardTrigger asChild>
                  <Button variant="sidebar"
                    onClick={() => handleClick(item)}
                    className="sidebar-orbit-button absolute flex items-center justify-center group/item"
                    style={{
                      left: cx,
                      top: cy,
                      width: dims.itemSize,
                      height: dims.itemSize,
                    }}
                  >
                    <div
                      className="sidebar-gold-medallion w-full h-full rounded-full flex items-center justify-center group-hover/item:scale-110 transition-transform duration-300 overflow-hidden"
                    >
                      <img
                        src={item.avatar}
                        alt={item.name}
                        loading="lazy"
                        className="sidebar-orbit-logo block rounded-full object-cover cursor-pointer w-full h-full"
                        style={{ transform: `scale(${logoScaleOverrides[item.id] || 1.15})` }}
                      />
                    </div>
                  </Button>
                </HoverCardTrigger>
                {ecosystemDescriptionKeys[item.id] && (
                  <HoverCardContent
                    side="right"
                    align="start"
                    sideOffset={12}
                    collisionPadding={16}
                    className="w-60 z-[100] rounded-xl border border-yellow-300/30 bg-card shadow-xl p-3"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <img src={item.avatar} alt={item.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground leading-tight">{item.name}</p>
                        <p className="text-[11px] text-primary italic leading-tight">{t(ecosystemDescriptionKeys[item.id].subtitleKey)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(ecosystemDescriptionKeys[item.id].descriptionKey)}
                    </p>
                  </HoverCardContent>
                )}
              </HoverCard>
            );
          })}

          {/* Center: FUN Ecosystem logo with sun halo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            {/* Gold ring + logo */}
            <div
              className="sidebar-center-ring relative rounded-full p-[3px]"
            >
              <div
                className="sidebar-center-disc rounded-full flex items-center justify-center overflow-hidden"
                style={{ width: dims.centerSize, height: dims.centerSize }}
              >
                <FunEcosystemLogo size={dims.centerImgSize} />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
