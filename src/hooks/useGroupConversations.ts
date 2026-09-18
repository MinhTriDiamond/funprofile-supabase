import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

      // Create conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          name,
          created_by: userId,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add all participants (including creator as admin)
      const participants = [
        { conversation_id: conversation.id, user_id: userId, role: 'admin' },
        ...memberIds.map((id) => ({
          conversation_id: conversation.id,
          user_id: id,
          role: 'member',
        })),
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) throw partError;

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
      const { error } = await supabase.from('conversation_participants').insert({
        conversation_id: conversationId,
        user_id: memberId,
        role: 'member',
      });

      if (error) throw error;
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
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', memberId);

      if (error) throw error;
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

      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw error;
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
