import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string | null;
  updated_at: string | null;
  participants?: ConversationParticipant[];
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string | null;
  nickname: string | null;
  joined_at: string | null;
  left_at: string | null;
  muted_until: string | null;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
  };
}

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

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name')
        .in('id', Array.from(allUserIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Map profiles to participants
      return conversations?.map(conv => ({
        ...conv,
        participants: conv.conversation_participants?.map((p: ConversationParticipant) => ({
          ...p,
          profile: profileMap.get(p.user_id)
        }))
      })) || [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  // Realtime subscription for conversation updates — filtered by userId to avoid
  // triggering invalidation for unrelated conversations (MED-3 fix)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`conversations-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          // Only invalidate if we're a participant — check against cached conversation ids
          const cachedConvs = queryClient.getQueryData<{ id: string }[]>(['conversations', userId]);
          const isRelevant = cachedConvs?.some(c => c.id === (payload.new as { id: string }).id);
          if (isRelevant) {
            queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Create direct conversation
  const createDirectConversation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!userId) throw new Error('User not authenticated');

      // Check if conversation already exists
      const { data: existingParticipants } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (existingParticipants?.length) {
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', otherUserId)
          .in('conversation_id', existingParticipants.map(p => p.conversation_id))
          .is('left_at', null);

        if (otherParticipants?.length) {
          // Check if it's a direct (2-person) conversation
          for (const op of otherParticipants) {
            const { data: allParticipants } = await supabase
              .from('conversation_participants')
              .select('user_id')
              .eq('conversation_id', op.conversation_id)
              .is('left_at', null);

            if (allParticipants?.length === 2) {
              // Found existing direct conversation
              const { data: conv } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', op.conversation_id)
                .eq('type', 'direct')
                .single();

              if (conv) return conv;
            }
          }
        }
      }

      // Create new conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'direct',
          created_by: userId,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add both participants
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conversation.id, user_id: userId, role: 'member' },
          { conversation_id: conversation.id, user_id: otherUserId, role: 'member' },
        ]);

      if (partError) throw partError;

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
        .select('id, username, avatar_url, full_name')
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
