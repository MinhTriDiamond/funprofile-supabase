import { useState, memo, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Film, Home, Award, MessageCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { FacebookLeftSidebar } from '@/components/feed/FacebookLeftSidebar';
import { FacebookRightSidebar } from '@/components/feed/FacebookRightSidebar';
import { MobileStats } from '@/components/profile/CoverHonorBoard';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AngelChatWidget } from '@/components/angel-ai';
import honorBoardIcon from '@/assets/honor-board-icon.png';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export const MobileBottomNav = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams<{ userId: string }>();
  const { t } = useLanguage();
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [honorBoardOpen, setHonorBoardOpen] = useState(false);
  const [isAngelChatOpen, setIsAngelChatOpen] = useState(false);

  // Detect if we're on a profile page
  const isProfilePage = location.pathname.startsWith('/profile');
  const isAdminPage = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  // Use centralized auth hook
  const { user: currentUser } = useCurrentUser();

  // Get the profile user ID (from URL params or current user)
  const profileUserId = userId || currentUser?.id;

  // Fetch profile data for honor board
  const { data: profileData } = useQuery({
    queryKey: ['profile-nav', profileUserId],
    queryFn: async () => {
      if (!profileUserId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', profileUserId)
        .single();
      return data;
    },
    enabled: !!profileUserId && isProfilePage,
    staleTime: 5 * 60 * 1000,
  });


  const isActive = useCallback((path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }, [location.pathname]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const navItems = [
    { icon: Home, label: 'Home', path: '/', action: () => handleNavigate('/') },
    { icon: Film, label: t('reels'), path: '/reels', action: () => handleNavigate('/reels') },
    { icon: Award, label: t('navHonorBoard'), isCenter: true, action: () => setHonorBoardOpen(true) },
    { icon: MessageCircle, label: t('chat'), path: '/chat', action: () => handleNavigate('/chat') },
    { label: t('navAngelAi'), isAngelAi: true, action: () => setIsAngelChatOpen(true) },
  ];

  if (isAdminPage) return null;

  return (
    <>
      {/* Bottom Navigation Bar - Fixed with larger touch targets - Semi-transparent for Tet theme */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/85 dark:bg-gray-900/85 border-t border-border/30 safe-area-bottom backdrop-blur-sm">
        <div className="flex items-center justify-around h-[72px] px-1 max-w-lg mx-auto">
          {navItems.map((item, index) => {
            // Angel AI button - opens the in-app chat widget
            if ('isAngelAi' in item && item.isAngelAi) {
              return (
                <button
                  key={index}
                  onClick={item.action}
                  aria-label={item.label}
                  className="flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all duration-300 touch-manipulation group border-[0.5px] text-gold hover:text-gold hover:bg-gold/10 border-transparent hover:border-gold/40 active:bg-gold/20"
                >
                  <img
                    src="/angel-ai-logo-36.png"
                    alt={item.label}
                    className="w-7 h-7 rounded-full border border-amber-400/70 object-cover shadow-[0_0_8px_hsl(45_93%_47%/0.45)] transition-all duration-300 group-hover:shadow-[0_0_12px_hsl(45_93%_47%/0.7)]"
                  />
                  <span className="text-[10px] mt-1 font-medium truncate max-w-[56px]">{item.label}</span>
                </button>
              );
            }
            
            return (
              <button
                key={index}
                onClick={item.action}
                aria-label={item.label}
                className={`flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all duration-300 touch-manipulation group border-[0.5px] ${
                  item.isCenter
                    ? 'relative border-transparent'
                    : item.path && isActive(item.path)
                    ? 'text-primary-foreground bg-primary border-gold'
                    : 'text-foreground hover:text-primary hover:bg-primary/10 border-transparent hover:border-gold/40 active:text-primary-foreground active:bg-primary'
                }`}
              >
                {item.isCenter ? (
                  /* Honor Board Center Button - Special Design */
                  <div className="relative -mt-1">
                    <div className="relative w-14 h-14 flex items-center justify-center active:scale-95 transition-transform">
                      <img 
                        src={honorBoardIcon} 
                        alt="Honor Board" 
                        className="w-14 h-14 object-contain drop-shadow-lg"
                      />
                    </div>
                  </div>
                ) : (
                <>
                    <item.icon className={`w-6 h-6 transition-all duration-300 ${
                      item.path && isActive(item.path) 
                        ? 'drop-shadow-[0_0_8px_hsl(var(--gold)/0.6)]' 
                        : 'group-hover:drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]'
                    }`} strokeWidth={1.8} />
                    <span className="text-[10px] mt-1 font-medium truncate max-w-[52px]">{item.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Left Sidebar Sheet (Menu) */}
      <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 bg-background overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('navMenu')}</SheetTitle>
          </SheetHeader>
          <div className="p-4 pt-8">
            <FacebookLeftSidebar onItemClick={() => setLeftSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Honor Board Bottom Drawer - Shows Profile Honor Board on Profile page, Top Ranking on Feed */}
      <Drawer open={honorBoardOpen} onOpenChange={setHonorBoardOpen}>
        <DrawerContent className="max-h-[85vh] bg-background/80 backdrop-blur-xl border-t-2 border-amber-500/30">
          <DrawerHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mt-2">
              <Award className="w-6 h-6 text-amber-500" />
              <DrawerTitle className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                ✨ HONOR BOARD ✨
              </DrawerTitle>
              <Award className="w-6 h-6 text-amber-500" />
            </div>
          </DrawerHeader>
          <div className="px-4 pb-8 overflow-y-auto max-h-[70vh]">
            {isProfilePage && profileUserId ? (
              // Profile Page: Show individual user's honor board stats
              <MobileStats 
                userId={profileUserId} 
                username={profileData?.username || ''} 
                avatarUrl={profileData?.avatar_url || undefined}
              />
            ) : (
              // Feed/Other Pages: Show top ranking leaderboard
              <FacebookRightSidebar />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AngelChatWidget isOpen={isAngelChatOpen} onClose={() => setIsAngelChatOpen(false)} />
    </>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';
