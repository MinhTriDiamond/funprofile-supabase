/**
 * NotificationDropdown — Desktop: Facebook-style popover preview. Mobile: navigate to /notifications.
 */

import { Bell, CheckCheck, Shield } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNotificationIcon, getNotificationText } from '@/components/layout/notifications/utils';
import type { NotificationWithDetails } from '@/components/layout/notifications/types';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/i18n/LanguageContext';
import funLogo from '@/assets/fun-profile-logo.png';

import {
  SYSTEM_TYPES as SYSTEM_NOTIF_TYPES,
  FRAUD_TYPES as FRAUD_NOTIF_TYPES,
  notificationRoute,
} from '@/components/layout/notifications/systemNotifications';

const SYSTEM_TYPES: readonly string[] = SYSTEM_NOTIF_TYPES;

interface NotificationDropdownProps {
  centerNavStyle?: boolean;
  isActiveRoute?: boolean;
}

const FRAUD_TYPES: readonly string[] = FRAUD_NOTIF_TYPES;

export const NotificationDropdown = ({ centerNavStyle = false, isActiveRoute = false }: NotificationDropdownProps) => {
  const navigate = useNavigate();
  const { userId } = useCurrentUser();
  const { t, language } = useLanguage();
  const dateLocale = useDateLocale();
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [open, setOpen] = useState(false);
  const prevCountRef = useRef(0);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select(`
        id, type, read, created_at, post_id, metadata,
        actor:profiles!notifications_actor_id_fkey (id, username, avatar_url, full_name),
        post:posts!notifications_post_id_fkey (id, content)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data as unknown as NotificationWithDetails[]);
      const count = data.filter(n => !n.read).length;
      if (count > prevCountRef.current) {
        setHasNewNotification(true);
        setTimeout(() => setHasNewNotification(false), 3000);
      }
      prevCountRef.current = count;
      setUnreadCount(count);
    }
  }, [userId]);

  // Fetch unread count always; fetch full list when popover opens
  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (isMounted && count !== null) {
        if (count > prevCountRef.current) {
          setHasNewNotification(true);
          setTimeout(() => setHasNewNotification(false), 3000);
        }
        prevCountRef.current = count;
        setUnreadCount(count);
      }
    };

    fetchCount();

    const channel = supabase
      .channel(`notif-count-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (isMounted) { fetchCount(); if (open) fetchNotifications(); } })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId, open, fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const markAllAsRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    fetchNotifications();
  };

  const handleNotificationClick = async (notification: NotificationWithDetails) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
    setOpen(false);

    // Live đang phát → vào phòng live, đã kết thúc → vào bài đăng
    if (notification.type === 'live_started' && notification.post_id) {
      const { data: session } = await supabase
        .from('live_sessions').select('id, status').eq('post_id', notification.post_id).maybeSingle();
      navigate(session?.status === 'live' ? `/live/${session.id}` : `/post/${notification.post_id}`);
      return;
    }

    const route = notificationRoute(notification);
    if (route) navigate(route);
  };


  const handleBellClick = () => {
    if (isMobileRef.current) {
      navigate('/notifications');
    }
    // Desktop: popover handles open/close automatically
  };

  const displayedNotifications = activeTab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const badge = unreadCount > 0 ? (
    <span className={cn(
      "absolute -top-0.5 -right-0.5 text-xs rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold transition-all duration-300",
      hasNewNotification ? "bg-gold text-black shadow-[0_0_15px_hsl(var(--gold-glow))]" : "bg-destructive text-destructive-foreground"
    )}>
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  ) : null;

  const bellIcon = (isCenter: boolean) => (
    <Bell className={cn(
      "w-6 h-6 transition-all duration-300",
      isCenter
        ? (isActiveRoute ? "text-primary-foreground" : "group-hover:text-primary group-hover:drop-shadow-[0_0_6px_hsl(142_76%_36%/0.5)]")
        : "text-primary group-hover:drop-shadow-[0_0_6px_hsl(142_76%_36%/0.5)]",
      hasNewNotification && "drop-shadow-[0_0_8px_hsl(48_96%_53%/0.6)]"
    )} />
  );

  const popoverContent = (
    <div className="w-[380px] max-h-[480px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-lg font-bold text-foreground">{t('notifTitle')}</h3>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead} className="text-xs text-primary hover:underline flex items-center gap-1">
            <CheckCheck className="w-3.5 h-3.5" />
            {t('notifMarkAllRead')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "px-3 py-1 rounded-full text-sm font-medium transition-colors",
            activeTab === 'all' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {t('notifTabAll')}
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={cn(
            "px-3 py-1 rounded-full text-sm font-medium transition-colors",
            activeTab === 'unread' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {t('notifTabUnread')}
        </button>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {displayedNotifications.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {t('notifEmpty')}
          </div>
        ) : (
          displayedNotifications.slice(0, 5).map(notification => {
            const { main, snippet } = getNotificationText(
              notification.type,
              notification.actor?.username || notification.actor?.full_name || t('notifGenericUser'),
              notification.post?.content,
              notification.metadata,
              t,
              language
            );
            const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateLocale });

            return (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50",
                  !notification.read && "bg-primary/5"
                )}
              >
                {/* Avatar with icon overlay */}
                <div className="relative flex-shrink-0">
                  {(() => {
                    const isFraud = FRAUD_TYPES.includes(notification.type);
                    if (isFraud) {
                      return (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-destructive to-destructive/80 border-2 border-destructive/60">
                          <Shield className="w-5 h-5 text-white" />
                        </div>
                      );
                    }
                    const isSystem = SYSTEM_TYPES.includes(notification.type);
                    return (
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={isSystem ? funLogo : notification.actor?.avatar_url || ''} skipTransform={isSystem} />
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                          {isSystem ? 'FR' : (notification.actor?.username || '?')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })()}
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-background flex items-center justify-center border border-border">
                    {getNotificationIcon(notification.type)}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug line-clamp-2">
                    {main}
                  </p>
                  {snippet && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 italic">"{snippet}"</p>
                  )}
                  <p className={cn("text-xs mt-0.5", !notification.read ? "text-primary font-medium" : "text-muted-foreground")}>
                    {timeAgo}
                  </p>
                </div>

                {/* Unread dot */}
                {!notification.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 mt-2" />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <button
        onClick={() => { setOpen(false); navigate('/notifications'); }}
        className="w-full py-2.5 text-center text-sm font-medium text-primary hover:bg-accent/50 border-t border-border transition-colors"
      >
        {t('notifViewAll')}
      </button>
    </div>
  );

  // Center nav style (used in bottom nav / center nav bar)
  if (centerNavStyle) {
    return (
      <Popover open={open} onOpenChange={(v) => { if (isMobileRef.current) return; setOpen(v); }}>
        <PopoverTrigger asChild>
          <button
            onClick={handleBellClick}
            className={cn(
              "flex-1 h-full max-w-[100px] flex items-center justify-center relative transition-all duration-300 rounded-full border-[0.5px] group",
              isActiveRoute ? 'text-primary-foreground bg-primary border-gold'
                : 'text-foreground hover:text-primary hover:bg-primary/10 border-transparent hover:border-gold/50'
            )}
            aria-label={t('notifAriaBell')}
          >
            {bellIcon(true)}
            {badge}
            {isActiveRoute && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-gold to-primary rounded-t-full" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 border-border w-auto" align="end" sideOffset={8}>
          {popoverContent}
        </PopoverContent>
      </Popover>
    );
  }

  // Default style (header icon)
  return (
    <Popover open={open} onOpenChange={(v) => { if (isMobileRef.current) return; setOpen(v); }}>
      <PopoverTrigger asChild>
        <button
          onClick={handleBellClick}
          className={cn(
            "h-11 w-11 relative transition-all duration-300 group flex items-center justify-center rounded-full",
            "text-foreground hover:text-primary hover:bg-primary/10"
          )}
          aria-label={t('notifAriaBell')}
        >
          {bellIcon(false)}
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 border-border w-auto" align="end" sideOffset={8}>
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
};
