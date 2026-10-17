
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { chatRpc } from '../chatRpc';

export function useGroupConversations(userId: string | null) {
  const queryClient = useQueryClient();

  // Create group conversation
  const createGroupConversation = useMutation({
    mutationFn: async ({
      name,
      memberIds,
    }: {
      name: string;
      memberIds: string[];
    }) => {
      if (!userId) throw new Error('User not authenticated');
      if (memberIds.length < 1) throw new Error('At least 1 member required');

      const conversationId = await chatRpc.createGroupConversation(name, memberIds);
      const { data: conversation, error } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
      if (error) throw error;
      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('Đã tạo nhóm mới');
    },
    onError: (error) => {
      console.error('Error creating group:', error);
      toast.error('Không thể tạo nhóm');
    },
  });

  // Add member to group
  const addMember = useMutation({
    mutationFn: async ({
      conversationId,
      memberId,
    }: {
      conversationId: string;
      memberId: string;
    }) => {
      await chatRpc.manageConversationMember(conversationId, memberId, 'add');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      toast.success('Đã thêm thành viên');
    },
  });

  // Remove member from group
  const removeMember = useMutation({
    mutationFn: async ({
      conversationId,
      memberId,
    }: {
      conversationId: string;
      memberId: string;
    }) => {
      await chatRpc.manageConversationMember(conversationId, memberId, 'remove');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      toast.success('Đã xóa thành viên');
    },
  });

  // Update group settings
  const updateGroup = useMutation({
    mutationFn: async ({
      conversationId,
      updates,
    }: {
      conversationId: string;
      updates: { name?: string; avatar_url?: string };
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('Đã cập nhật nhóm');
    },
  });

  // Leave group
  const leaveGroup = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) throw new Error('User not authenticated');

      await chatRpc.leaveConversation(conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('Đã rời nhóm');
    },
  });

  return {
    createGroupConversation,
    addMember,
    removeMember,
    updateGroup,
    leaveGroup,
  };
}
