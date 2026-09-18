import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser {
  userId: string;
  username: string;
  avatar_url?: string;
}

export function useTypingIndicator(conversationId: string | null, userId: string | null, username: string | null) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Cleanup typing users after timeout
  const cleanupTypingUser = useCallback((userIdToRemove: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userIdToRemove));
  }, []);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        presence: { key: userId },
      },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId: typingUserId, username: typingUsername, avatar_url, isTyping } = payload.payload;

        if (typingUserId === userId) return; // Ignore own typing

        if (isTyping) {
          setTypingUsers((prev) => {
            const exists = prev.find((u) => u.userId === typingUserId);
            if (exists) return prev;
            return [...prev, { userId: typingUserId, username: typingUsername, avatar_url }];
          });

          // Auto-remove after 3 seconds
          setTimeout(() => cleanupTypingUser(typingUserId), 3000);
        } else {
          cleanupTypingUser(typingUserId);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, userId, cleanupTypingUser]);

  // Send typing indicator (debounced)
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !userId || !username) return;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, username, isTyping },
      });

      // Auto-stop typing after 2 seconds of no input
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, username, isTyping: false },
          });
        }, 2000);
      }
    },
    [userId, username]
  );

  return {
    typingUsers: typingUsers.filter((u) => u.userId !== userId),
    sendTyping,
  };
}
