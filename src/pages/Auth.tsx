import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UnifiedAuthForm } from '@/components/auth/UnifiedAuthForm';
import { useLanguage } from '@/i18n/LanguageContext';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkSupabaseAuthHealth, isTransientAuthError } from '@/lib/authHealth';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const ECOSYSTEM_PLATFORMS = [
  { name: 'FUN Profile', logo: '/fun-profile-logo-40.webp' },
  { name: 'Angel AI', logo: '/angel-ai-logo-36.png' },
  { name: 'FUN Play', logo: '/fun-play-logo-36.webp' },
  { name: 'FUN Academy', logo: '/fun-academy-logo-36.webp' },
  { name: 'Green Earth', logo: '/green-earth-logo-36.webp' },
  { name: 'FUN Planet', logo: '/fun-planet-logo-36.webp' },
  { name: 'FUN Farm', logo: '/fun-farm-logo-36.webp' },
  { name: 'FUN Charity', logo: '/fun-charity-logo-36.webp' },
  { name: 'FUN Life', logo: '/fun-life-logo-36.webp' },
];

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [ssoRedirecting, setSsoRedirecting] = useState(false);
  const [authHealth, setAuthHealth] = useState<'checking' | 'healthy' | 'degraded'>('checking');
  const [authHealthChecking, setAuthHealthChecking] = useState(false);
  
  const returnTo = searchParams.get('return_to');
  const ssoFlow = searchParams.get('sso_flow') === 'true';
  const isSsoMode = ssoFlow && !!returnTo;

  const refreshAuthHealth = async () => {
    setAuthHealthChecking(true);
    try {
      const health = await checkSupabaseAuthHealth(8000);
      // Chỉ bỏ qua 401/403 kiểu health endpoint; còn timeout/522/network thật phải báo degraded
      // vì Auth/DB đang không cấp được kết nối và login chắc chắn sẽ fail.
      const isServerDown = !!health.status && health.status >= 500;
      const isNetworkDown = !health.status && isTransientAuthError({ message: health.error });
      setAuthHealth(isServerDown || isNetworkDown ? 'degraded' : 'healthy');
      if (import.meta.env.DEV || localStorage.getItem('fun:debug:auth') === '1') {
        console.debug('[Auth] Supabase Auth health', health);
      }
    } finally {
      setAuthHealthChecking(false);
    }
  };

  useEffect(() => {
    refreshAuthHealth();
  }, []);

  // Dùng singleton useCurrentUser thay vì tự gọi getSession + onAuthStateChange.
  // Giảm tranh chấp lock "lock:sb-…-auth-token" với signInWithPassword.
  const { user, userId } = useCurrentUser();

  useEffect(() => {
    // PASSWORD_RECOVERY: dò bằng URL hash, không cần listener riêng.
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      navigate('/reset-password', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!user || !userId) return;
    let cancelled = false;

    // Fire-and-forget ban check — KHÔNG await trong listener để tránh khoá auth lock.
    (async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_banned')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.is_banned === true) {
          await supabase.auth.signOut();
          return;
        }
        if (ssoFlow && returnTo) {
          // Lấy session 1 lần để có access_token cho SSO redirect.
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) handleSSORedirect(session.access_token);
        } else {
          navigate('/');
        }
      } catch (e) {
        console.error('[Auth] Post-login check error:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userId, navigate, ssoFlow, returnTo]);

  const handleSSORedirect = (accessToken: string) => {
    if (!returnTo) return;
    setSsoRedirecting(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      fetch(returnTo, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        signal: controller.signal
      })
        .then(res => res.json())
        .then(data => {
          clearTimeout(timeoutId);
          if (data.redirect_uri) {
            window.location.href = data.redirect_uri;
          } else if (data.error) {
            console.error('SSO authorize error:', data);
            setSsoRedirecting(false);
            navigate('/');
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          console.error('SSO redirect error:', err);
          setSsoRedirecting(false);
          navigate('/');
        });
    } catch (err) {
      console.error('Invalid return_to URL:', err);
      setSsoRedirecting(false);
      navigate('/');
    }
  };

  if (ssoRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="text-center space-y-4 z-10">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <Eye size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t('authRedirecting')}</h2>
          <p className="text-muted-foreground">{t('authRedirectingHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <LanguageSwitcher variant="dropdown" />
      </div>

      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center relative z-10">
        {/* Left Side - FUN Ecosystem Branding */}
        <div className="text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
            {/* Logo with hologram border */}
            <div 
              className="hologram-border p-[5px] rounded-full"
              style={{
                boxShadow: '0 0 30px rgba(147, 51, 234, 0.3), 0 0 60px rgba(59, 130, 246, 0.2), 0 10px 40px rgba(0,0,0,0.15)'
              }}
            >
              <img 
                src="/fun-ecosystem-logo.png" 
                alt="FUN Ecosystem" 
                width={256} 
                height={256}
                loading="eager"
                {...({ fetchpriority: 'high' } as any)}
                decoding="sync"
                className="w-64 h-64 rounded-full bg-white object-cover"
              />
            </div>
          </div>

          {/* Title - Hologram gradient */}
          <h1 className="hologram-text text-4xl md:text-5xl font-bold mb-4">
            {t('authBrandTitle')}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            {t('authBrandDescription')}
          </p>
          
          {/* Ecosystem tagline */}
          <p className="text-lg font-semibold mt-2 hologram-text">
            {t('authEcosystemTagline')}
          </p>
          
          {/* Platform Grid */}
          <div className="mt-8 hidden md:block">
            <div className="grid grid-cols-3 gap-3">
              {ECOSYSTEM_PLATFORMS.map((platform) => (
                <div 
                  key={platform.name}
                  className="flex items-center gap-2 p-2 rounded-xl bg-card/60 border border-border/50 hover:border-primary/30 transition-colors"
                >
                  <img src={platform.logo} alt={platform.name} className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm font-medium text-muted-foreground">{platform.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="w-full max-w-lg mx-auto min-h-[560px]">
          {authHealth === 'degraded' && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-amber-950 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Đăng nhập đang tạm gián đoạn</p>
                  <p className="mt-1 text-sm text-amber-800">
                    Lovable Cloud đang phản hồi chậm hoặc mất kết nối tạm thời. Vui lòng đợi 1–2 phút rồi bấm Thử lại trước khi đăng nhập.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={refreshAuthHealth}
                  disabled={authHealthChecking}
                  className="shrink-0 border-amber-300 bg-white/70 text-amber-900 hover:bg-white"
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${authHealthChecking ? 'animate-spin' : ''}`} />
                  Thử lại
                </Button>
              </div>
            </div>
          )}
          <UnifiedAuthForm ssoFlow={isSsoMode} />
          
          {/* Guest Mode */}
          <div className="mt-6 text-center">
            <div className="relative flex items-center gap-4 py-2">
              <div className="flex-1 border-t border-muted" />
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                {t('orContinueAs')}
              </span>
              <div className="flex-1 border-t border-muted" />
            </div>
            
            {/* View as Guest - hologram border */}
            <div 
              className="relative hologram-border p-[3px] rounded-full mt-3"
              style={{
                boxShadow: '0 0 15px rgba(147, 51, 234, 0.15), 0 0 15px rgba(59, 130, 246, 0.15), 0 0 15px rgba(34, 197, 94, 0.15)'
              }}
            >
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center gap-3 font-bold text-xl h-14 bg-white hover:bg-slate-50 border-0 rounded-full transition-colors"
              >
                <Eye size={24} className="text-purple-600" />
                <span className="hologram-text">
                  {t('viewAsGuest')}
                </span>
              </button>
            </div>
          </div>
          
          <p className="text-center mt-4 text-base text-muted-foreground font-medium">
            {t('authCreatePage')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
