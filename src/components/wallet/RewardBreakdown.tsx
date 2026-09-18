import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Coins, CheckCircle, Clock } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export interface RewardStats {
  posts_count: number;
  reactions_on_posts: number;
  comments_count: number;
  shares_count: number;
  friends_count: number;
  livestreams_count: number;
  total_reward: number;
  today_reward: number;
}

interface RewardBreakdownProps {
  stats: RewardStats | null;
  claimedAmount: number;
  isLoading?: boolean;
}

const REWARD_CONFIG = {
  NEW_USER_BONUS: 50000,
  posts: { reward: 10000 },
  reactions: { reward: 1000 },
  comments: { reward: 2000 },
  shares: { reward: 10000 },
  friends: { reward: 10000 },
  livestreams: { reward: 20000 },
};

const formatNumber = (num: number) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const RewardBreakdown = ({ stats, claimedAmount, isLoading }: RewardBreakdownProps) => {
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-amber-800 dark:text-amber-200">
            <Coins className="w-5 h-5" />
            {t('walletRewardDetails')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-6 bg-amber-200/50 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const totalReward = Number(stats.total_reward) || 0;
  const claimable = Math.max(0, totalReward - claimedAmount);

  const breakdownItems = [
    { emoji: '🎁', label: t('walletSignupBonus'), count: null, reward: REWARD_CONFIG.NEW_USER_BONUS },
    { emoji: '📝', label: t('walletCreatePost'), count: stats.posts_count, reward: REWARD_CONFIG.posts.reward },
    { emoji: '❤️', label: t('walletReceiveReaction'), count: stats.reactions_on_posts, reward: REWARD_CONFIG.reactions.reward },
    { emoji: '💬', label: t('walletReceiveComment'), count: stats.comments_count, reward: REWARD_CONFIG.comments.reward },
    { emoji: '🔄', label: t('walletGetShared'), count: stats.shares_count, reward: REWARD_CONFIG.shares.reward },
    { emoji: '👥', label: t('walletMakeFriend'), count: stats.friends_count, reward: REWARD_CONFIG.friends.reward },
    { emoji: '📺', label: t('walletLivestream'), count: stats.livestreams_count, reward: REWARD_CONFIG.livestreams.reward },
  ];

  return (
    <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-amber-800 dark:text-amber-200">
          <Coins className="w-5 h-5" />
          {t('walletRewardDetails')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5 text-sm">
          {breakdownItems.map((item, index) => (
            <div key={index} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-base">{item.emoji}</span>
                <span className="text-amber-900 dark:text-amber-100 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                {item.count !== null ? (
                  <span className="text-amber-600 dark:text-amber-400 text-xs whitespace-nowrap">
                    {item.count} × {formatNumber(item.reward)}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 text-xs">{t('walletOnce')}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-amber-600 dark:text-amber-400 italic px-2">
          ⚠️ {t('walletDailyCapNote')}
        </p>

        <div className="border-t border-amber-300 dark:border-amber-700 my-3" />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1.5 px-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-base">💰</span>
              <span className="font-medium text-amber-900 dark:text-amber-100">{t('walletTotalReward')}</span>
            </div>
            <span className="font-bold text-amber-800 dark:text-amber-200">{formatNumber(totalReward)} CAMLY</span>
          </div>

          {claimedAmount > 0 && (
            <div className="flex items-center justify-between py-1.5 px-2 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-700 dark:text-green-400">{t('walletClaimed')}</span>
              </div>
              <span className="font-medium text-green-600 dark:text-green-400">-{formatNumber(claimedAmount)} CAMLY</span>
            </div>
          )}

          <div className="flex items-center justify-between py-2 px-2 bg-gradient-to-r from-yellow-400/20 to-amber-400/20 rounded-lg border border-yellow-400/30">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="font-medium text-yellow-800 dark:text-yellow-200">{t('walletClaimable')}</span>
            </div>
            <span className="font-bold text-lg text-yellow-700 dark:text-yellow-300">{formatNumber(claimable)} CAMLY</span>
          </div>
        </div>

        {stats.today_reward > 0 && (
          <div className="mt-3 flex items-center justify-center gap-2 py-2 px-3 bg-green-100 dark:bg-green-900/30 rounded-full text-sm">
            <Gift className="w-4 h-4 text-green-600" />
            <span className="text-green-700 dark:text-green-300">
              {t('walletToday')}: +{formatNumber(stats.today_reward)} CAMLY
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RewardBreakdown;
