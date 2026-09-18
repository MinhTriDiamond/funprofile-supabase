
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useReports(currentUserId: string | null) {
  const createReport = useMutation({
    mutationFn: async (input: {
      reportedUserId?: string | null;
      conversationId?: string | null;
      messageId?: string | null;
      reason: string;
      details?: string | null;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_user_id: input.reportedUserId ?? null,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      });
      if (error) throw error;
    },
  });

  return { createReport };
}
