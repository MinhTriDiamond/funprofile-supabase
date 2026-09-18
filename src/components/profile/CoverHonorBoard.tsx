import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, Share2, BadgeDollarSign, Coins, Gift, Users, Video, Calendar, Heart, Send } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { GiftBreakdownDialog } from './GiftBreakdownDialog';
import { useGiftBreakdown } from '@/hooks/useGiftBreakdown';

interface CoverHonorBoardProps {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export const CoverHonorBoard = ({ userId, username, avatarUrl }: CoverHonorBoardProps) => {
  const { t, language } = useLanguage();
  
  const [breakdownDir, setBreakdownDir] = useState<'sent' | 'received' | null>(null);
  const { data: sentBreakdown } = useGiftBreakdown(userId, 'sent');
  const { data: receivedBreakdown } = useGiftBreakdown(userId, 'received');

  // Use dedicated RPC that includes banned users' data
  const { data: honorData, isLoading: loading } = useQuery({
    queryKey: ['honor-stats', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_honor_stats', { p_user_id: userId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stats = {
    posts_count: Number(honorData?.actual_posts_count) || Number(honorData?.posts_count) || 0,
    comments_count: Number(honorData?.actual_comments_count) || Number(honorData?.comments_count) || 0,
    reactions_on_posts: Number(honorData?.actual_reactions_count) || Number(honorData?.reactions_on_posts) || 0,
    shares_count: Number(honorData?.actual_shares_count) || Number(honorData?.shares_count) || 0,
    friends_count: Number(honorData?.actual_friends_count) || Number(honorData?.friends_count) || 0,
    livestreams_count: Number(honorData?.livestreams_count) || 0,
    claimable: Math.max(0, (Number(honorData?.total_reward) || 0) - (Number(honorData?.claimed_amount) || 0)),
    claimed: Number(honorData?.claimed_amount) || 0,
    today_reward: Number(honorData?.today_reward) || 0,
    total_reward: Number(honorData?.total_reward) || 0,
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  };

  if (loading) {
    return (
      <div className="w-full">
        <Skeleton className="h-[200px] w-full rounded-2xl" />
      </div>
    );
  }

  // Helper to get font size based on number of digits
  const getValueFontSize = (value: number): string => {
    const digits = formatNumber(value).length;
    if (digits <= 4) return 'text-[11px] sm:text-xs md:text-sm';
    if (digits <= 6) return 'text-[10px] sm:text-[11px] md:text-xs';
    if (digits <= 8) return 'text-[9px] sm:text-[10px] md:text-[11px]';
    return 'text-[8px] sm:text-[9px] md:text-[10px]';
  };

  // Helper to capitalize first letter only
  const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const StatRow = ({ icon, label, value, displayValue, onClick }: { icon: React.ReactNode; label: string; value: number; displayValue?: string; onClick?: () => void }) => (
    <div
      onClick={onClick}
      className="flex items-center justify-between py-1.5 px-3 sm:px-4 rounded-full bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] backdrop-blur-sm border-[3px] border-[#D4AF37] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink min-w-0 overflow-hidden">
        <div className="text-[#F5E6C8] flex-shrink-0">
          {icon}
        </div>
        <span 
          className="text-[#F5E6C8] text-[10px] sm:text-[11px] md:text-xs tracking-wide truncate font-normal"
        >
          {capitalizeFirst(label)}
        </span>
      </div>
      <span 
        className={`text-[#FFD700] ${getValueFontSize(value)} tabular-nums flex-shrink-0 ml-2 font-normal`}
      >
        {displayValue ?? formatNumber(value)}
      </span>
    </div>
  );

  const formatUsd = (n: number) =>
    '$' + n.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 });

