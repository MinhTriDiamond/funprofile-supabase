
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAngelInline() {
  const invokeAngel = useMutation({
    mutationFn: async (input: { conversationId: string; prompt: string }) => {
      const { data, error } = await supabase.functions.invoke('angel-inline', {
        body: {
          conversation_id: input.conversationId,
          prompt: input.prompt,
        },
      });
      if (error) throw error;
      return data;
    },
  });

  return { invokeAngel };
}
