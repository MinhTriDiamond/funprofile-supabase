import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText, Image, Video, Radio, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ContentStatsType } from './ContentStatsModal';
import { formatNumber } from '@/lib/formatters';
import { ExpandableContent } from './ExpandableContent';
import { FeedVideoPlayer } from './FeedVideoPlayer';

interface PostRow {
  id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  media_urls: unknown;
  post_type: string | null;
  created_at: string;
}

interface Props {
  userId: string;
  displayName: string;
  date: string;
  mode: 'day' | 'week' | 'month' | 'custom';
  type: ContentStatsType;
  username?: string;
  totalReward?: number;
  dateFrom?: string;
  dateTo?: string;
  onBack: () => void;
}

const formatTimeVN = (iso: string) => {
  const dt = new Date(iso);
  const vnH = dt.getUTCHours() + 7;
  const h = vnH >= 24 ? vnH - 24 : vnH < 0 ? vnH + 24 : vnH;
  const m = String(dt.getUTCMinutes()).padStart(2, '0');
  const day = dt.getUTCDate();
  const mon = dt.getUTCMonth() + 1;
  return `${h}:${m} — ${String(day).padStart(2, '0')}/${String(mon).padStart(2, '0')}`;
};

const getPostIcon = (type: ContentStatsType, postType: string | null) => {
  if (type === 'livestreams') return <Radio className="w-4 h-4 text-red-500 shrink-0" />;
  if (type === 'rewards') return <Star className="w-4 h-4 text-yellow-500 shrink-0" />;
  if (type === 'videos' || postType === 'video') return <Video className="w-4 h-4 text-blue-500 shrink-0" />;
  if (type === 'photos') return <Image className="w-4 h-4 text-green-600 shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
};

export const UserPostsDetail = ({ userId, displayName, date, mode, type, username, totalReward, dateFrom, dateTo, onBack }: Props) => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['user-posts-by-period', userId, type, date, mode, dateFrom, dateTo],
    queryFn: async (): Promise<PostRow[]> => {
      const { data, error } = await supabase.rpc('get_user_posts_by_period_vn', {
        p_user_id: userId,
        p_type: type,
        p_date: date,
        p_mode: mode === 'custom' ? 'day' : mode,
        p_date_from: mode === 'custom' ? dateFrom : null,
        p_date_to: mode === 'custom' ? dateTo : null,
      });
      if (error) throw error;
      return (data as PostRow[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const noContent = language === 'vi' ? '(Không có nội dung)' : '(No content)';
  return (
    <div className="flex-1 overflow-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300 hover:opacity-70 transition-opacity mb-2 px-1"
      >
        <ArrowLeft className="w-4 h-4" />
        {language === 'vi' ? 'Quay lại' : 'Back'}
      </button>

      <div className="text-center text-[15px] font-semibold mb-3 text-green-800 dark:text-green-300">
        {username ? (
          <span
            className="cursor-pointer hover:underline"
            onClick={() => navigate(`/@${username}`)}
          >
            {displayName}
          </span>
        ) : (
          displayName
        )} — {type === 'rewards' && totalReward != null
          ? `${formatNumber(totalReward)} CAMLY`
          : `${posts?.length || 0} ${type === 'livestreams' ? 'livestream' : language === 'vi' ? 'bài viết' : 'posts'}`
        }
      </div>

      {isLoading ? (
        <div className="space-y-2 p-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : !posts?.length ? (
        <div className="p-8 text-center text-muted-foreground">
          {language === 'vi' ? 'Không có dữ liệu' : 'No data'}
        </div>
      ) : (
        <div className="space-y-1">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-lg hover:bg-muted/50 transition-colors p-2.5"
            >
              <div className="flex items-start gap-2.5">
                {getPostIcon(type, post.post_type)}
                <div className="flex-1 min-w-0">
                  {post.content ? (
                    <ExpandableContent
                      content={post.content}
                      maxLength={120}
                      maxLines={3}
                      className="text-[14px] text-foreground leading-snug"
                    />
                  ) : (
                    <p className="text-[14px] text-muted-foreground italic">{noContent}</p>
                  )}
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {formatTimeVN(post.created_at)}
                  </p>

                  {post.video_url && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
                      <FeedVideoPlayer
                        src={post.video_url}
                        poster={post.image_url || undefined}
                        isLiveReplay={type === 'livestreams'}
                        itemId={`${type}-${post.id}`}
                        className="aspect-video rounded-none"
                      />
                    </div>
                  )}
                </div>
                {post.image_url && !post.video_url && (
                  <img
                    src={post.image_url}
                    alt=""
                    className="w-10 h-10 rounded object-cover shrink-0"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
