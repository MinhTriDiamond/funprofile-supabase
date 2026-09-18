import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';

interface LawOfLightGuardProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/law-of-light', '/docs', '/auth', '/reset-password', '/verify-email', '/set-password'];
const PROTECTED_PREFIXES = ['/admin', '/begin', '/connected-apps', '/founder'];

/** Chu kỳ re-check cổng Luật Ánh Sáng khi đã login (ms). */
const RECHECK_INTERVAL_MS = 60_000;
/** Số lần thử lại khi chưa thấy dòng profiles (trigger handle_new_user chưa commit). */
const PROFILE_FETCH_ATTEMPTS = 3;
const PROFILE_RETRY_DELAY_MS = 700;

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname.startsWith(p));

const isProtectedPath = (pathname: string) =>
  PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const LawOfLightGuard = ({ children }: LawOfLightGuardProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [isBanned, setIsBanned] = useState(false);

  const wasAuthenticatedRef = useRef(false);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkInFlightRef = useRef(false);
  /**
   * Trạng thái cổng pháp lý:
   *  - 'unknown'  : chưa xác nhận được → COI NHƯ CHƯA KÝ (fail-closed)
   *  - 'accepted' : đã ký, xác nhận từ DB
   */
  const lawStatusRef = useRef<'unknown' | 'accepted'>('unknown');

  /** Đọc profiles với retry ngắn để không kết luận sai khi trigger chưa commit. */
  const fetchProfileGate = useCallback(async (userId: string) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= PROFILE_FETCH_ATTEMPTS; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('law_of_light_accepted, is_banned')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) return data;
      lastError = error;
      if (attempt < PROFILE_FETCH_ATTEMPTS) await sleep(PROFILE_RETRY_DELAY_MS);
    }
    if (lastError) {
      console.warn('[LawOfLightGuard] profile fetch failed', lastError);
    }
    // Không đọc được / chưa có dòng profiles → fail-closed
    return null;
  }, []);

  const runFullCheck = useCallback(async (pathname: string): Promise<void> => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        lawStatusRef.current = 'unknown';
        if (isPublicPath(pathname) || !isProtectedPath(pathname)) {
          // Khách xem nội dung công khai
          setIsAllowed(true);
          return;
        }
        navigate('/auth', { replace: true });
        setIsAllowed(false);
        return;
      }

      wasAuthenticatedRef.current = true;

      const profile = await fetchProfileGate(session.user.id);

      if (profile?.is_banned) {
        console.warn('[LawOfLightGuard] User is banned, signing out');
        await supabase.auth.signOut();
        setIsBanned(true);
        setIsAllowed(false);
        return;
      }

      // Đồng bộ chữ ký đã lưu tạm ở localStorage (user ký trước khi có tài khoản)
      if (profile && !profile.law_of_light_accepted) {
        const pending = localStorage.getItem('law_of_light_accepted_pending');
        if (pending === 'true') {
          const { error: updateError } = await supabase.from('profiles').update({
            law_of_light_accepted: true,
            law_of_light_accepted_at: new Date().toISOString(),
          }).eq('id', session.user.id);
          if (!updateError) {
            localStorage.removeItem('law_of_light_accepted_pending');
            lawStatusRef.current = 'accepted';
            setIsAllowed(true);
            return;
          }
          console.warn('[LawOfLightGuard] sync pending acceptance failed', updateError);
        }
      }

      if (profile?.law_of_light_accepted === true) {
        lawStatusRef.current = 'accepted';
        setIsAllowed(true);
        return;
      }

      // FAIL-CLOSED: chưa ký, hoặc không xác nhận được (profile null / lỗi mạng)
      lawStatusRef.current = 'unknown';
      if (isPublicPath(pathname)) {
        setIsAllowed(true);
        return;
      }
      navigate('/law-of-light', { replace: true });
      setIsAllowed(false);
    } catch (error) {
      console.error('[LawOfLightGuard] Error:', error);
      // FAIL-CLOSED: cổng pháp lý — không chắc chắn thì CHẶN.
      lawStatusRef.current = 'unknown';
      if (isPublicPath(pathname) || !wasAuthenticatedRef.current) {
        setIsAllowed(true);
      } else {
        navigate('/law-of-light', { replace: true });
        setIsAllowed(false);
      }
    } finally {
      checkInFlightRef.current = false;
      setInitialCheckDone(true);
    }
  }, [navigate, fetchProfileGate]);

  // Effect 1: Auth listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION' ||
        event === 'USER_UPDATED'
      ) {
        if (signOutTimerRef.current) {
          clearTimeout(signOutTimerRef.current);
          signOutTimerRef.current = null;
        }
        if (session) {
          const changedUser = wasAuthenticatedRef.current === false;
          wasAuthenticatedRef.current = true;
          // Đăng nhập mới → phải xác thực lại cổng Luật Ánh Sáng
          if (changedUser || event === 'SIGNED_IN') {
            lawStatusRef.current = 'unknown';
            void runFullCheck(window.location.pathname);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        lawStatusRef.current = 'unknown';
        if (wasAuthenticatedRef.current) {
          if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
          signOutTimerRef.current = setTimeout(async () => {
            signOutTimerRef.current = null;
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession) {
              wasAuthenticatedRef.current = false;
              if (isProtectedPath(window.location.pathname)) {
                navigate('/auth', { replace: true });
              }
            }
          }, 1500);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
    };
  }, [navigate, runFullCheck]);

  // Effect 2: Mount-once initial check (safety net KHÔNG mở cổng pháp lý)
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Check treo > 8s: bỏ spinner để không khoá màn hình trắng,
      // nhưng KHÔNG kết luận đã ký — Effect 3 + interval sẽ chặn ngay khi biết.
      setInitialCheckDone(true);
      setIsAllowed(true);
      void runFullCheck(window.location.pathname);
    }, 8000);

    runFullCheck(window.location.pathname).finally(() => {
      clearTimeout(timeout);
    });

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 3: Mỗi lần chuyển route — re-check cổng pháp lý nếu chưa xác nhận.
  // KHÔNG tin `wasAuthenticatedRef` (chỉ set bởi sự kiện auth) — runFullCheck
  // tự đọc session hiện có, nên bắt được cả trường hợp login ở tab khác.
  useEffect(() => {
    if (!initialCheckDone) return;
    const path = location.pathname;

    // Đã xác nhận đã ký → tin luôn, KHÔNG gọi DB.
    if (lawStatusRef.current === 'accepted') {
      setIsAllowed(true);
      return;
    }

    if (isPublicPath(path)) {
      setIsAllowed(true);
      // Vẫn xác minh nền (đọc session + DB) để không bỏ sót login từ tab khác.
      void runFullCheck(path);
      return;
    }

    // Chưa xác nhận được đã ký → kiểm tra lại ngay (fail-closed)
    void runFullCheck(path);
  }, [location.pathname, initialCheckDone, navigate, runFullCheck]);

  // Effect 4: Re-check định kỳ + khi tab được focus lại, CHỈ khi chưa xác nhận.
  useEffect(() => {
    const maybeRecheck = () => {
      if (lawStatusRef.current === 'accepted') return; // đã ký → không tải DB
      void runFullCheck(window.location.pathname);
    };
    const id = setInterval(maybeRecheck, RECHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeRecheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', maybeRecheck);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', maybeRecheck);
    };
  }, [runFullCheck]);


  if (!initialCheckDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">{t('authChecking')}</p>
        </div>
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-destructive">{t('authBanned')}</h1>
          <p className="text-muted-foreground">
            {t('authBannedDescription')}
          </p>
          <a href="/" className="text-primary underline text-sm">{t('authBackHome')}</a>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
};
