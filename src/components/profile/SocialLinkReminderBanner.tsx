import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Sparkles } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/i18n/LanguageContext';

const COOLDOWN_DAYS = 3;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'dismiss_social_link_reminder';

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function hasSocialLinks(links: unknown): boolean {
  if (!links) return false;
  if (Array.isArray(links)) return links.length > 0;
  if (typeof links === 'object') return Object.keys(links as Record<string, unknown>).length > 0;
  return false;
}

export function SocialLinkReminderBanner({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { userId, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const [dismissed, setDismissed] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile-social-links', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('social_links')
        .eq('id', userId!)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const shouldShow = useMemo(() => {
    if (!isAuthenticated || authLoading || profileLoading) return false;
    if (dismissed || isDismissed()) return false;
    if (!profile) return false;
    return !hasSocialLinks(profile.social_links);
  }, [isAuthenticated, authLoading, profileLoading, dismissed, profile]);

  if (!shouldShow) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch {}
    setDismissed(true);
  };

  return (
    <div className={`fb-card p-3 mb-3 border-l-4 border-l-purple-400 bg-purple-50/50 dark:bg-purple-950/10 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium">
            {t('socialReminderText')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate('/profile')}
              className="text-xs h-7"
            >
              {t('socialReminderCta')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-xs h-7 text-muted-foreground"
            >
              {t('socialReminderLater')}
            </Button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