  return (
    <>
      {/* Desktop: Inline block for profile info section - aligned to right */}
      <div className="w-full flex justify-end">
        {/* Main Container - Glassmorphism with green gradient matching homepage */}
        <div 
          className="rounded-2xl overflow-hidden bg-white/80 backdrop-blur-xl shadow-lg w-full max-w-[420px]"
          style={{
            border: '3px solid transparent',
            backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #22c55e 0%, #4ade80 25%, #22c55e 50%, #16a34a 75%, #22c55e 100%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
            boxShadow: '0 0 15px rgba(34, 197, 94, 0.4)'
          }}
        >
          <div className="p-3 sm:p-4">
            {/* Header - Logo, Title, Avatar */}
            <div className="text-center mb-3">
              <div className="flex items-center justify-center gap-2">
                {/* FUN Profile Logo */}
                <img 
                  src="/fun-profile-logo-40.webp" 
                  alt="FUN Profile" 
                  className="w-8 h-8 rounded-full border-2 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                />
                <h1 
                  className="text-lg tracking-wider uppercase leading-none font-black"
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    background: 'linear-gradient(90deg, #FF6B9D 0%, #C44FE2 15%, #7B68EE 30%, #00CED1 50%, #98FB98 70%, #FFFF00 85%, #FFB347 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(1px 1px 0px rgba(255,255,255,0.5)) drop-shadow(0 0 8px rgba(255, 182, 193, 0.5))',
                  }}
                >
                  HONOR BOARD
                </h1>
                {/* User Avatar */}
                <Avatar className="w-8 h-8 border-2 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.6)]">
                  <AvatarImage src={avatarUrl} sizeHint="sm" />
                  <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-800 text-white font-bold text-sm">
                    {username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Two Column Layout - 6 items (3 per column) — theo hình mẫu */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {/* Left Column */}
              <div className="space-y-1.5 sm:space-y-2">
                <StatRow icon={<ArrowUp className="w-3.5 h-3.5" />} label={t('posts')} value={stats.posts_count} />
                <StatRow icon={<Users className="w-3.5 h-3.5" />} label={t('friends')} value={stats.friends_count} />
              </div>

              {/* Right Column */}
              <div className="space-y-1.5 sm:space-y-2">
                <StatRow icon={<Gift className="w-3.5 h-3.5" />} label={t('walletClaimable')} value={stats.claimable} />
                <StatRow icon={<Coins className="w-3.5 h-3.5" />} label={t('walletClaimed')} value={stats.claimed} />
              </div>
            </div>

            {/* Total Rows */}
            <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
              <StatRow icon={<Calendar className="w-3.5 h-3.5" />} label={t('walletToday')} value={stats.today_reward} />
              <StatRow icon={<BadgeDollarSign className="w-3.5 h-3.5" />} label={t('totalReward')} value={stats.total_reward} />
            </div>

            {/* Gift Sent / Received Rows (USD) */}
            <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
              <StatRow
                icon={<Send className="w-3.5 h-3.5" />}
                label={t('totalSent')}
                value={sentBreakdown?.totalUsd || 0}
                displayValue={sentBreakdown?.pricesUnavailable ? 'Chưa có giá' : formatUsd(sentBreakdown?.totalUsd || 0)}
                onClick={() => setBreakdownDir('sent')}
              />
              <StatRow
                icon={<Heart className="w-3.5 h-3.5" />}
                label={t('totalReceived')}
                value={receivedBreakdown?.totalUsd || 0}
                displayValue={receivedBreakdown?.pricesUnavailable ? 'Chưa có giá' : formatUsd(receivedBreakdown?.totalUsd || 0)}
                onClick={() => setBreakdownDir('received')}
              />
            </div>
          </div>
        </div>
      </div>

      {breakdownDir && (
        <GiftBreakdownDialog
          userId={userId}
          direction={breakdownDir}
          open={!!breakdownDir}
          onOpenChange={(o) => !o && setBreakdownDir(null)}
        />
      )}
    </>
  );
};

// Standalone Mobile Stats component for use in bottom sheet
interface MobileStatsProps {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export const MobileStats = ({ userId, username, avatarUrl }: MobileStatsProps) => {
  const { t, language } = useLanguage();
  const [breakdownDir, setBreakdownDir] = useState<'sent' | 'received' | null>(null);
  const { data: sentBreakdown } = useGiftBreakdown(userId, 'sent');
  const { data: receivedBreakdown } = useGiftBreakdown(userId, 'received');

