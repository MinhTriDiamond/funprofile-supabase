import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift, Heart, ExternalLink, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGiftBreakdown } from '@/hooks/useGiftBreakdown';
import { useLanguage } from '@/i18n/LanguageContext';

interface GiftBreakdownDialogProps {
  userId: string;
  direction: 'sent' | 'received';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatNumber = (n: number, lang: string, max = 4) =>
  n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: max });

const formatUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export const GiftBreakdownDialog = ({ userId, direction, open, onOpenChange }: GiftBreakdownDialogProps) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { data, isLoading } = useGiftBreakdown(userId, direction);

  const title = direction === 'sent' ? t('giftSentTotal') : t('giftReceivedTotal');
  const Icon = direction === 'sent' ? Gift : Heart;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t('giftBreakdownNote')}
          </p>
        </DialogHeader>

        <div className="text-center py-3 border-b">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {language === 'vi' ? 'Tổng giá trị (USD)' : 'Total value (USD)'}
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-32 mx-auto mt-1" />
          ) : (
            <div className="text-3xl font-bold text-primary mt-1">
              {data?.pricesUnavailable ? (
                <span
                  className="text-base font-semibold text-muted-foreground"
                  title={language === 'vi' ? 'Chưa có giá thị trường' : 'No market price available'}
                >
                  {language === 'vi' ? 'Chưa có giá' : 'No price'}
                </span>
              ) : (
                formatUsd(data?.totalUsd || 0)
              )}
            </div>
          )}
          {!isLoading && (
            <>
              <div className="text-xs text-muted-foreground mt-1">
                {data?.totalCount || 0} {language === 'vi' ? 'lệnh' : 'orders'}
              </div>
              {data?.unpricedItems && data.unpricedItems.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  +{' '}
                  {data.unpricedItems
                    .map((i) => `${formatNumber(i.total_amount, language, 0)} ${i.token_symbol}`)
                    .join(' · ')}{' '}
                  <span className="opacity-70">
                    ({language === 'vi' ? 'chưa có giá thị trường' : 'no market price'})
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !data?.items.length && !data?.unpricedItems?.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {language === 'vi' ? 'Chưa có giao dịch nào' : 'No transactions yet'}
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {[...(data?.items || []), ...(data?.unpricedItems || [])].map((item) => {
                const unpriced = !item.usd_value;
                return (
                  <div
                    key={item.token_symbol}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Coins className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{item.token_symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.count} {language === 'vi' ? 'lệnh' : 'orders'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="font-semibold text-sm tabular-nums">
                        {formatNumber(item.total_amount, language)} {item.token_symbol}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {unpriced ? '—' : `≈ ${formatUsd(item.usd_value)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            onOpenChange(false);
            navigate(`/wallet?tab=history&filter=${direction}`);
          }}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          {language === 'vi' ? 'Xem lịch sử đầy đủ' : 'View full history'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
