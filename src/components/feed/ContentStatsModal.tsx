import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/i18n/LanguageContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getTodayVN } from '@/lib/vnTimezone';
import { formatNumber } from '@/lib/formatters';
import { LucideIcon, ArrowLeft } from 'lucide-react';
import { ContentStatsDateDetail } from './ContentStatsDateDetail';

import camlyLogo from '@/assets/tokens/camly-logo.webp';

export type ContentStatsType = 'posts' | 'photos' | 'videos' | 'livestreams' | 'rewards';

interface ContentStatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ContentStatsType;
  title: string;
  icon: LucideIcon;
  showCamlyLogo?: boolean;
}

interface StatsRow {
  period: string;
  total: number;
}

type ViewMode = 'day' | 'week' | 'month';
const PAGE_SIZE = 30;

export const ContentStatsModal = ({ open, onOpenChange, type, title, icon: Icon, showCamlyLogo }: ContentStatsModalProps) => {
  const { language } = useLanguage();
  const todayVN = getTodayVN();
  const [mode, setMode] = useState<ViewMode>('day');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['content-stats-grouped', type, mode, limit],
    queryFn: async (): Promise<StatsRow[]> => {
      const { data, error } = await supabase.rpc('get_content_stats_grouped_vn', {
        p_type: type,
        p_mode: mode,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as StatsRow[]) || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch grand total across ALL periods (not just loaded page)
  const { data: allRows } = useQuery({
    queryKey: ['content-stats-grouped-all', type, mode],
    queryFn: async (): Promise<StatsRow[]> => {
      const { data, error } = await supabase.rpc('get_content_stats_grouped_vn', {
        p_type: type,
        p_mode: mode,
        p_limit: 100000,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as StatsRow[]) || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const formatLabel = (label: string) => {
    const [y, m, d] = label.split('-');
    if (mode === 'month') return `${m}/${y}`;
    if (mode === 'week') {
      const start = new Date(Number(y), Number(m) - 1, Number(d));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const endD = String(end.getDate()).padStart(2, '0');
      const endM = String(end.getMonth() + 1).padStart(2, '0');
      const endY = end.getFullYear();
      return `${d}/${m} → ${endD}/${endM}/${endY}`;
    }
    return `${d}/${m}/${y}`;
  };

  const grandTotal = allRows?.reduce((s, r) => s + r.total, 0) || 0;
  const hasMore = rows?.length === limit;

  const handleModeChange = (newMode: string) => {
    setMode(newMode as ViewMode);
    setLimit(PAGE_SIZE);
    setSelectedDate(null);
  };

  const modeLabels = {
    day: language === 'vi' ? 'Ngày' : 'Day',
    week: language === 'vi' ? 'Tuần' : 'Week',
    month: language === 'vi' ? 'Tháng' : 'Month',
  };

  const valueLabel = type === 'rewards'
    ? (language === 'vi' ? 'Số lượng' : 'Amount')
    : (language === 'vi' ? 'Số lượng' : 'Count');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[792px] max-w-[95vw] sm:max-w-[792px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg font-bold text-green-800 dark:text-green-300">
            {selectedDate ? (
              <button
                onClick={() => setSelectedDate(null)}
                className="flex items-center gap-1 hover:opacity-70 transition-opacity"
              >
                <ArrowLeft className="w-5 h-5" />
                <Icon className="w-5 h-5 text-green-700" />
                {title}
              </button>
            ) : (
              <>
                <Icon className="w-5 h-5 text-green-700" />
                {title}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {!selectedDate && (
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="w-full grid grid-cols-3">
              {(['day', 'week', 'month'] as ViewMode[]).map(m => (
                <TabsTrigger key={m} value={m} className="text-[15px]">
                  {modeLabels[m]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {selectedDate ? (
          <ContentStatsDateDetail
            date={selectedDate}
            mode={mode}
            type={type}
            showCamlyLogo={showCamlyLogo}
          />
        ) : (
          <>
            <div className="flex-1 overflow-auto rounded-lg border">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : !rows?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  {language === 'vi' ? 'Chưa có dữ liệu' : 'No data'}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-background sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                    <tr>
                      <th className="text-left p-2.5 font-semibold text-[15px] text-green-800 dark:text-green-300">
                        {modeLabels[mode]}
                      </th>
                      <th className="text-right p-2.5 font-semibold text-[15px] text-green-800 dark:text-green-300">
                        {valueLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isToday = mode === 'day' && row.period === todayVN;
                      return (
                        <tr
                          key={row.period}
                          className={`border-t transition-colors cursor-pointer ${isToday ? 'bg-green-500/10 font-semibold' : 'hover:bg-muted/30'}`}
                          onClick={() => setSelectedDate(row.period)}
                        >
                          <td className="p-2.5 text-[15px] text-green-800 dark:text-green-300">
                            {formatLabel(row.period)}
                            {isToday && (
                              <span className="ml-1 text-[11px] uppercase text-green-700 dark:text-green-200 font-bold">
                                {language === 'vi' ? 'Hôm nay' : 'Today'}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right tabular-nums font-bold text-[15px] text-green-800 dark:text-green-300">
                            <span className="inline-flex items-center gap-1">
                              {type === 'rewards' ? formatNumber(row.total) : `+${row.total}`}
                              {showCamlyLogo && (
                                <img src={camlyLogo} alt="CAMLY" className="w-4 h-4 inline-block" />
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {hasMore && (
              <button
                onClick={() => setLimit(l => l + PAGE_SIZE)}
                className="w-full text-center text-sm text-primary hover:underline py-0.5"
              >
                {language === 'vi' ? 'Xem thêm...' : 'Load more...'}
              </button>
            )}

            <div className="text-center text-[15px] font-semibold text-green-800 dark:text-green-300">
              <span className="inline-flex items-center gap-1">
                {language === 'vi' ? 'Tổng' : 'Total'}: <span className="font-bold">{formatNumber(grandTotal)}</span>
                {showCamlyLogo && (
                  <img src={camlyLogo} alt="CAMLY" className="w-4 h-4 inline-block" />
                )}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