  const { data: honorData, isLoading: loading } = useQuery({
    queryKey: ['honor-stats', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_honor_stats', { p_user_id: userId });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stats = {
    posts_count: Number(honorData?.actual_posts_count) || Number(honorData?.posts_count) || 0,
    comments_count: Number(honorData?.actual_comments_count) || Number(honorData?.comments_count) || 0,
    reactions_on_posts: Number(honorData?.actual_reactions_count) || Number(honorData?.reactions_on_posts) || 0,
    shares_count: Number(honorData?.actual_shares_count) || Number(honorData?.shares_count) || 0,
    friends_count: Number(honorData?.actual_friends_count) || Number(honorData?.friends_count) || 0,
    livestreams_count: Number(honorData?.livestreams_count) || 0,
    claimable: Math.max(0, (Number(honorData?.total_reward) || 0) - (Number(honorData?.claimed_amount) || 0)),
    claimed: Number(honorData?.claimed_amount) || 0,
    today_reward: Number(honorData?.today_reward) || 0,
    total_reward: Number(honorData?.total_reward) || 0,
  };

  const formatNumber = (num: number): string => num.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  
  // Helper to get font size based on number of digits for mobile
  const getValueFontSize = (value: number): string => {
    const digits = formatNumber(value).length;
    if (digits <= 4) return 'text-xs';
    if (digits <= 6) return 'text-[11px]';
    if (digits <= 8) return 'text-[10px]';
    return 'text-[9px]';
  };

  // Mobile stat cell with auto-scaling font - matching homepage green style
  const MobileStatCell = ({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) => (
    <div className="bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] rounded-lg py-1.5 px-1 border-[3px] border-[#D4AF37] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden transition-all duration-300 hover:scale-[1.02]">
      <div className="mx-auto text-[#F5E6C8] mb-0.5 flex justify-center">{icon}</div>
      <div className={`text-[#FFD700] ${getValueFontSize(value)} tabular-nums truncate font-extrabold`}>{formatNumber(value)}</div>
      <div className="text-[#F5E6C8]/90 text-[8px] uppercase truncate font-bold">{label}</div>
    </div>
  );

  // Mobile total row with auto-scaling font - matching homepage green style
  const MobileTotalRow = ({ icon, label, value, displayValue, onClick }: { icon: React.ReactNode; label: string; value: number; displayValue?: string; onClick?: () => void }) => (
    <div
      onClick={onClick}
      className={`bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] rounded-lg py-1.5 px-2 border-[3px] border-[#D4AF37] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-between overflow-hidden transition-all duration-300 hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-1 flex-shrink min-w-0">
        <div className="text-[#F5E6C8] flex-shrink-0">{icon}</div>
        <span className="text-[#F5E6C8] text-[9px] uppercase truncate font-extrabold">{label}</span>
      </div>
      <span className={`text-[#FFD700] ${getValueFontSize(value)} tabular-nums flex-shrink-0 ml-1 font-extrabold`}>{displayValue ?? formatNumber(value)}</span>
    </div>
  );

  const formatUsd = (n: number) =>
    '$' + n.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="w-full p-4">
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div 
        className="rounded-2xl overflow-hidden bg-white/80 backdrop-blur-xl shadow-lg"
        style={{
          border: '3px solid transparent',
          backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #22c55e 0%, #4ade80 25%, #22c55e 50%, #16a34a 75%, #22c55e 100%)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          boxShadow: '0 0 15px rgba(34, 197, 94, 0.4)'
        }}
      >
        <div className="p-2.5">
          {/* Header - Logo, Title, Avatar - matching desktop */}
          <div className="text-center mb-2">
            <div className="flex items-center justify-center gap-2">
              <img 
                src="/fun-profile-logo-40.webp" 
                alt="FUN Profile" 
                className="w-7 h-7 rounded-full border-2 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.6)]"
              />
              <h1 
                className="text-base tracking-wider uppercase leading-none font-black"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  background: 'linear-gradient(90deg, #FF6B9D 0%, #C44FE2 15%, #7B68EE 30%, #00CED1 50%, #98FB98 70%, #FFFF00 85%, #FFB347 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(1px 1px 0px rgba(255,255,255,0.5)) drop-shadow(0 0 8px rgba(255, 182, 193, 0.5))',
                }}
              >
                HONOR BOARD
              </h1>
              <Avatar className="w-7 h-7 border-2 border-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.6)]">
                <AvatarImage src={avatarUrl} sizeHint="sm" />
                <AvatarFallback className="bg-gradient-to-br from-green-600 to-green-800 text-white font-bold text-xs">
                  {username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
          
          {/* Two Column Layout - 4 items (2 per column) */}
          <div className="grid grid-cols-2 gap-1.5">
            <MobileTotalRow icon={<ArrowUp className="w-3.5 h-3.5" />} label={t('posts')} value={stats.posts_count} />
            <MobileTotalRow icon={<Users className="w-3.5 h-3.5" />} label={t('friends')} value={stats.friends_count} />
            <MobileTotalRow icon={<Gift className="w-3.5 h-3.5" />} label={t('walletClaimable')} value={stats.claimable} />
            <MobileTotalRow icon={<Coins className="w-3.5 h-3.5" />} label={t('walletClaimed')} value={stats.claimed} />
          </div>

          {/* Total rows */}
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <MobileTotalRow icon={<Calendar className="w-3.5 h-3.5" />} label={t('walletToday')} value={stats.today_reward} />
            <MobileTotalRow icon={<BadgeDollarSign className="w-3.5 h-3.5" />} label={t('totalReward')} value={stats.total_reward} />
          </div>

          {/* Gift Sent / Received (USD) */}
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <MobileTotalRow
              icon={<Send className="w-3.5 h-3.5" />}
              label={t('totalSent')}
              value={sentBreakdown?.totalUsd || 0}
              displayValue={sentBreakdown?.pricesUnavailable ? 'Chưa có giá' : formatUsd(sentBreakdown?.totalUsd || 0)}
              onClick={() => setBreakdownDir('sent')}
            />
            <MobileTotalRow
              icon={<Heart className="w-3.5 h-3.5" />}
              label={t('totalReceived')}
              value={receivedBreakdown?.totalUsd || 0}
              displayValue={receivedBreakdown?.pricesUnavailable ? 'Chưa có giá' : formatUsd(receivedBreakdown?.totalUsd || 0)}
              onClick={() => setBreakdownDir('received')}
            />
          </div>
        </div>
      </div>

      {breakdownDir && (
        <GiftBreakdownDialog
          userId={userId}
          direction={breakdownDir}
          open={!!breakdownDir}
          onOpenChange={(o) => !o && setBreakdownDir(null)}
        />
      )}
    </div>
  );
};
