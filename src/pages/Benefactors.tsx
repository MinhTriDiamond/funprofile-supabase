import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useQuery } from '@tanstack/react-query';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useBenefactorLeaderboard, useRecipientLeaderboard, TokenTotals } from '@/hooks/useBenefactorLeaderboard';
import { UsdRankingList } from '@/components/benefactors/UsdRankingList';
import type { UsdRankingRowData } from '@/components/benefactors/UsdRankingRow';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Crown,
  Heart,
  Download,
  TrendingUp,
  Users,
  Gift,
  UserCheck,
  Receipt,
  DollarSign,
  Coins,
  Sparkles,
} from 'lucide-react';


import { ExportCsvDialog } from '@/components/benefactors/ExportCsvDialog';
import { ContributionDimensionsPanel } from '@/components/benefactors/ContributionDimensionsPanel';
import { StatisticsHero } from '@/components/statistics/StatisticsHero';
import { TokenOverviewStrip, type TokenOverviewItem } from '@/components/statistics/TokenOverviewStrip';
import { RankingSegmentedTabs, type RankingSegment } from '@/components/statistics/RankingSegmentedTabs';
import { BenefactorRuleBanner } from '@/components/benefactors/BenefactorRuleBanner';
import { BenefactorTokenRankingSection } from '@/components/benefactors/BenefactorTokenRankingSection';
import type { StatisticMetric } from '@/components/statistics/types';

type TimeRange = 'day' | 'week' | 'month' | 'all';
type SegmentKey = 'usd' | 'token' | 'ecosystem';

