
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { UserBlock } from '../types';
import { chatRpc } from '../chatRpc';

export function useBlocks(currentUserId: string | null) {
  const queryClient = useQueryClient();

  const myBlocksQuery = useQuery({
    queryKey: ['chat-blocks', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [] as UserBlock[];
      const rows = await chatRpc.getMyBlockRelationships();
      return rows.filter((row) => row.blocker_id === currentUserId).map((row) => ({
        id: `${row.blocker_id}:${row.blocked_id}`,
        ...row,
      })) as UserBlock[];
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
  });

  const blockedByOthersQuery = useQuery({
    queryKey: ['chat-blocked-by-others', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [] as UserBlock[];
      const rows = await chatRpc.getMyBlockRelationships();
      return rows.filter((row) => row.blocked_id === currentUserId).map((row) => ({
        id: `${row.blocker_id}:${row.blocked_id}`,
        ...row,
      })) as UserBlock[];
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
  });

  const blockedIds = new Set((myBlocksQuery.data || []).map((b) => b.blocked_id));
  const blockedByIds = new Set((blockedByOthersQuery.data || []).map((b) => b.blocker_id));

  const blockUser = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: currentUserId, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-blocks', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['chat-blocked-by-others', currentUserId] });
    },
  });

  const unblockUser = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-blocks', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['chat-blocked-by-others', currentUserId] });
    },
  });

  return {
    blocks: myBlocksQuery.data || [],
    blockedIds,
    blockedByIds,
    isLoading: myBlocksQuery.isLoading || blockedByOthersQuery.isLoading,
    error: myBlocksQuery.error || blockedByOthersQuery.error,
    blockUser,
    unblockUser,
  };
}
