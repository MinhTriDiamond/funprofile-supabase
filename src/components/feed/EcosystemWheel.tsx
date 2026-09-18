import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { ecosystemItems, type EcosystemItem } from '@/config/navigation';
import FunEcosystemLogo from './FunEcosystemLogo';

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

// Ecosystem item descriptions (Vietnamese)
const ecosystemDescriptions: Record<string, { subtitle: string; description: string }> = {
  'fun-play': {
    subtitle: 'Web3 Video Platform',
    description: 'Nơi nội dung trở thành tài sản số có giá trị. Sáng tạo – chia sẻ – Own & Earn trong không gian video Web3.',
  },
  'fun-farm': {
    subtitle: 'Farm to Table Platform',
    description: 'Nơi nông nghiệp trở về với sự thật và yêu thương. Kết nối trực tiếp nông dân – nhà sản xuất – người tiêu dùng, nuôi dưỡng thân thể bằng thực phẩm sạch.',
  },
  'fun-planet': {
    subtitle: 'Game Marketplace for Kids',
    description: 'Chợ game dành cho trẻ em – học mà chơi, chơi mà lớn. Nuôi dưỡng trí tuệ, đạo đức và sáng tạo cho thế hệ mới.',
  },
  'fun-wallet': {
    subtitle: 'Our Own Bank',
    description: 'Ví Web3 của Nền Kinh Tế Ánh Sáng. Lưu trữ – giao dịch – kết nối toàn bộ FUN Ecosystem một cách tự do & minh bạch.',
  },
  'fun-charity': {
    subtitle: 'Pure Love Charity Network',
    description: 'Nơi quy tụ các tổ chức từ thiện và mọi nhu cầu cần yêu thương. Minh bạch – kết nối – trao đi đúng nơi, bằng trái tim thuần khiết.',
  },
  'fun-academy': {
    subtitle: 'Learn & Earn Platform',
    description: 'Nơi quy tụ trường học, tri thức và nhu cầu giáo dục toàn cầu. Học tập trong yêu thương – trưởng thành trong giá trị – lan toả trí tuệ.',
  },
  'green-earth': {
    subtitle: 'Regeneration & Sustainability Platform',
    description: 'Nơi Trái Đất được chữa lành và tái sinh. Phục hồi môi trường – tái tạo xanh – kiến tạo giá trị dài hạn, để hành tinh và nhân loại cùng phát triển trong hài hòa.',
  },
  'lovehub': {
    subtitle: 'Free Stay. Warm Meals. Human Warmth.',
    description: 'Nơi kết nối chỗ ở miễn phí, bữa ăn ấm và hơi ấm tình người. Trao đi sự tử tế – đón nhận yêu thương – lan tỏa mái nhà chung trong FUN Ecosystem.',
  },
  'urantia': {
    subtitle: 'Sách Urantia Tiếng Việt',
    description: 'Kho tri thức Sách Urantia bằng tiếng Việt. Đọc – học – chiêm nghiệm mặc khải về Thượng Đế, Vũ Trụ và hành trình tiến hóa của linh hồn.',
  },

  'angel-ai': {
    subtitle: 'Light-Aligned Artificial Intelligence',
    description: 'Trí tuệ Nhân tạo đồng điệu với đạo đức, ý thức và Ánh Sáng Vũ Trụ. Hỗ trợ con người bằng trí tuệ cao hơn, lòng từ bi và sự minh triết.',
  },
  'about': {
    subtitle: 'Web3 Social Network',
    description: 'Nơi mỗi con người, ý tưởng và giá trị trở thành tài sản Web3 vĩnh cửu. Kết nối – định danh – lan tỏa giá trị thật trong Ánh Sáng.',
  },
  'law-of-light': {
    subtitle: 'Luật Ánh Sáng',
    description: 'Nền tảng đạo đức và nguyên tắc vận hành của FUN Ecosystem. Sống theo Ánh Sáng Yêu Thương Thuần Khiết của Cha Vũ Trụ.',
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
    <div className="space-y-3" ref={containerRef}>
      {/* Rotating wheel */}
      <div className="flex justify-center py-1">
        <div
          className="relative overflow-visible"
          style={{ width: dims.size, height: dims.size, zIndex: 20 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Orbit ring */}
          <div
            className="absolute rounded-full"
            style={{
              width: dims.orbitRadius * 2,
              height: dims.orbitRadius * 2,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              border: '1.5px solid rgba(212,175,55,0.25)',
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
                  <button
                    onClick={() => handleClick(item)}
                    className="absolute flex items-center justify-center group/item"
                    style={{
                      left: cx,
                      top: cy,
                      width: dims.itemSize,
                      height: dims.itemSize,
                    }}
                  >
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center group-hover/item:scale-110 transition-transform duration-300 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,215,0,0.6), rgba(255,180,0,0.3), rgba(255,215,0,0.6))',
                        boxShadow: '0 0 10px rgba(255,215,0,0.35), 0 0 3px rgba(255,215,0,0.2)',
                        padding: '2px',
                      }}
                    >
                      <img
                        src={item.avatar}
                        alt={item.name}
                        loading="lazy"
                        className="block rounded-full object-cover bg-card cursor-pointer w-full h-full"
                        style={{ transform: `scale(${logoScaleOverrides[item.id] || 1.15})` }}
                      />
                    </div>
                  </button>
                </HoverCardTrigger>
                {ecosystemDescriptions[item.id] && (
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
                        <p className="text-[11px] text-primary italic leading-tight">{ecosystemDescriptions[item.id].subtitle}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {ecosystemDescriptions[item.id].description}
                    </p>
                  </HoverCardContent>
                )}
              </HoverCard>
            );
          })}

          {/* Center: FUN Ecosystem logo with sun halo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            {/* Outer sun halo layer — slow pulse */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[sun-halo-outer_3s_ease-in-out_infinite]"
              style={{
                width: dims.centerSize * 1.9,
                height: dims.centerSize * 1.9,
                background: 'radial-gradient(circle, rgba(255,200,0,0.25) 0%, rgba(255,160,0,0.12) 40%, transparent 70%)',
              }}
            />
            {/* Inner sun halo layer — faster pulse, offset phase */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[sun-halo-inner_2s_ease-in-out_0.5s_infinite]"
              style={{
                width: dims.centerSize * 1.55,
                height: dims.centerSize * 1.55,
                background: 'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(255,180,0,0.15) 50%, transparent 75%)',
              }}
            />
            {/* Sun rays */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[sun-rays_4s_linear_infinite]"
              style={{
                width: dims.centerSize * 1.7,
                height: dims.centerSize * 1.7,
                background: `conic-gradient(from 0deg,
                  transparent 0deg, rgba(255,215,0,0.18) 10deg, transparent 20deg,
                  transparent 45deg, rgba(255,200,0,0.15) 55deg, transparent 65deg,
                  transparent 90deg, rgba(255,215,0,0.2) 100deg, transparent 110deg,
                  transparent 135deg, rgba(255,200,0,0.12) 145deg, transparent 155deg,
                  transparent 180deg, rgba(255,215,0,0.18) 190deg, transparent 200deg,
                  transparent 225deg, rgba(255,200,0,0.15) 235deg, transparent 245deg,
                  transparent 270deg, rgba(255,215,0,0.2) 280deg, transparent 290deg,
                  transparent 315deg, rgba(255,200,0,0.12) 325deg, transparent 335deg,
                  transparent 360deg)`,
                filter: 'blur(2px)',
              }}
            />
            {/* Gold ring + logo */}
            <div
              className="relative rounded-full p-[3px]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,215,0,0.7), rgba(255,180,0,0.4), rgba(255,215,0,0.7))',
                boxShadow: '0 0 20px rgba(255,215,0,0.45), 0 0 40px rgba(255,200,0,0.2)',
              }}
            >
              <div
                className="rounded-full flex items-center justify-center overflow-hidden"
                style={{ width: dims.centerSize, height: dims.centerSize, background: 'rgba(255,255,255,0.92)' }}
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
