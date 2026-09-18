import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from 'sonner';
import type { NotificationWithDetails, FilterTab, NotificationGroups } from '@/components/layout/notifications/types';
import { groupNotificationsByTime } from '@/components/layout/notifications/utils';

const FRAUD_TYPES = ['admin_shared_device', 'admin_email_farm', 'admin_blacklisted_ip', 'admin_fraud_daily'];

export function useNotifications() {
  const { userId } = useCurrentUser();
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const unreadCountRef = useRef(0);
  const navigate = useNavigate();

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
      .limit(50);

    if (data) {
      setNotifications(data as unknown as NotificationWithDetails[]);
      const newUnread = data.filter(n => !n.read).length;
      if (newUnread > unreadCountRef.current) {
        setHasNewNotification(true);
        setTimeout(() => setHasNewNotification(false), 3000);
      }
      unreadCountRef.current = newUnread;
      setUnreadCount(newUnread);
    }
  }, [userId]);

  // Setup realtime
  useEffect(() => {
    if (!userId) return;
    let isMounted = true;

    fetchNotifications();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (isMounted) fetchNotifications(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { if (isMounted) fetchNotifications(); })
      .subscribe();

    channelRef.current = channel;

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    fetchNotifications();
  }, [userId, fetchNotifications]);

  const handleNotificationClick = useCallback(async (notification: NotificationWithDetails, closePopover: () => void) => {
    await markAsRead(notification.id);
    closePopover();

    if (notification.type === 'live_started' && notification.post_id) {
      const { data: session } = await supabase
        .from('live_sessions').select('id, status').eq('post_id', notification.post_id).single();
      navigate(session?.status === 'live' ? `/live/${session.id}` : `/post/${notification.post_id}`);
    } else if (notification.post_id) {
      navigate(`/post/${notification.post_id}`);
    } else if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
      navigate(`/profile/${notification.actor?.id}`);
    } else if (['reward_approved', 'reward_rejected', 'claim_reward', 'reward_adjustment', 'epoch_claim_ready', 'mint_request_rejected', 'link_wallet_reminder', 'fun_mint_signed'].includes(notification.type)) {
      navigate('/wallet');
    } else if (notification.type === 'fun_mint_confirmed') {
      const txHash = notification.metadata?.tx_hash;
      if (txHash) {
        window.open(`https://bscscan.com/tx/${txHash}`, '_blank', 'noopener,noreferrer');
      } else {
        navigate('/wallet');
      }
    } else if (['impersonation_alert', 'impersonation_confirmed', 'impersonation_dismissed'].includes(notification.type)) {
      navigate('/identity?tab=alerts');
    } else if (notification.type === 'donation') {
      navigate(`/profile/${notification.actor?.id}`);
    } else if (FRAUD_TYPES.includes(notification.type)) {
      navigate('/admin?tab=fraud');
    }
  }, [markAsRead, navigate]);

  const handleAcceptFriendRequest = useCallback(async (notification: NotificationWithDetails) => {
    if (!userId) return;
    try {
      const { data: friendship } = await supabase
        .from('friendships').select('id')
        .eq('user_id', notification.actor.id).eq('friend_id', userId).eq('status', 'pending').maybeSingle();
      if (friendship) {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendship.id);
        await markAsRead(notification.id);
        toast.success('Đã chấp nhận lời mời kết bạn!');
        fetchNotifications();
      } else {
        toast.error('Không tìm thấy lời mời kết bạn');
      }
    } catch { toast.error('Có lỗi xảy ra'); }
  }, [userId, markAsRead, fetchNotifications]);

  const handleRejectFriendRequest = useCallback(async (notification: NotificationWithDetails) => {
    if (!userId) return;
    try {
      const { data: friendship } = await supabase
        .from('friendships').select('id')
        .eq('user_id', notification.actor.id).eq('friend_id', userId).eq('status', 'pending').maybeSingle();
      if (friendship) {
        await supabase.from('friendships').delete().eq('id', friendship.id);
        await markAsRead(notification.id);
        toast.success('Đã xóa lời mời kết bạn');
        fetchNotifications();
      }
    } catch { toast.error('Có lỗi xảy ra'); }
  }, [userId, markAsRead, fetchNotifications]);

  const { friendRequests, fraudAlerts, otherNotifications } = useMemo(() => {
    const filtered = activeTab === 'unread' ? notifications.filter(n => !n.read) : notifications;
    return {
      friendRequests: filtered.filter(n => n.type === 'friend_request' && !n.read),
      fraudAlerts: filtered.filter(n => FRAUD_TYPES.includes(n.type)),
      otherNotifications: filtered.filter(n => (n.type !== 'friend_request' || n.read) && !FRAUD_TYPES.includes(n.type)),
    };
  }, [notifications, activeTab]);

  const groupedNotifications = useMemo(() => groupNotificationsByTime(otherNotifications), [otherNotifications]);

  return {
    notifications, unreadCount, hasNewNotification,
    activeTab, setActiveTab,
    isExpanded, setIsExpanded,
    friendRequests, fraudAlerts, groupedNotifications,
    markAllAsRead, handleNotificationClick,
    handleAcceptFriendRequest, handleRejectFriendRequest,
  };
}
