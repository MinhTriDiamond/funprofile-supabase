import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Film, Play } from 'lucide-react';

interface ProfileReelsSectionProps {
  userId: string;
}

export const ProfileReelsSection = ({ userId }: ProfileReelsSectionProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const { data: reels = [], isLoading } = useQuery({
    queryKey: ['user-reels', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reels')
        .select('id, video_url, thumbnail_url, view_count, like_count, created_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="text-center py-12">
        <Film className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">{t('noReelsYet')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {reels.map((reel) => (
        <button
          key={reel.id}
          onClick={() => navigate(`/reels/${reel.id}`)}
          className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden group"
        >
          {reel.thumbnail_url ? (
            <img src={reel.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <video src={reel.video_url} className="w-full h-full object-cover" preload="metadata" />
          )}
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {/* View count */}
          <div className="absolute bottom-1 left-1 flex items-center gap-1 text-white text-xs">
            <Play className="w-3 h-3 fill-current" />
            <span>{reel.view_count}</span>
          </div>
        </button>
      ))}
    </div>
  );
};
