import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useReelBookmarks() {
  const queryClient = useQueryClient();

  const toggleBookmark = useMutation({
    mutationFn: async ({ reelId, isBookmarked, userId }: { reelId: string; isBookmarked: boolean; userId: string }) => {
      if (isBookmarked) {
        await supabase.from('reel_bookmarks').delete().eq('reel_id', reelId).eq('user_id', userId);
      } else {
        await supabase.from('reel_bookmarks').insert({ reel_id: reelId, user_id: userId });
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      toast.success(vars.isBookmarked ? 'Removed from saved' : 'Saved!');
    },
  });

  return { toggleBookmark };
}
