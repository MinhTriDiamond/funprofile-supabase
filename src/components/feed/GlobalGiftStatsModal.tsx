import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatNumber } from '@/lib/formatters';
import { useTokenPrices } from '@/hooks/useTokenPrices';
import { Gift, HandHeart, Activity } from 'lucide-react';

export type GlobalGiftDirection = 'sent' | 'received';
export type GlobalGiftMode = 'gift' | 'flow';

interface BreakdownRow {
  token_symbol: string | null;
  source: string | null;
  count: number;
  total_amount: number;
  usd_value: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: GlobalGiftDirection;
  totalUsd: number;
  mode?: GlobalGiftMode;
}

function formatCompactUsd(n: number): string {
  if (!n || !isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

const TOKEN_DECIMALS: Record<string, number> = {
  BTC: 8, BTCB: 8, WBTC: 8,
  ETH: 4, WETH: 4, BNB: 4, WBNB: 4,
  USDT: 2, USDC: 2, DAI: 2, BUSD: 2,
  CAMLY: 0, FUN: 0,
  TON: 4, TONCOIN: 4,
  POL: 4, MATIC: 4,
};

function formatAmount(n: number, token?: string): string {
  if (!n) return '0';
  const tok = (token || '').toUpperCase();
  const decimals = TOKEN_DECIMALS[tok] ?? (n >= 1 ? 2 : 6);
  if (decimals === 0) return formatNumber(Math.round(n));
  return formatNumber(n, decimals);
}

const SOURCE_LABEL_KEY: Record<string, string> = {
  donations: 'ggsSourceInternalGift',
  donations_internal: 'ggsSourceInternalGift',
  donations_external: 'ggsSourceExternalTopup',
  wallet_transfers: 'ggsSourceWalletTransfer',
};

export const GlobalGiftStatsModal = memo(({ open, onOpenChange, direction, totalUsd, mode = 'gift' }: Props) => {
  const { t } = useLanguage();
  const sourceLabel = (source: string) =>
    SOURCE_LABEL_KEY[source] ? t(SOURCE_LABEL_KEY[source] as any) : source === 'swaps' ? 'Swap' : source;
  const { data: prices } = useTokenPrices();

  const priceMap = (() => {
    const src = prices || {};
    const out: Record<string, number> = {};
    for (const [sym, v] of Object.entries(src)) {
      if (v && typeof v.usd === 'number') out[sym] = v.usd;
    }
    if (out.BTC && !out.BTCB) out.BTCB = out.BTC;
    if (out.BTC && !out.WBTC) out.WBTC = out.BTC;
    if (out.BNB && !out.WBNB) out.WBNB = out.BNB;
    if (out.ETH && !out.WETH) out.WETH = out.ETH;
    if (out.TON && !out.TONCOIN) out.TONCOIN = out.TON;
    if (out.TONCOIN && !out.TON) out.TON = out.TONCOIN;
    return out;
  })();
  const priceKey = JSON.stringify(priceMap);
  const pricesUnavailable = Object.keys(priceMap).length === 0;

  const rpcName = mode === 'flow' ? 'get_global_wallet_flow_breakdown' : 'get_global_gift_breakdown';

  const { data: rows, isLoading } = useQuery({
    queryKey: [rpcName, direction, priceKey],
    queryFn: async (): Promise<BreakdownRow[]> => {
      const { data, error } = await supabase.rpc(rpcName as any, { p_direction: direction, p_prices: priceMap });
      if (error) throw error;
      return ((data as unknown) as BreakdownRow[]) || [];
    },
    enabled: open && Object.keys(priceMap).length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // gift mode: aggregate per-token. flow mode: keep (token, source) rows.
  const aggregated = (() => {
    if (!rows) return [] as Array<{ token: string; source?: string; count: number; amount: number; usd: number }>;
    if (mode === 'flow') {
      return rows.map(r => ({
        token: r.token_symbol || 'UNKNOWN',
        source: r.source || '—',
        count: Number(r.count) || 0,
        amount: Number(r.total_amount) || 0,
        usd: Number(r.usd_value) || 0,
      })).sort((a, b) => b.usd - a.usd || b.count - a.count);
    }
    const map = new Map<string, { token: string; count: number; amount: number; usd: number }>();
    for (const r of rows) {
      const tok = r.token_symbol || 'UNKNOWN';
      const cur = map.get(tok) || { token: tok, count: 0, amount: 0, usd: 0 };
      cur.count += Number(r.count) || 0;
      cur.amount += Number(r.total_amount) || 0;
      cur.usd += Number(r.usd_value) || 0;
      map.set(tok, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.usd - a.usd || b.count - a.count);
  })();

  // Total for flow mode = sum usd from rows (totalUsd prop chỉ chuẩn cho gift mode)
  const displayTotal = mode === 'flow' ? aggregated.reduce((s, r) => s + r.usd, 0) : totalUsd;

  const Icon = mode === 'flow' ? Activity : (direction === 'sent' ? Gift : HandHeart);
  const title = mode === 'flow'
    ? t('globalWalletFlowTitle')
    : (direction === 'sent' ? t('globalGiftSentTitle') : t('globalGiftReceivedTitle'));
  const disclaimer = mode === 'flow' ? t('globalWalletFlowDisclaimer') : t('globalGiftDisclaimer');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{disclaimer}</DialogDescription>
        </DialogHeader>

        <div className="text-center py-4 border-y">
          <div className="text-4xl font-extrabold text-primary tabular-nums">
            {pricesUnavailable ? (
              <span
                className="text-base font-semibold text-muted-foreground"
                title={t('ggsNoPriceTitle')}
              >
                {t('ggsNoPrice')}
              </span>
            ) : (
              formatCompactUsd(displayTotal)
            )}
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pricesUnavailable ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              {t('ggsNoPriceNote')}
            </p>
          ) : aggregated.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">—</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2">{t('globalGiftBreakdownToken')}</th>
                  {mode === 'flow' && (
                    <th className="text-left py-2">{t('globalGiftBreakdownSource')}</th>
                  )}
                  <th className="text-right py-2">{t('globalGiftBreakdownCount')}</th>
                  <th className="text-right py-2">{t('globalGiftBreakdownAmount')}</th>
                  <th className="text-right py-2">{t('globalGiftBreakdownUsd')}</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((r, idx) => (
                  <tr key={`${r.token}-${(r as any).source ?? ''}-${idx}`} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{r.token}</td>
                    {mode === 'flow' && (
                      <td className="py-2 text-xs text-muted-foreground">
                        {sourceLabel((r as any).source)}
                      </td>
                    )}
                    <td className="py-2 text-right tabular-nums">{formatNumber(r.count)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{formatAmount(r.amount, r.token)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {r.token === 'FUN' ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-muted-foreground underline decoration-dotted">—</span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[220px]">
                              {t('ggsFunTestnetNote')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        formatCompactUsd(r.usd)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

GlobalGiftStatsModal.displayName = 'GlobalGiftStatsModal';