const Benefactors = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = usePersistedTab('benefactors-tab', 'donors', ['donors', 'recipients'] as const);
  const [segment, setSegment] = usePersistedTab<SegmentKey>('benefactors-segment', 'usd', ['usd', 'token', 'ecosystem'] as const);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const { data: donors, isLoading: isDonorsLoading } = useBenefactorLeaderboard({
    limit: 100,
    timeRange,
  });

  const { data: recipients, isLoading: isRecipientsLoading } = useRecipientLeaderboard({
    limit: 100,
    timeRange,
  });

  const { data: globalStats } = useQuery({
    queryKey: ['donation-global-stats', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_donation_global_stats', { p_time_range: timeRange });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null ?? {};
      return {
        totalDonatedUsd: Number(row.total_donated_usd) || 0,
        totalsByToken: (row.totals_by_token || {}) as unknown as TokenTotals,
        totalDonors: Number(row.total_donors) || 0,
        totalRecipients: Number(row.total_recipients) || 0,
        totalDonations: Number(row.total_donations) || 0,
        totalLightScore: Number(row.total_light_score) || 0,
      };
    },
    staleTime: 60 * 1000,
  });

  const formatUsd = (n: number) =>
    n >= 1
      ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;

  const formatUsdCompact = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
    return formatUsd(n);
  };

  const formatCountCompact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('en-US');
  };

  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const donorRows: UsdRankingRowData[] = (donors ?? []).map((d) => ({
    user_id: d.user_id,
    username: d.username,
    full_name: d.full_name,
    avatar_url: d.avatar_url,
    rank: d.rank,
    total_usd: Number(d.total_donated_usd || 0),
    total_transactions: Number(d.total_donations || 0),
    light_score: Number(d.total_light_score || 0),
    totals_by_token: d.totals_by_token,
  }));

  const recipientRows: UsdRankingRowData[] = (recipients ?? []).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    full_name: r.full_name,
    avatar_url: r.avatar_url,
    rank: r.rank,
    total_usd: Number(r.total_received_usd || 0),
    total_transactions: Number(r.total_donations || 0),
    totals_by_token: r.totals_by_token,
  }));


  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        {/* Statistics Hero (generic) */}
        <div className="py-6">
          <StatisticsHero
            title={t('benTitle')}
            subtitle={t('benSubtitle')}
            icon={<Crown className="h-5 w-5" />}
            metrics={[
              {
                key: 'total_usd',
                label: t('benStatTotal'),
                value: formatUsdCompact(globalStats?.totalDonatedUsd || 0),
                description: 'USD',
                icon: <DollarSign className="h-5 w-5" />,
                color: 'primary',
              },
              {
                key: 'contributors',
                label: t('benStatDonors'),
                value: formatCountCompact(globalStats?.totalDonors || 0),
                icon: <Users className="h-5 w-5" />,
                color: 'primary',
              },
              {
                key: 'recipients',
                label: t('benStatRecipients'),
                value: formatCountCompact(globalStats?.totalRecipients || 0),
                icon: <UserCheck className="h-5 w-5" />,
                color: 'primary',
              },
              {
                key: 'transactions',
                label: t('benStatTx'),
                value: formatCountCompact(globalStats?.totalDonations || 0),
                icon: <Receipt className="h-5 w-5" />,
                color: 'primary',
              },
            ] satisfies StatisticMetric[]}
            infoBanner={<BenefactorRuleBanner />}
          />
        </div>


        {/* Token Overview strip (generic, click to jump into Token Ranking segment) */}
        {globalStats?.totalsByToken && Object.keys(globalStats.totalsByToken).length > 0 && (
          <div className="mb-4">
            <TokenOverviewStrip
              title={t('benTokenTitle')}
              activeSymbol={segment === 'token' ? tokenSymbol ?? undefined : undefined}
              onSelect={(sym) => {
                setTokenSymbol(sym);
                setSegment('token');
              }}
              items={Object.entries(globalStats.totalsByToken)
                .sort((a, b) => Number(b[1]?.usd || 0) - Number(a[1]?.usd || 0))
                .map(([symbol, item]) => ({
                  symbol,
                  amount: Number(item.amount || 0),
                  usd: Number(item.usd || 0),
                  transactions: Number(item.transactions || 0),
                }) satisfies TokenOverviewItem)}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center justify-between mb-4">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t('benToday')}</SelectItem>
              <SelectItem value="week">{t('benWeek')}</SelectItem>
              <SelectItem value="month">{t('benMonth')}</SelectItem>
              <SelectItem value="all">{t('benAll')}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            {t('benExport')}
          </Button>
        </div>

        {/* 3-segment ranking: USD / Token / Ecosystem */}
        <RankingSegmentedTabs
          value={segment}
          onChange={(k) => setSegment(k as SegmentKey)}
          segments={[
            {
              key: 'usd',
              label: 'USD Ranking',
              icon: <DollarSign className="h-4 w-4" />,
              content: (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'donors' | 'recipients')}>
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="donors" className="gap-2">
                      <TrendingUp className="w-4 h-4" />
                      {t('benTopGivers')}
                    </TabsTrigger>
                    <TabsTrigger value="recipients" className="gap-2">
                      <Heart className="w-4 h-4" />
                      {t('benTopReceivers')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="donors">
                    <UsdRankingList
                      rows={donorRows}
                      isLoading={isDonorsLoading}
                      emptyIcon={<Gift className="w-12 h-12" />}
                      emptyText={t('benEmptyGift')}
                      onRowClick={(id) => navigate(`/profile/${id}`)}
                    />
                  </TabsContent>

                  <TabsContent value="recipients">
                    <UsdRankingList
                      rows={recipientRows}
                      isLoading={isRecipientsLoading}
                      emptyIcon={<Heart className="w-12 h-12" />}
                      emptyText={t('benEmptyReceive')}
                      onRowClick={(id) => navigate(`/profile/${id}`)}
                    />
                  </TabsContent>

                </Tabs>
              ),
            },
            {
              key: 'token',
              label: 'Token Ranking',
              icon: <Coins className="h-4 w-4" />,
              content: (
                <BenefactorTokenRankingSection
                  availableSymbols={Object.entries(globalStats?.totalsByToken || {})
                    .sort((a, b) => Number(b[1]?.usd || 0) - Number(a[1]?.usd || 0))
                    .map(([s]) => s)}
                  selectedSymbol={tokenSymbol}
                  onSelectSymbol={setTokenSymbol}
                  timeRange={timeRange}
                />
              ),
            },
            {
              key: 'ecosystem',
              label: 'Ecosystem',
              icon: <Sparkles className="h-4 w-4" />,
              content: <ContributionDimensionsPanel timeRange={timeRange} />,
            },
          ] satisfies RankingSegment[]}
        />
      </main>
      <MobileBottomNav />
      <ExportCsvDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        activeTab={activeTab as 'donors' | 'recipients'}
        activeSegment={segment}
        usdTokens={Object.keys(globalStats?.totalsByToken || {})}
        currentTokenSymbol={tokenSymbol}
        currentTimeRange={timeRange}
      />

    </div>
  );
};

export default Benefactors;
