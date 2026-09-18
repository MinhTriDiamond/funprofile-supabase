import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useCallback } from 'react';
import type { Message, MessageReaction } from '../types';

export type { Message, MessageReaction };

const PAGE_SIZE = 30;

export function useMessages(conversationId: string | null, userId: string | null) {
  const queryClient = useQueryClient();
  const messagesQueryKey = ['messages', conversationId] as const;

  const patchMessageInCache = useCallback(
    (messageId: string, updater: (message: any) => any) => {
      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.map((m: any) => (m.id === messageId ? updater(m) : m)),
          })),
        };
      });
    },
    [queryClient, conversationId]
  );

  const removeMessageFromCache = useCallback(
    (messageId: string) => {
      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.filter((m: any) => m.id !== messageId),
          })),
        };
      });
    },
    [queryClient, conversationId]
  );

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
        // Keep page in DESC order; we'll reverse after flattening all pages.
        messages: enrichedMessages,
        nextCursor: messages?.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // Realtime subscription for message INSERT/UPDATE/DELETE in current conversation.
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
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, full_name')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage: any = {
            ...payload.new,
            sender: profile,
            reactions: [],
            read_by: [],
          };

          // Add to cache with dedupe (can happen around optimistic updates + refetch).
          queryClient.setQueryData(messagesQueryKey, (old: any) => {
            if (!old?.pages?.length) return old;
            const firstPage = old.pages[0];
            const alreadyExists = old.pages.some((page: any) =>
              (page.messages || []).some((m: any) => m.id === newMessage.id)
            );
            if (alreadyExists) return old;
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  // Pages are stored in DESC order, so newest goes first.
                  messages: [newMessage, ...firstPage.messages],
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
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          patchMessageInCache(updated.id, (m) => ({ ...m, ...updated }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deleted = payload.old as any;
          if (!deleted?.id) return;
          removeMessageFromCache(deleted.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, patchMessageInCache, queryClient, removeMessageFromCache]);

  // Realtime subscriptions for reactions/reads scoped to messages currently loaded in this thread.
  // This avoids subscribing to all reactions/reads globally.
  const subscribedMessageIds =
    messagesQuery.data?.pages
      .flatMap((p: any) => p.messages || [])
      .map((m: any) => m?.id)
      .filter((id: any) => typeof id === 'string' && !id.startsWith('temp-')) || [];

  const messageIdsForFilter = subscribedMessageIds.slice(0, 200);
  const messageIdsKey = messageIdsForFilter.join(',');

  useEffect(() => {
    if (!conversationId) return;
    if (!messageIdsForFilter.length) return;

    const inFilter = `message_id=in.(${messageIdsForFilter.join(',')})`;

    const channel = supabase
      .channel(`message-meta:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: inFilter },
        (payload) => {
          const reaction = (payload.new || payload.old) as any;
          const messageId = reaction?.message_id as string | undefined;
          if (!messageId) return;

          if (payload.eventType === 'INSERT') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              const exists = reactions.some((r: any) => r.id === reaction.id);
              if (exists) return m;
              return { ...m, reactions: [...reactions, reaction] };
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              return {
                ...m,
                reactions: reactions.map((r: any) => (r.id === reaction.id ? { ...r, ...reaction } : r)),
              };
            });
            return;
          }

          if (payload.eventType === 'DELETE') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              return {
                ...m,
                reactions: reactions.filter((r: any) => r.id !== reaction.id),
              };
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads', filter: inFilter },
        (payload) => {
          const read = payload.new as any;
          const messageId = read?.message_id as string | undefined;
          const readUserId = read?.user_id as string | undefined;
          if (!messageId || !readUserId) return;

          patchMessageInCache(messageId, (m) => {
            const readBy = Array.isArray(m.read_by) ? m.read_by : [];
            if (readBy.includes(readUserId)) return m;
            return { ...m, read_by: [...readBy, readUserId] };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, messageIdsKey, patchMessageInCache]);

  // Send message mutation with optimistic update
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
      metadata?: any;
    }) => {
      if (!conversationId || !userId) throw new Error('Invalid state');
      if (!content?.trim() && !mediaUrls?.length) throw new Error('Message is empty');

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

      return data;
    },
    // Optimistic update - show message immediately
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(messagesQueryKey);

      // Optimistically update to the new value
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: userId,
        content: variables.content?.trim() || null,
        media_urls: variables.mediaUrls || [],
        reply_to_id: variables.replyToId || null,
        message_type: (variables as any).messageType || 'text',
        metadata: (variables as any).metadata || {},
        edited_at: null,
        pinned_at: null,
        pinned_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
        deleted_at: null,
        sender: { id: userId, username: 'Bạn', avatar_url: null, full_name: null },
        reactions: [],
        read_by: [],
        reply_to: null,
      };

      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) {
          return {
            pages: [{ messages: [optimisticMessage], nextCursor: null }],
            pageParams: [0],
          };
        }
        const firstPage = old.pages[0];
        return {
          ...old,
          pages: [
            {
              ...firstPage,
              // Pages are stored in DESC order, so newest goes first.
              messages: [optimisticMessage, ...firstPage.messages],
            },
            ...old.pages.slice(1),
          ],
        };
      });

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
      console.error('Failed to send message:', err);
    },
    onSettled: () => {
      // Refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  // Mark message as read
  const markAsRead = useCallback(
    async (messageIds: string | string[]) => {
      if (!userId) return;
      const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (!uniqueIds.length) return;

      await supabase.from('message_reads').upsert(
        uniqueIds.map((messageId) => ({ message_id: messageId, user_id: userId })),
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

  const editMessage = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const next = content.trim();
      if (!next) throw new Error('Message is empty');
      const { error } = await supabase
        .from('messages')
        .update({ content: next, edited_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      return { messageId, content: next };
    },
    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previousMessages = queryClient.getQueryData(messagesQueryKey);
      patchMessageInCache(messageId, (m) => ({
        ...m,
        content: content.trim(),
        edited_at: new Date().toISOString(),
      }));
      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  const softDeleteMessage = useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          content: null,
          media_urls: [],
        })
        .eq('id', messageId);
      if (error) throw error;
      return { messageId };
    },
    onMutate: async ({ messageId }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previousMessages = queryClient.getQueryData(messagesQueryKey);
      patchMessageInCache(messageId, (m) => ({
        ...m,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        content: null,
        media_urls: [],
      }));
      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  // Flatten all messages (pages are DESC); reverse once to render ASC
  const allMessagesDesc = messagesQuery.data?.pages.flatMap((p) => p.messages) || [];
  const allMessages = allMessagesDesc.slice().reverse();

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
    editMessage,
    softDeleteMessage,
  };
}
