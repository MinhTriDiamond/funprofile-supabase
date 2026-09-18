
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '../types';

export function usePins(conversationId: string | null) {
  const queryClient = useQueryClient();

  const pinnedQuery = useQuery({
    queryKey: ['chat-pinned', conversationId],
    queryFn: async () => {
      if (!conversationId) return null as Message | null;
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, pinned_at, pinned_by, created_at')
        .eq('conversation_id', conversationId)
        .not('pinned_at', 'is', null)
        .order('pinned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as Message | null;
    },
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // Realtime: invalidate on any messages update in the conversation (simple + reliable)
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`pins:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const pinMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('pin_message', { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const unpinMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('unpin_message', { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  return {
    pinnedMessage: pinnedQuery.data || null,
    isLoading: pinnedQuery.isLoading,
    pinMessage,
    unpinMessage,
  };
}
