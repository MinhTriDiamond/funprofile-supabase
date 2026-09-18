
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MessageRow } from '@/types/realtimeRows';

interface NotificationOptions {
  enabled?: boolean;
  showToast?: boolean;
  playSound?: boolean;
}

export function useChatNotifications(
  userId: string | null,
  currentConversationId: string | null,
  options: NotificationOptions = {}
) {
  const { enabled = true, showToast = true, playSound = true } = options;

  const playNotificationSound = useCallback(() => {
    if (!playSound) return;

    try {
      /* Safari WebKit compat — webkitAudioContext is not in standard typings */
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      // Silently fail if audio context is not available
      console.debug('Audio notification not available');
    }
  }, [playSound]);

  useEffect(() => {
    if (!userId || !enabled) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Scope notifications to conversations the user is currently in.
      // This avoids subscribing to all messages globally.
      const { data: rows, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (cancelled) return;
      if (error) {
        console.error('[chat-notifications] Failed to load conversation ids:', error);
        return;
      }

      const conversationIds = (rows || []).map((r) => r.conversation_id).filter(Boolean);
      if (!conversationIds.length) return;

      const inFilter = `conversation_id=in.(${conversationIds.join(',')})`;

      channel = supabase
        .channel(`chat-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: inFilter,
          },
          async (payload) => {
            const message = payload.new as MessageRow;

            if (message.sender_id === userId) return;
            if (message.conversation_id === currentConversationId) return;

            const { data: sender } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', message.sender_id)
              .maybeSingle();

            playNotificationSound();

            const senderName = sender?.full_name || sender?.username || 'Ai đó';
            const content = (message.content || '').toString();
            const description = content ? content.substring(0, 50) : 'Đã gửi một tệp đính kèm';

            if (showToast) {
              toast.info(`${senderName} đã gửi tin nhắn`, {
                description,
                duration: 4000,
              });
            }

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Tin nhắn từ ${senderName}`, {
                body: content ? content.substring(0, 100) : 'Bạn nhận được một tệp đính kèm',
                icon: sender?.avatar_url || '/fun-profile-logo-128.webp',
                tag: message.conversation_id,
              });
            }
          }
        )
        .subscribe();
    })();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, currentConversationId, enabled, showToast, playNotificationSound]);

  return null;
}
