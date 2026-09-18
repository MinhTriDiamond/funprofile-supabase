import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface FollowButtonProps {
  userId: string;
}

export const FollowButton = ({ userId }: FollowButtonProps) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();

  const { data: friendshipStatus } = useQuery({
    queryKey: ['is-following', userId, currentUser?.id],
    queryFn: async () => {
      if (!currentUser || currentUser.id === userId) return null;
      const { data } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUser.id})`)
        .maybeSingle();
      return data;
    },
    enabled: !!currentUser && currentUser.id !== userId,
  });

  const sendRequest = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('Login required');
      const { error } = await supabase.from('friendships').insert({
        user_id: currentUser.id,
        friend_id: userId,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following', userId] });
      toast.success('Follow request sent!');
    },
  });

  if (!currentUser || currentUser.id === userId) return null;

  if (friendshipStatus?.status === 'accepted') {
    return (
      <span className="text-white/70 text-xs border border-white/30 px-3 py-1 rounded-full">
        {t('reelFollowing')}
      </span>
    );
  }

  if (friendshipStatus?.status === 'pending') {
    return (
      <span className="text-white/70 text-xs border border-white/30 px-3 py-1 rounded-full">
        Pending
      </span>
    );
  }

  return (
    <button
      onClick={() => sendRequest.mutate()}
      disabled={sendRequest.isPending}
      className="text-white text-xs font-semibold border border-white px-3 py-1 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50"
    >
      {t('reelFollow')}
    </button>
  );
};
