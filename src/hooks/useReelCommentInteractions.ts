import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useReelCommentInteractions() {
  const queryClient = useQueryClient();

  const toggleCommentLike = useMutation({
    mutationFn: async ({ commentId, isLiked, userId }: { commentId: string; isLiked: boolean; userId: string }) => {
      if (isLiked) {
        await supabase.from('reel_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
        await supabase.from('reel_comments').update({ like_count: Math.max(0, -1) }).eq('id', commentId);
        // Decrement
        const { data } = await supabase.from('reel_comments').select('like_count').eq('id', commentId).single();
        if (data) {
          await supabase.from('reel_comments').update({ like_count: Math.max(0, (data.like_count || 1) - 1) }).eq('id', commentId);
        }
      } else {
        await supabase.from('reel_comment_likes').insert({ comment_id: commentId, user_id: userId });
        const { data } = await supabase.from('reel_comments').select('like_count').eq('id', commentId).single();
        await supabase.from('reel_comments').update({ like_count: (data?.like_count || 0) + 1 }).eq('id', commentId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel-comments'] });
      queryClient.invalidateQueries({ queryKey: ['reel-comment-likes'] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('reel_comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel-comments'] });
      queryClient.invalidateQueries({ queryKey: ['reels'] });
    },
  });

  return { toggleCommentLike, deleteComment };
}
