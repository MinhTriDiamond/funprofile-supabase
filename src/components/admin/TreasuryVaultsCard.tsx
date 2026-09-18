import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Vault, Gift, Rocket, Wrench, Sprout, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface TreasuryVaultRow {
  id: string;
  vault_name: string;
  balance: number;
  token_symbol: string;
  updated_at?: string | null;
}

interface EpochAllocationRow {
  id: string;
  epoch_month: string | null;
  epoch_date: string | null;
  allocation_breakdown: any;
  mint_pool: number | null;
  soft_ceiling: number | null;
}

const VAULT_META: Record<string, { icon: any; color: string; desc: string; flowKey: string }> = {
  'Reward Reserve Vault': {
    icon: Gift,
    color: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
    desc: 'Dự phòng thưởng (rollover/bonus)',
    flowKey: 'reward_reserve',
  },
  'Strategic Expansion Vault': {
    icon: Rocket,
    color: 'from-purple-500/20 to-purple-500/5 border-purple-500/30',
    desc: 'Đầu tư chiến lược, partnership',
    flowKey: 'strategic_expansion',
  },
  'Infrastructure Vault': {
    icon: Wrench,
    color: 'from-blue-500/20 to-blue-500/5 border-blue-500/30',
    desc: 'Hạ tầng, gas, edge functions',
    flowKey: 'infrastructure',
  },
  'Community Growth Vault': {
    icon: Sprout,
    color: 'from-green-500/20 to-green-500/5 border-green-500/30',
    desc: 'Sự kiện, marketing, growth',
    flowKey: 'community_growth',
  },
  'Stability Vault': {
    icon: ShieldCheck,
    color: 'from-rose-500/20 to-rose-500/5 border-rose-500/30',
    desc: 'Resilience, ổn định kinh tế',
    flowKey: 'stability',
  },
};

const fmtFun = (n: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n));

export function TreasuryVaultsCard() {
  const [vaults, setVaults] = useState<TreasuryVaultRow[]>([]);
  const [epoch, setEpoch] = useState<EpochAllocationRow | null>(null);
  const [epochInflow, setEpochInflow] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Vaults
      const { data: vaultRows } = await supabase
        .from('treasury_vaults')
        .select('id, vault_name, balance, token_symbol, updated_at')
        .order('balance', { ascending: false });

      // Latest "real" monthly epoch (mint_pool >= 1M tránh các epoch test/daily)
      const { data: epochRows } = await supabase
        .from('mint_epochs')
        .select('id, epoch_month, epoch_date, allocation_breakdown, mint_pool, soft_ceiling')
        .gte('mint_pool', 1_000_000)
        .order('epoch_date', { ascending: false })
        .limit(1);

      const ep = epochRows?.[0] as EpochAllocationRow | undefined;

      let inflowMap: Record<string, number> = {};
      if (ep) {
        const { data: flows } = await supabase
          .from('treasury_flows')
          .select('destination_vault, amount')
          .eq('reference_id', ep.id)
          .eq('flow_type', 'epoch_allocation');
        (flows || []).forEach((f: any) => {
          inflowMap[f.destination_vault] = (inflowMap[f.destination_vault] || 0) + Number(f.amount || 0);
        });
      }

      setVaults((vaultRows as TreasuryVaultRow[]) || []);
      setEpoch(ep || null);
      setEpochInflow(inflowMap);
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Realtime: vaults + flows
    const ch = supabase
      .channel('treasury-vaults-card')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'treasury_vaults' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'treasury_flows' }, () => load())
      .subscribe();
    const interval = setInterval(load, 60_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
  }, [load]);

  const funVaults = vaults.filter((v) => (v.token_symbol || 'FUN') === 'FUN');
  const otherVaults = vaults.filter((v) => (v.token_symbol || 'FUN') !== 'FUN');
  const total = funVaults.reduce((s, v) => s + Number(v.balance || 0), 0);
  const softCeiling = Number(epoch?.soft_ceiling || epoch?.mint_pool || 50_000_000);
  const systemShare = softCeiling * 0.30; // 30% hệ thống
  const epochLabel = epoch?.epoch_month || (epoch?.epoch_date ? String(epoch.epoch_date).slice(0, 7) : '—');

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg text-primary">
            <Vault className="w-5 h-5 text-emerald-500" />
            Treasury Vaults — Epoch {epochLabel}
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            {refreshedAt && (
              <span className="text-xs text-muted-foreground">
                Cập nhật {formatDistanceToNow(refreshedAt, { addSuffix: true, locale: vi })}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tổng quan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="text-xs text-muted-foreground">Tổng balance vault FUN</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {fmtFun(total)} <span className="text-sm font-normal">FUN</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">30% hệ thống epoch này</div>
            <div className="text-2xl font-bold">
              {fmtFun(systemShare)} <span className="text-sm font-normal">FUN</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              softCeiling {fmtFun(softCeiling)} × 30%
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Inflow từ epoch {epochLabel}</div>
            <div className="text-2xl font-bold">
              {fmtFun(Object.values(epochInflow).reduce((s, v) => s + v, 0))}{' '}
              <span className="text-sm font-normal">FUN</span>
            </div>
          </div>
        </div>

        {/* 5 Vault */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {funVaults.map((v) => {
            const meta = VAULT_META[v.vault_name] || {
              icon: Vault,
              color: 'from-muted to-muted/50 border-border',
              desc: '',
              flowKey: '',
            };
            const Icon = meta.icon;
            const balance = Number(v.balance || 0);
            const pctSystem = systemShare > 0 ? (balance / systemShare) * 100 : 0;
            const inflow = epochInflow[meta.flowKey] || 0;
            return (
              <div
                key={v.id}
                className={`rounded-lg border bg-gradient-to-br ${meta.color} p-4 space-y-2`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm truncate">{v.vault_name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {pctSystem.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-2xl font-bold">
                  {fmtFun(balance)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">{v.token_symbol || 'FUN'}</span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-1">{meta.desc}</div>
                {inflow > 0 && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    +{fmtFun(inflow)} FUN từ epoch {epochLabel}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Vault token khác (CAMLY...) — ledger riêng, không trộn với FUN */}
        {otherVaults.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="text-sm font-medium text-muted-foreground">Vault token khác</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {otherVaults.map((v) => (
                <div key={v.id} className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Vault className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm truncate">{v.vault_name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{v.token_symbol}</Badge>
                  </div>
                  <div className="text-2xl font-bold">
                    {fmtFun(Number(v.balance || 0))}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{v.token_symbol}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {vaults.length === 0 && !loading && (
          <div className="text-center text-sm text-muted-foreground py-6">
            Chưa có vault nào trong hệ thống.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TreasuryVaultsCard;
