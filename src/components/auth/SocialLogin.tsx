import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import logger from '@/lib/logger';
import {
  SUPABASE_AUTH_TRANSIENT_MESSAGE,
  assertSupabaseAuthHealthy,
  getSupabaseAuthHost,
  isTransientAuthError,
} from '@/lib/authHealth';
interface SocialLoginProps {
  onSuccess?: (userId: string, isNewUser: boolean) => void;
}
export const SocialLogin = ({
  onSuccess
}: SocialLoginProps) => {
  const {
    t
  } = useLanguage();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Listen for OAuth sign-in and handle success callback
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const provider = session.user.app_metadata?.provider;
        if (provider && provider !== 'email') {
          // Defer the database update and callback to avoid auth deadlock
          setTimeout(async () => {
            try {
              // Update last_login_platform to 'FUN Profile'
              await supabase.from('profiles').update({
                last_login_platform: 'FUN Profile'
              }).eq('id', session.user.id);
              logger.debug('[SocialLogin] Updated last_login_platform to: FUN Profile');

              // Check if user is new (created within last minute)
              const {
                data: profile
              } = await supabase.from('profiles').select('created_at').eq('id', session.user.id).single();
              const isNewUser = profile && new Date().getTime() - new Date(profile.created_at).getTime() < 60000;
              logger.debug('[SocialLogin] User isNew:', isNewUser);

              // Call success callback if provided
              if (onSuccess) {
                onSuccess(session.user.id, isNewUser || false);
              }
            } catch (error) {
              console.error('[SocialLogin] Error:', error);
            }
          }, 0);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [onSuccess]);
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const startedAt = performance.now();
      await assertSupabaseAuthHealthy(10_000);
      logger.debug('[SocialLogin] Supabase Auth preflight OK', {
        provider: 'google',
        host: getSupabaseAuthHost(),
        durationMs: Math.round(performance.now() - startedAt),
      });

      const isCustomDomain =
        !window.location.hostname.includes('lovable.app') &&
        !window.location.hostname.includes('lovableproject.com');

      if (isCustomDomain) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/`,
            skipBrowserRedirect: true,
            queryParams: { access_type: 'offline', prompt: 'consent select_account' },
          },
        });
        if (error) throw error;
        if (data?.url) window.location.href = data.url;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/`,
            queryParams: { access_type: 'offline', prompt: 'consent select_account' },
          },
        });
        if (error) throw error;
      }
    } catch (error: any) {
      logger.error('[SocialLogin] Google sign-in failed', {
        provider: 'google',
        host: getSupabaseAuthHost(),
        message: error?.message,
        status: error?.status || error?.statusCode,
        health: error?.authHealth,
      });
      toast.error(isTransientAuthError(error) ? SUPABASE_AUTH_TRANSIENT_MESSAGE : (error.message || t('authErrorGeneric')), {
        duration: 9000,
      });
      setGoogleLoading(false);
    }
  };
  return <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-slate-800">{t('authMethodSocial')}</h3>
        <p className="text-base text-slate-500">
          {t('lightCloakDescription')}
        </p>
      </div>

      {/* Google Sign In Button - Thinner rainbow border (1.5px), green background, larger G icon */}
      <div 
        className="relative p-[1.5px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, #FF0000 0%, #FF7F00 14%, #FFFF00 28%, #00FF00 42%, #0000FF 57%, #4B0082 71%, #9400D3 85%, #FF0000 100%)',
          boxShadow: '0 0 10px rgba(255, 0, 0, 0.15), 0 0 10px rgba(0, 255, 0, 0.15), 0 0 10px rgba(0, 0, 255, 0.15)'
        }}
      >
        <Button 
          type="button" 
          className="w-full h-14 text-white font-bold transition-all flex items-center justify-center gap-3 rounded-full text-lg" 
          onClick={handleGoogleSignIn} 
          disabled={googleLoading} 
          style={{
            background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)',
          }}
        >
          {googleLoading ? (
            <Loader2 className="animate-spin text-white" size={20} />
          ) : (
            /* Official Google G logo with 4 colors - DOUBLED SIZE */
            <svg className="w-10 h-10" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          <span className="text-white">
            {googleLoading ? t('authInitializing') : t('authSignInWithGoogle')}
          </span>
        </Button>
      </div>

      {/* Divider */}
      

      {/* Future Social Providers (Disabled) */}
      
    </div>;
};
