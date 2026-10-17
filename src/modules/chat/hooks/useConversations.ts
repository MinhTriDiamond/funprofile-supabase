import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Conversation, ConversationParticipant } from '../types';
import { chatRpc } from '../chatRpc';

export function useConversations(userId: string | null) {
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      if (!userId) return [];

      // Get conversations where user is a participant
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (participantError) throw participantError;
      if (!participantData?.length) return [];

      const conversationIds = participantData.map(p => p.conversation_id);

      // Get full conversation data with participants
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          *,
          conversation_participants (
            id,
            user_id,
            role,
            nickname,
            joined_at,
            left_at
          )
        `)
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch profiles for participants
      const allUserIds = new Set<string>();
      conversations?.forEach(conv => {
        conv.conversation_participants?.forEach((p: ConversationParticipant) => {
          if (p.user_id && !p.left_at) allUserIds.add(p.user_id);
        });
      });

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, public_wallet_address, external_wallet_address, wallet_address')
        .in('id', Array.from(allUserIds));
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch unread counts in batch (2-step approach since Supabase JS doesn't support subqueries)
      const [readResult, unreadResult] = await Promise.all([
        supabase
          .from('message_reads')
          .select('message_id')
          .eq('user_id', userId),
        supabase
          .from('messages')
          .select('id, conversation_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', userId)
          .or('is_deleted.is.null,is_deleted.eq.false'),
      ]);
      if (readResult.error) throw readResult.error;
      if (unreadResult.error) throw unreadResult.error;

      const readMessageIds = new Set(readResult.data?.map(r => r.message_id) || []);

      const unreadCountMap = new Map<string, number>();
      unreadResult.data?.forEach(msg => {
        if (!readMessageIds.has(msg.id)) {
          unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1);
        }
      });

      // Map profiles to participants and attach unread counts
      return conversations?.map(conv => ({
        ...conv,
        unread_count: unreadCountMap.get(conv.id) || 0,
        participants: conv.conversation_participants?.map((p: ConversationParticipant) => ({
          ...p,
          profile: profileMap.get(p.user_id)
        }))
      })) || [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  const conversationIdsForRealtime = (conversationsQuery.data || []).map((c: any) => c.id).filter(Boolean);
  const conversationIdsKey = conversationIdsForRealtime.join(',');

  // Realtime subscription for conversation updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`conversations-changes:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      );

    // Subscribe to conversations table only when we already have conversation ids.
    // Keep participants subscription always-on so first conversation appears in realtime.
    if (conversationIdsForRealtime.length) {
      const convFilter = `id=in.(${conversationIdsForRealtime.join(',')})`;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: convFilter },
        () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      );
    }

    // Invalidate when user reads messages (badge should disappear)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reads', filter: `user_id=eq.${userId}` },
      () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
    );

    // Invalidate when new messages arrive (badge should appear/increment)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, conversationIdsKey]);

  // Create direct conversation
  const createDirectConversation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!userId) throw new Error('User not authenticated');

      const conversationId = await chatRpc.createDirectConversation(otherUserId);
      const { data: conversation, error } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
      if (error) throw error;
      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
    },
  });

  return {
    conversations: conversationsQuery.data || [],
    isLoading: conversationsQuery.isLoading,
    error: conversationsQuery.error,
    createDirectConversation,
  };
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          conversation_participants (
            id,
            user_id,
            role,
            nickname,
            joined_at,
            left_at
          )
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      // Fetch profiles for participants
      const userIds = data.conversation_participants
        ?.filter((p: ConversationParticipant) => !p.left_at)
        .map((p: ConversationParticipant) => p.user_id) || [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, public_wallet_address, external_wallet_address, wallet_address')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return {
        ...data,
        participants: data.conversation_participants?.map((p: ConversationParticipant) => ({
          ...p,
          profile: profileMap.get(p.user_id)
        }))
      };
    },
    enabled: !!conversationId,
  });
}
