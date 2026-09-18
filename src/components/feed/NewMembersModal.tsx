import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/i18n/LanguageContext';
import { Users, ChevronLeft, ChevronDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getTodayVN } from '@/lib/vnTimezone';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewMembersDateDetail } from './NewMembersDateDetail';
import { NewMembersGlobalSearch } from './NewMembersGlobalSearch';

interface NewMembersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GroupedSignup {
  period_label: string;
  new_users: number;
}

type ViewMode = 'day' | 'week' | 'month';

interface SelectedPeriod {
  startDate: string;
  endDate: string;
  label: string;
  mode: ViewMode;
}

const PAGE_SIZE = 30;

export const NewMembersModal = ({ open, onOpenChange }: NewMembersModalProps) => {
  const { language } = useLanguage();
  const todayVN = getTodayVN();
  const [mode, setMode] = useState<ViewMode>('day');
  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriod | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [globalSearch, setGlobalSearch] = useState('');

  const { data: signups, isLoading } = useQuery({
    queryKey: ['signups-grouped', mode, limit],
    queryFn: async (): Promise<GroupedSignup[]> => {
      const { data, error } = await supabase.rpc('get_signups_grouped_vn', {
        p_mode: mode,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as GroupedSignup[]) || [];
    },
    enabled: open && !selectedPeriod,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch grand total across ALL periods
  const { data: allSignups } = useQuery({
    queryKey: ['signups-grouped-all', mode],
    queryFn: async (): Promise<GroupedSignup[]> => {
      const { data, error } = await supabase.rpc('get_signups_grouped_vn', {
        p_mode: mode,
        p_limit: 100000,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as GroupedSignup[]) || [];
    },
    enabled: open && !selectedPeriod,
    staleTime: 5 * 60 * 1000,
  });

  const formatLabel = (label: string) => {
    const [y, m, d] = label.split('-');
    if (mode === 'month') return `${m}/${y}`;
    if (mode === 'week') return `${language === 'vi' ? 'Tuần' : 'Week'} ${d}/${m}/${y}`;
    return `${d}/${m}/${y}`;
  };

  const grandTotal = allSignups?.reduce((s, r) => s + r.new_users, 0) || 0;
  const hasMore = signups?.length === limit;

  const computeDateRange = (periodLabel: string, currentMode: ViewMode): SelectedPeriod => {
    const [y, m, d] = periodLabel.split('-');
    if (currentMode === 'month') {
      const startDate = periodLabel;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
      return { startDate, endDate, label: `${m}/${y}`, mode: currentMode };
    }
    if (currentMode === 'week') {
      const start = new Date(Number(y), Number(m) - 1, Number(d));
      const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      return { startDate: periodLabel, endDate, label: `${language === 'vi' ? 'Tuần' : 'Week'} ${d}/${m}/${y}`, mode: currentMode };
    }
    return { startDate: periodLabel, endDate: periodLabel, label: `${d}/${m}/${y}`, mode: currentMode };
  };

  const handleRowClick = (row: GroupedSignup) => {
    setSelectedPeriod(computeDateRange(row.period_label, mode));
  };

  const handleBack = () => setSelectedPeriod(null);

  const handleModeChange = (newMode: string) => {
    setMode(newMode as ViewMode);
    setLimit(PAGE_SIZE);
    setSelectedPeriod(null);
  };

  const modeLabels = {
    day: language === 'vi' ? 'Ngày' : 'Day',
    week: language === 'vi' ? 'Tuần' : 'Week',
    month: language === 'vi' ? 'Tháng' : 'Month',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[792px] max-w-[95vw] sm:max-w-[792px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg font-bold text-green-800 dark:text-green-300">
            <Users className="w-5 h-5 text-green-700" />
            {language === 'vi' ? 'Thành viên mới' : 'New Members'}
          </DialogTitle>
        </DialogHeader>

        {selectedPeriod ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-[15px] text-green-800 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200 transition-colors mb-2 self-start"
            >
              <ChevronLeft className="w-4 h-4" />
              {language === 'vi' ? 'Quay lại' : 'Back'}
            </button>
            <NewMembersDateDetail date={selectedPeriod.startDate} endDate={selectedPeriod.endDate} periodLabel={selectedPeriod.label} />
          </div>
        ) : (
          <>
            {/* Global search box: searches across ALL members, not limited by date */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder={language === 'vi' ? 'Tìm bất kỳ thành viên nào theo tên hoặc @username...' : 'Search any member by name or @username...'}
                className="pl-9 pr-9 h-9 text-sm"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {globalSearch.trim().length >= 2 ? (
              <div className="flex-1 overflow-auto rounded-lg border">
                <NewMembersGlobalSearch query={globalSearch} />
              </div>
            ) : (
              <>
                <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
                  <TabsList className="w-full grid grid-cols-3">
                    {(['day', 'week', 'month'] as ViewMode[]).map(m => (
                      <TabsTrigger key={m} value={m} className="text-[15px]">
                        {modeLabels[m]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="flex-1 overflow-auto rounded-lg border">
                  {isLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                    </div>
                  ) : !signups?.length ? (
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
                            {language === 'vi' ? 'Thành viên mới' : 'New Members'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {signups.map((row) => {
                          const isToday = mode === 'day' && row.period_label === todayVN;
                          return (
                            <tr
                              key={row.period_label}
                              onClick={() => handleRowClick(row)}
                              className={`border-t transition-colors cursor-pointer ${isToday ? 'bg-green-500/10 font-semibold' : 'hover:bg-muted/30'}`}
                            >
                              <td className="p-2.5 flex items-center gap-1 text-[15px] text-green-800 dark:text-green-300">
                                {formatLabel(row.period_label)}
                                {isToday && (
                                  <span className="ml-1 text-[11px] uppercase text-green-700 dark:text-green-200 font-bold">
                                    {language === 'vi' ? 'Hôm nay' : 'Today'}
                                  </span>
                                )}
                                <ChevronDown className="w-3.5 h-3.5 text-green-700 dark:text-green-300 ml-auto rotate-[-90deg]" />
                              </td>
                              <td className="p-2.5 text-right tabular-nums font-bold text-[15px] text-green-800 dark:text-green-300">
                                +{row.new_users}
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
                  {language === 'vi' ? 'Tổng' : 'Total'}: <span className="font-bold">{grandTotal}</span>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
