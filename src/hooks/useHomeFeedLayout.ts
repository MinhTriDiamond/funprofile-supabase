/**
 * useHomeFeedLayout — Smart auto-collapse Home Feed chrome khi user cuộn xuống.
 *
 * Trả về { scrollY, isCompact, isReadingMode, isMobile, reducedMotion } để các
 * khối UI (Hero/Livestream/CreatePost/Stories) tự thu gọn nhằm ưu tiên content.
 *
 * - Không thay đổi business logic, chỉ điều phối UI state.
 * - Throttle qua requestAnimationFrame + passive listener.
 * - Hysteresis ±20px tránh nhảy state ở biên.
 * - Reduced motion: luôn giữ expanded (false/false).
 */
import { useEffect, useRef, useState } from 'react';

interface HomeFeedLayoutState {
  scrollY: number;
  isCompact: boolean;
  isReadingMode: boolean;
  isMobile: boolean;
  reducedMotion: boolean;
}

const HYSTERESIS = 20;

export function useHomeFeedLayout(): HomeFeedLayoutState {
  const [state, setState] = useState<HomeFeedLayoutState>(() => ({
    scrollY: 0,
    isCompact: false,
    isReadingMode: false,
    isMobile: typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
    reducedMotion: typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  }));

  const rafRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mqMobile = window.matchMedia('(max-width: 767px)');
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const computeThresholds = (isMobile: boolean) =>
      isMobile
        ? { compact: 100, reading: 250 }
        : { compact: 150, reading: 400 };

    // Feed dùng scroll container [data-app-scroll]; fallback window.
    const getScrollTarget = (): HTMLElement | Window =>
      document.querySelector<HTMLElement>('[data-app-scroll]') ?? window;

    const getScrollY = (target: HTMLElement | Window) =>
      target instanceof Window
        ? (window.scrollY || window.pageYOffset || 0)
        : target.scrollTop;

    let scrollTarget: HTMLElement | Window = getScrollTarget();

    const evaluate = () => {
      rafRef.current = null;
      const prev = stateRef.current;
      const y = getScrollY(scrollTarget);
      const isMobile = mqMobile.matches;
      const reducedMotion = mqMotion.matches;
      const { compact, reading } = computeThresholds(isMobile);

      if (reducedMotion) {
        if (
          prev.scrollY === y &&
          prev.isMobile === isMobile &&
          prev.reducedMotion === reducedMotion &&
          !prev.isCompact &&
          !prev.isReadingMode
        ) return;
        setState({ scrollY: y, isCompact: false, isReadingMode: false, isMobile, reducedMotion });
        return;
      }

      const nextCompact = prev.isCompact
        ? y > compact - HYSTERESIS
        : y > compact;
      const nextReading = prev.isReadingMode
        ? y > reading - HYSTERESIS
        : y > reading;

      if (
        nextCompact === prev.isCompact &&
        nextReading === prev.isReadingMode &&
        prev.isMobile === isMobile &&
        prev.reducedMotion === reducedMotion &&
        Math.abs(prev.scrollY - y) < 4
      ) return;

      setState({
        scrollY: y,
        isCompact: nextCompact,
        isReadingMode: nextReading,
        isMobile,
        reducedMotion,
      });
    };

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(evaluate);
    };

    const onMqChange = () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(evaluate);
    };

    const attach = (target: HTMLElement | Window) => {
      target.addEventListener('scroll', onScroll, { passive: true } as AddEventListenerOptions);
    };
    const detach = (target: HTMLElement | Window) => {
      target.removeEventListener('scroll', onScroll);
    };

    attach(scrollTarget);

    // [data-app-scroll] có thể mount sau hook → check lại 1 frame.
    let retryId: number | null = window.requestAnimationFrame(() => {
      retryId = null;
      const next = getScrollTarget();
      if (next !== scrollTarget) {
        detach(scrollTarget);
        scrollTarget = next;
        attach(scrollTarget);
      }
      evaluate();
    });

    mqMobile.addEventListener?.('change', onMqChange);
    mqMotion.addEventListener?.('change', onMqChange);

    onScroll();

    return () => {
      detach(scrollTarget);
      mqMobile.removeEventListener?.('change', onMqChange);
      mqMotion.removeEventListener?.('change', onMqChange);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (retryId != null) window.cancelAnimationFrame(retryId);
    };
  }, []);

  return state;
}
