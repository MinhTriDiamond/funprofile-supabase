import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Fingerprint, RefreshCw, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DIDBadge } from '@/components/identity/DIDBadge';
import { TrustTierBadge } from '@/components/identity/TrustTierBadge';
import { SybilRiskIndicator } from '@/components/identity/SybilRiskIndicator';
import { IdentityDisputeAdminTab } from './IdentityDisputeAdminTab';

export function IdentityTrustAdminPanel() {
  const [search, setSearch] = useState('');
  const [recalcAll, setRecalcAll] = useState(false);

  const { data: dids = [], refetch } = useQuery({
    queryKey: ['admin-dids', search],
    queryFn: async () => {
      let q = (supabase as any).from('did_registry')
        .select('did_id, did_level, status, owner_user_id, trust_profile(tc, trust_tier, sybil_risk)')
        .order('created_at', { ascending: false }).limit(50);
      if (search) q = q.ilike('did_id', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [], refetch: refetchRules } = useQuery({
    queryKey: ['admin-sbt-rules'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('sbt_issuance_rules').select('*').order('category');
      return data ?? [];
    },
  });

  const { data: sybilFlags = [] } = useQuery({
    queryKey: ['admin-sybil'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('trust_profile')
        .select('did_id, tc, trust_tier, sybil_risk, fraud_risk')
        .in('sybil_risk', ['high', 'critical']).limit(50);
      return data ?? [];
    },
  });

  const handleRecalcAll = async () => {
    setRecalcAll(true);
    try {
      const { error } = await supabase.functions.invoke('identity-trust-engine', { body: { batch_limit: 200 } });
      if (error) throw error;
      toast.success('Recalc batch hoàn tất');
      await refetch();
    } catch (e: any) {
      toast.error('Lỗi recalc', { description: e.message });
    } finally {
      setRecalcAll(false);
    }
  };

  const updateLevel = async (did_id: string, did_level: string) => {
    const { error } = await (supabase as any).from('did_registry').update({ did_level }).eq('did_id', did_id);
    if (error) toast.error(error.message); else { toast.success('Đã cập nhật DID level'); refetch(); }
  };

  const toggleRule = async (sbt_type: string, is_active: boolean) => {
    const { error } = await (supabase as any).from('sbt_issuance_rules').update({ is_active }).eq('sbt_type', sbt_type);
    if (error) toast.error(error.message); else refetchRules();
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-primary" />
          Identity + Trust Layer v1.0
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="did">
          <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full h-auto">
            <TabsTrigger value="did" className="text-xs">DID Registry</TabsTrigger>
            <TabsTrigger value="trust" className="text-xs">Trust Engine</TabsTrigger>
            <TabsTrigger value="rules" className="text-xs">SBT Rules</TabsTrigger>
            <TabsTrigger value="sybil" className="text-xs">Sybil Audit</TabsTrigger>
            <TabsTrigger value="disputes" className="text-xs">Disputes</TabsTrigger>
          </TabsList>

          <TabsContent value="did" className="mt-4 space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Tìm DID..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-3 h-3" /></Button>
            </div>
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {dids.map((d: any) => (
                <div key={d.did_id} className="rounded border p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate">{d.did_id}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <DIDBadge level={d.did_level} status={d.status} compact />
                      <TrustTierBadge tier={d.trust_profile?.trust_tier} tc={Number(d.trust_profile?.tc ?? 0)} compact />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {['L0', 'L1', 'L2', 'L3', 'L4'].map((lv) => (
                      <Button key={lv} size="sm" variant={d.did_level === lv ? 'default' : 'ghost'}
                        className="h-6 px-1.5 text-[10px]" onClick={() => updateLevel(d.did_id, lv)}>{lv}</Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trust" className="mt-4 space-y-3">
            <Button onClick={handleRecalcAll} disabled={recalcAll} className="w-full sm:w-auto gap-2">
              {recalcAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Recalc batch (200 users)
            </Button>
            <p className="text-xs text-muted-foreground">
              Trust Engine chạy: TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF. Cron hourly khuyến nghị qua pg_cron.
            </p>
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-1.5 max-h-[55vh] overflow-y-auto">
            {rules.map((r: any) => (
              <div key={r.sbt_type} className="rounded border p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{r.display_name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.sbt_type} · {r.category} · {r.mode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">tc +{Number(r.tc_impact).toFixed(2)}</Badge>
                  <Button size="sm" variant={r.is_active ? 'default' : 'outline'}
                    onClick={() => toggleRule(r.sbt_type, !r.is_active)}>
                    {r.is_active ? 'On' : 'Off'}
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="sybil" className="mt-4 space-y-1.5 max-h-[55vh] overflow-y-auto">
            {sybilFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Không có DID nào sybil_risk cao</p>
            ) : sybilFlags.map((s: any) => (
              <div key={s.did_id} className="rounded border border-destructive/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-mono truncate">{s.did_id}</p>
                  <SybilRiskIndicator risk={s.sybil_risk} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">TC {Number(s.tc).toFixed(2)} · {s.trust_tier}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="disputes" className="mt-4">
            <IdentityDisputeAdminTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
