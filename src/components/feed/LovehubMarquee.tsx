import { useEffect, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import lovehubImg from '@/assets/lovehub/lovehub-1.png';
import lovehubImg2 from '@/assets/lovehub/lovehub-2.png';
import lovehubImg3 from '@/assets/lovehub/lovehub-3.png';
import lovehubImg4 from '@/assets/lovehub/lovehub-4.png';
import lovehubImg5 from '@/assets/lovehub/lovehub-5.png';
import lovehubImg6 from '@/assets/lovehub/lovehub-6.png';
import lovehubImg7 from '@/assets/lovehub/lovehub-7.png';
import lovehubImg8 from '@/assets/lovehub/lovehub-8.png';
import lovehubHeal from '@/assets/lovehub/lovehub-heal.png';
import lovehubLanding from '@/assets/lovehub/lovehub-landing.png';
import lovehubFranchise from '@/assets/lovehub/lovehub-franchise.png';
import lovehubFinancialFlow from '@/assets/lovehub/lovehub-financial-flow.png';
import lovehubTinhNguoi from '@/assets/lovehub/lovehub-tinh-nguoi.png';
import lovehubTimBanTuThien from '@/assets/lovehub/lovehub-tim-ban-tu-thien.png';
import lovehubTuDo from '@/assets/lovehub/lovehub-tu-do.png';
import lovehubTuHoc from '@/assets/lovehub/lovehub-tu-hoc.png';
import lovehubSoulPassport from '@/assets/lovehub/lovehub-soul-passport.png';
import lovehubTuyenNgon from '@/assets/lovehub/lovehub-tuyen-ngon.png';


interface MarqueeItem {
  img: string;
  titleKey: string;
  subtitleKey?: string;
  url: string;
}

const items: MarqueeItem[] = [
  {
    img: lovehubTuyenNgon,
    titleKey: 'lhmItem1Title',
    subtitleKey: 'lhmItem1Subtitle',
    url: 'https://www.facebook.com/share/p/18mmAtPBbb/',
  },
  {
    img: lovehubSoulPassport,
    titleKey: 'lhmItem2Title',
    subtitleKey: 'lhmItem2Subtitle',
    url: 'https://www.facebook.com/share/p/18k5dTQhAE/',
  },
  {
    img: lovehubTuHoc,
    titleKey: 'lhmItem3Title',
    subtitleKey: 'lhmItem3Subtitle',
    url: 'https://www.facebook.com/share/p/18RT6RapAB/',
  },
  {
    img: lovehubTuDo,
    titleKey: 'lhmItem4Title',
    subtitleKey: 'lhmItem4Subtitle',
    url: 'https://www.facebook.com/share/p/1HdQQoNkpv/',
  },
  {
    img: lovehubTimBanTuThien,
    titleKey: 'lhmItem5Title',
    subtitleKey: 'lhmItem5Subtitle',
    url: 'https://www.facebook.com/share/p/1BVgvZpc2G/',
  },
  {
    img: lovehubTinhNguoi,
    titleKey: 'lhmItem6Title',
    subtitleKey: 'lhmItem6Subtitle',
    url: 'https://www.facebook.com/share/p/1ByP26uTY4/',
  },
  {
    img: lovehubFinancialFlow,
    titleKey: 'lhmItem7Title',
    subtitleKey: 'lhmItem7Subtitle',
    url: 'https://www.facebook.com/share/p/14fvaoR2NN7/',
  },
  {
    img: lovehubFranchise,
    titleKey: 'lhmItem8Title',
    subtitleKey: 'lhmItem8Subtitle',
    url: 'https://lovehub.fun.rich/franchise',
  },
  {
    img: lovehubLanding,
    titleKey: 'lhmItem9Title',
    subtitleKey: 'lhmItem9Subtitle',
    url: 'https://lovehub.fun.rich/',
  },
  {
    img: lovehubHeal,
    titleKey: 'lhmItem10Title',
    subtitleKey: 'lhmItem10Subtitle',
    url: 'https://www.facebook.com/share/p/1CrebQV77g/',
  },

  {
    img: lovehubImg3,
    titleKey: 'lhmItem11Title',
    url: 'https://www.facebook.com/share/p/1E2Bugok8v/',
  },
  {
    img: lovehubImg2,
    titleKey: 'lhmItem12Title',
    url: 'https://www.facebook.com/share/p/1JW4U2NwvG/',
  },
  {
    img: lovehubImg4,
    titleKey: 'lhmItem13Title',
    url: 'https://www.facebook.com/share/p/1CPQWmqDit/',
  },
  {
    img: lovehubImg,
    titleKey: 'lhmItem14Title',
    url: 'https://www.facebook.com/share/p/18SkJnKjG1/',
  },
  {
    img: lovehubImg5,
    titleKey: 'lhmItem15Title',
    url: 'https://www.facebook.com/share/18PzzHVQhJ/',
  },
  {
    img: lovehubImg6,
    titleKey: 'lhmItem16Title',
    subtitleKey: 'lhmItem16Subtitle',
    url: 'https://www.facebook.com/share/17bLjah2Ki/',
  },
  {
    img: lovehubImg7,
    titleKey: 'lhmItem17Title',
    url: 'https://www.facebook.com/share/p/18VAxBMskr/',
  },
  {
    img: lovehubImg8,
    titleKey: 'lhmItem18Title',
    url: 'https://www.facebook.com/share/p/1ateAN3hxD/',
  },
];

const SPEED_PX_PER_FRAME = 0.5;

export function LovehubMarquee() {
  const { t } = useLanguage();
  const loop = [...items, ...items];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const isHoverRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isTouchingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const reducedMotionRef = useRef(false);

  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);

  const updateArrowState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      reducedMotionRef.current = motionQuery.matches;
      setAutoScrollEnabled(desktopQuery.matches && !motionQuery.matches);
    };

    sync();
    motionQuery.addEventListener('change', sync);
    desktopQuery.addEventListener('change', sync);
    return () => {
      motionQuery.removeEventListener('change', sync);
      desktopQuery.removeEventListener('change', sync);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // Luôn chạy animation cho mọi user, kể cả khi OS bật "reduce motion",
    // để bất kỳ ai mở fun.rich đều thấy marquee chuyển động.
    // Bắt đầu từ giữa để cuộn vô tận hai chiều cảm giác mượt
    el.scrollLeft = 1;
    updateArrowState();
    if (!autoScrollEnabled) return;

    const tick = () => {
      const node = scrollerRef.current;
      if (!node) return;
      const paused =
        isHoverRef.current ||
        isDraggingRef.current ||
        isTouchingRef.current ||
        document.hidden ||
        reducedMotionRef.current;
      if (!paused) {
        node.scrollLeft += SPEED_PX_PER_FRAME;
        // Loop liền mạch: list được nhân đôi
        const half = node.scrollWidth / 2;
        if (node.scrollLeft >= half) {
          node.scrollLeft -= half;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [autoScrollEnabled, updateArrowState]);

  const scrollByAmount = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Drag-to-scroll (chuột)
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartXRef.current = e.pageX;
    dragStartScrollRef.current = el.scrollLeft;
  };
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.pageX - dragStartXRef.current;
    if (Math.abs(dx) > 5) dragMovedRef.current = true;
    el.scrollLeft = dragStartScrollRef.current - dx;
  };
  const endDrag = () => {
    isDraggingRef.current = false;
    // reset cờ sau microtask để onClickCapture vẫn đọc được
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  };

  const onLinkClickCapture = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className="group relative mt-2 mb-3"
      onMouseEnter={() => {
        isHoverRef.current = true;
      }}
      onMouseLeave={() => {
        isHoverRef.current = false;
      }}
    >
      {/* Nút trái */}
      <button
        type="button"
        aria-label={t('lhmScrollLeft')}
        onClick={() => scrollByAmount(-1)}
        className={`absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-background/90 backdrop-blur border border-border/60 shadow-md hover:bg-background hover:shadow-lg transition flex items-center justify-center ${
          canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
      </button>

      {/* Nút phải */}
      <button
        type="button"
        aria-label={t('lhmScrollRight')}
        onClick={() => scrollByAmount(1)}
        className={`absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-background/90 backdrop-blur border border-border/60 shadow-md hover:bg-background hover:shadow-lg transition flex items-center justify-center ${
          canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
      </button>

      {/* Scroller */}
      <div
        ref={scrollerRef}
        onScroll={updateArrowState}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={() => {
          isTouchingRef.current = true;
        }}
        onTouchEnd={() => {
          isTouchingRef.current = false;
        }}
        onTouchCancel={() => {
          isTouchingRef.current = false;
        }}
        className={`overflow-x-auto overflow-y-hidden flex gap-4 px-2 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)] ${
          isDraggingRef.current ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {loop.map((item, idx) => (
          <a
            key={idx}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClickCapture={onLinkClickCapture}
            onDragStart={(e) => e.preventDefault()}
            className="shrink-0 w-56 sm:w-64 bg-card border border-border/40 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            <div className="w-full h-[107px] sm:h-[125px] overflow-hidden bg-muted">
              <img
                src={item.img}
                alt={t(item.titleKey)}
                loading="lazy"
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
            <div className="p-2.5">
              <p className="text-sm font-semibold leading-snug text-foreground line-clamp-1">
                {t(item.titleKey)}
              </p>
              {item.subtitleKey && (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-1">
                  {t(item.subtitleKey)}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default LovehubMarquee;
