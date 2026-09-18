import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface LiveFriend {
  sessionId: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  host: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export function useFollowingLiveStatus() {
  const [liveFriends, setLiveFriends] = useState<LiveFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userId } = useCurrentUser();

  const fetchLiveFriends = async () => {
    if (!userId) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (!friendships || friendships.length === 0) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    const friendIds = friendships.map((f) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    const { data: sessions } = await supabase
      .from('live_sessions')
      .select(
        `id, title, viewer_count, started_at, status,
         host_profile:profiles!live_sessions_host_user_id_fkey(id, username, avatar_url)`
      )
      .in('status', ['live', 'reconnecting'])
      .in('host_user_id', friendIds);

    if (!sessions) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    const mapped: LiveFriend[] = sessions.map((s: any) => ({
      sessionId: s.id,
      title: s.title || 'Phát trực tiếp',
      viewerCount: s.viewer_count || 0,
      startedAt: s.started_at,
      host: {
        id: s.host_profile?.id || '',
        username: s.host_profile?.username || 'User',
        avatar_url: s.host_profile?.avatar_url || null,
      },
    }));

    setLiveFriends(mapped);
    setIsLoading(false);
  };

  useEffect(() => {
    setIsLoading(true);
    fetchLiveFriends();

    const channel = supabase
      .channel('following-live-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        () => {
          fetchLiveFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    liveFriends,
    isLoading,
    count: liveFriends.length,
    hasLive: liveFriends.length > 0,
  };
}
