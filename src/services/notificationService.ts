/**
 * SR-3: Centralized Notification Service
 *
 * Problem solved: Multiple components (NotificationDropdown, Notifications page,
 * NotificationBadge, etc.) each creating `notifications-${userId}` channel
 * independently → duplicate subscriptions + memory leaks.
 *
 * Solution: Singleton service pattern.
 * - Only ONE Supabase channel is created per user session.
 * - Components subscribe to events via callbacks, not Supabase directly.
 * - Automatic cleanup when no subscribers remain.
 *
 * Usage:
 *   const { subscribe, markRead, markAllRead, fetchNotifications } = useNotificationService();
 *   subscribe('insert', (notif) => refetch());
 *   subscribe('update', (notif) => updateLocal(notif));
 */

import { supabase } from '@/integrations/supabase/client';
import type { NotificationWithDetails } from '@/components/layout/notifications/types';
import logger from '@/lib/logger';

type NotifEvent = 'insert' | 'update';
type Listener = (notification: Partial<NotificationWithDetails>) => void;

// ─── Singleton state (module-level, not per-component) ───────────────────────
let channelInstance: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;
const listeners = new Map<NotifEvent, Set<Listener>>();
let subscriberCount = 0;

function getListeners(event: NotifEvent): Set<Listener> {
  if (!listeners.has(event)) listeners.set(event, new Set());
  return listeners.get(event)!;
}

function emit(event: NotifEvent, payload: Partial<NotificationWithDetails>) {
  getListeners(event).forEach(fn => {
    try { fn(payload); } catch (e) { console.error('[NotifService] listener error:', e); }
  });
}

async function ensureChannel(userId: string) {
  // Already running for this user
  if (channelInstance && currentUserId === userId) return;

  // Cleanup old channel if user changed
  if (channelInstance) {
    supabase.removeChannel(channelInstance);
    channelInstance = null;
  }

  currentUserId = userId;

  channelInstance = supabase
    .channel(`notif-service-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (document.visibilityState !== 'hidden') {
          emit('insert', payload.new as Partial<NotificationWithDetails>);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (document.visibilityState !== 'hidden') {
          emit('update', payload.new as Partial<NotificationWithDetails>);
        }
      }
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV === 'development') {
        logger.debug('[NotifService] channel status:', status);
      }
    });
}

function destroyChannel() {
  if (channelInstance) {
    supabase.removeChannel(channelInstance);
    channelInstance = null;
    currentUserId = null;
  }
}

// ─── Public API (hook) ────────────────────────────────────────────────────────
import { useEffect, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';

/**
 * Hook interface to the singleton notification service.
 * Call this in any component that needs to react to notification changes.
 */
export function useNotificationService(userId: string | null) {
  // Register this component as a subscriber
  useEffect(() => {
    if (!userId) return;

    subscriberCount++;
    ensureChannel(userId);

    return () => {
      subscriberCount--;
      // Destroy channel when last subscriber unmounts
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        destroyChannel();
      }
    };
  }, [userId]);

  const on = useCallback((event: NotifEvent, listener: Listener) => {
    const set = getListeners(event);
    set.add(listener);
    // Return unsubscribe fn
    return () => set.delete(listener);
  }, []);

  const markRead = useCallback(async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    // Invalidate React Query notification caches
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, []);

  const markAllRead = useCallback(async (uid: string) => {
    if (!uid) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', uid)
      .eq('read', false);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, []);

  const fetchNotifications = useCallback(async (uid: string): Promise<NotificationWithDetails[]> => {
    if (!uid) return [];
    const { data } = await supabase
      .from('notifications')
      .select(`
        id, type, read, created_at, post_id, metadata,
        actor:profiles!notifications_actor_id_fkey (
          id, username, avatar_url, full_name
        ),
        post:posts!notifications_post_id_fkey (
          id, content
        )
      `)
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    return (data || []) as unknown as NotificationWithDetails[];
  }, []);

  return { on, markRead, markAllRead, fetchNotifications };
}
