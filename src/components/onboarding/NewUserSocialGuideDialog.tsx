import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const SHOWN_KEY = 'new_user_social_guide_shown';

function hasSocialLinks(links: unknown): boolean {
  if (!links) return false;
  if (Array.isArray(links)) return links.length > 0;
  if (typeof links === 'object') return Object.keys(links as Record<string, unknown>).length > 0;
  return false;
}

export function NewUserSocialGuideDialog() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { userId, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const [open, setOpen] = useState(true);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile-social-links-onboarding', userId],
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
    if (!profile) return false;
    if (hasSocialLinks(profile.social_links)) return false;
    try {
      return !localStorage.getItem(SHOWN_KEY);
    } catch {
      return false;
    }
  }, [isAuthenticated, authLoading, profileLoading, profile]);

  if (!shouldShow || !open) return null;

  const markShown = () => {
    try { localStorage.setItem(SHOWN_KEY, '1'); } catch {}
    setOpen(false);
  };

  const handleGoToProfile = () => {
    markShown();
    navigate('/profile');
  };

  return (
    <Dialog open onOpenChange={() => markShown()}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>

          <h2 className="text-xl font-bold text-foreground">
            {t('newUserWelcomeTitle' as any)}
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            {t('newUserSocialGuideMessage' as any)}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 w-full mt-2">
            <Button onClick={handleGoToProfile} className="flex-1 gap-2">
              {t('goToProfile' as any)}
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={markShown} className="flex-1 text-muted-foreground">
              {t('maybeLater' as any)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
