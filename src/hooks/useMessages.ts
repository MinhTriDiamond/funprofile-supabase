import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useCallback } from 'react';
import { Json } from '@/integrations/supabase/types';
import type { MessageRow } from '@/types/realtimeRows';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_urls: Json | null;
  reply_to_id: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
  };
  reply_to?: Message | null;
  reactions?: MessageReaction[];
  read_by?: string[];
}

export interface MessageReaction {
  id: string;
  message_id?: string;
  user_id: string;
  emoji: string;
  created_at: string | null;
}

const PAGE_SIZE = 30;

export function useMessages(conversationId: string | null, userId: string | null) {
  const queryClient = useQueryClient();

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!conversationId) return { messages: [], nextCursor: null };

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          message_reactions (
            id,
            user_id,
            emoji,
            created_at
          )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Fetch sender profiles
      const senderIds = new Set(messages?.map(m => m.sender_id) || []);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name')
        .in('id', Array.from(senderIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch reply messages if any
      const replyIds = messages?.filter(m => m.reply_to_id).map(m => m.reply_to_id) || [];
      let replyMap = new Map();
      if (replyIds.length > 0) {
        const { data: replies } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', replyIds);

        replies?.forEach(r => {
          replyMap.set(r.id, { ...r, sender: profileMap.get(r.sender_id) });
        });
      }

      // Fetch read receipts
      const messageIds = messages?.map(m => m.id) || [];
      const { data: reads } = await supabase
        .from('message_reads')
        .select('message_id, user_id')
        .in('message_id', messageIds);

      const readMap = new Map<string, string[]>();
      reads?.forEach(r => {
        const existing = readMap.get(r.message_id) || [];
        existing.push(r.user_id);
        readMap.set(r.message_id, existing);
      });

      const enrichedMessages = messages?.map(m => ({
        ...m,
        sender: profileMap.get(m.sender_id),
        reply_to: replyMap.get(m.reply_to_id) || null,
        reactions: m.message_reactions || [],
        read_by: readMap.get(m.id) || [],
      })) || [];

      return {
        messages: enrichedMessages.reverse(), // Chronological order
        nextCursor: messages?.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as MessageRow;
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, full_name')
            .eq('id', newMsg.sender_id)
            .single();

          const enriched = {
            ...newMsg,
            sender: profile,
            reactions: [],
            read_by: [],
          };

          // Add to cache
          queryClient.setQueryData(['messages', conversationId], (old: any) => {
            if (!old?.pages?.length) return old;
            const firstPage = old.pages[0];
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  messages: [...firstPage.messages, enriched],
                },
                ...old.pages.slice(1),
              ],
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      mediaUrls,
      replyToId,
      messageType,
      metadata,
    }: {
      content?: string;
      mediaUrls?: string[];
      replyToId?: string;
      messageType?: string;
      metadata?: Record<string, any>;
    }) => {
      if (!conversationId || !userId) throw new Error('Invalid state');
      if (!content?.trim() && !mediaUrls?.length && (!messageType || messageType === 'text')) throw new Error('Message is empty');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: content?.trim() || null,
          media_urls: mediaUrls || [],
          reply_to_id: replyToId || null,
          message_type: messageType || 'text',
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation last_message_at (trigger handles this)
      return data;
    },
  });

  // Mark message as read
  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!userId) return;

      await supabase.from('message_reads').upsert(
        { message_id: messageId, user_id: userId },
        { onConflict: 'message_id,user_id' }
      );
    },
    [userId]
  );

  // Add reaction
  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase.from('message_reactions').upsert(
        { message_id: messageId, user_id: userId, emoji },
        { onConflict: 'message_id,user_id,emoji' }
      );

      if (error) throw error;
    },
  });

  // Remove reaction
  const removeReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);

      if (error) throw error;
    },
  });

  // Flatten all messages from pages
  const allMessages = messagesQuery.data?.pages.flatMap(p => p.messages) || [];

  return {
    messages: allMessages,
    isLoading: messagesQuery.isLoading,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    hasNextPage: messagesQuery.hasNextPage,
    fetchNextPage: messagesQuery.fetchNextPage,
    error: messagesQuery.error,
    sendMessage,
    markAsRead,
    addReaction,
    removeReaction,
  };
}
