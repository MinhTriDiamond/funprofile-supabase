import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sliders, Save, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLightScoreParams } from '@/hooks/useLightScoreParams';
import { useQueryClient } from '@tanstack/react-query';
import { displayLS } from '@/lib/lightScoreGates';

export function LightScoreParameterPanel() {
  const { data: params, isLoading, refetch } = useLightScoreParams();
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const saveRow = async (table: string, id: string, patch: Record<string, any>, before?: any) => {
    setSavingId(id);
    try {
      const { error } = await (supabase as any).from(table).update(patch).eq('id', id);
      if (error) throw error;
      // Audit log
      await supabase.from('pplp_v25_param_audit_log').insert({
        table_name: table, row_id: id,
        before_data: before ?? null, after_data: patch,
        reason: 'admin_panel_update',
      });
      toast.success('Đã lưu', { description: `${table} cập nhật` });
      await refetch();
      qc.invalidateQueries({ queryKey: ['pplp-v25-params'] });
    } catch (e: any) {
      toast.error('Lỗi lưu', { description: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const togglePhaseActive = async (phaseId: string, phaseName: string) => {
    setSavingId(phaseId);
    try {
      // Tắt tất cả
      await (supabase as any).from('pplp_v25_phase_config').update({ is_active: false }).neq('id', phaseId);
      // Bật phase được chọn
      await (supabase as any).from('pplp_v25_phase_config').update({ is_active: true }).eq('id', phaseId);
      await supabase.from('pplp_v25_param_audit_log').insert({
        table_name: 'pplp_v25_phase_config', row_id: phaseId,
        after_data: { is_active: true, phase_name: phaseName },
        reason: 'admin_set_active_phase',
      });
      toast.success(`Phase ${phaseName} đã được kích hoạt`);
      await refetch();
    } catch (e: any) {
      toast.error('Lỗi đổi phase', { description: e.message });
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading || !params) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </CardContent></Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-violet-500" />
            Light Score Parameter Table v1.0
          </CardTitle>
          <div className="flex items-center gap-2">
            {params.active_phase && (
              <Badge variant="outline" className="capitalize">
                Phase: {params.active_phase.phase_name} (α={params.active_phase.alpha} β={params.active_phase.beta} γ={params.active_phase.gamma})
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="multipliers">Multipliers</TabsTrigger>
            <TabsTrigger value="legacy">Legacy</TabsTrigger>
            <TabsTrigger value="phase">Phase</TabsTrigger>
            <TabsTrigger value="mint">Mint Link</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          {/* EVENTS */}
          <TabsContent value="events" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">14 base values cho VVU = B × Q × TC × IIS × IM × AAF × ERP</p>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-2">
              {params.events.map((ev: any) => (
                <RowEditor
                  key={ev.id} title={ev.event_type} subtitle={ev.description}
                  badge={ev.category}
                  fields={[
                    { key: 'base_min', label: 'Min', value: ev.base_min },
                    { key: 'base_max', label: 'Max', value: ev.base_max },
                    { key: 'base_default', label: 'Default', value: ev.base_default },
                  ]}
                  saving={savingId === ev.id}
                  onSave={(patch) => saveRow('pplp_v25_event_base_values', ev.id, patch, ev)}
                />
              ))}
            </div>
          </TabsContent>

          {/* MULTIPLIERS */}
          <TabsContent value="multipliers" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">11 multipliers — clamp ≤ 5.0 (trigger DB enforce)</p>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-2">
              {params.multipliers.map((m: any) => (
                <RowEditor
                  key={m.id} title={`${m.multiplier_code} · ${m.level_label}`} subtitle={m.condition_description}
                  badge={m.multiplier_group}
                  fields={[
                    { key: 'range_min', label: 'Min', value: m.range_min },
                    { key: 'range_max', label: 'Max', value: m.range_max },
                    { key: 'default_value', label: 'Default', value: m.default_value },
                  ]}
                  saving={savingId === m.id}
                  onSave={(patch) => saveRow('pplp_v25_multiplier_ranges', m.id, patch, m)}
                />
              ))}
            </div>
          </TabsContent>

          {/* LEGACY */}
          <TabsContent value="legacy" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">4 legacy params: PV, AD, LO (formula log(1+days)), PU</p>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-2">
              {params.legacy.map((l: any) => (
                <RowEditor
                  key={l.id} title={`${l.param_code} · ${l.level_label}`} subtitle={l.notes}
                  badge={l.formula ?? undefined}
                  fields={[
                    { key: 'range_min', label: 'Min', value: l.range_min },
                    { key: 'range_max', label: 'Max', value: l.range_max },
                    { key: 'default_value', label: 'Default', value: l.default_value },
                  ]}
                  saving={savingId === l.id}
                  onSave={(patch) => saveRow('pplp_v25_legacy_params', l.id, patch, l)}
                />
              ))}
            </div>
          </TabsContent>

          {/* PHASE */}
          <TabsContent value="phase" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">Switch phase + tuning α/β/γ + activation thresholds</p>
            {params.phases.map((p: any) => (
              <div key={p.id} className={`rounded-lg border p-3 space-y-2 ${p.is_active ? 'border-violet-400 bg-violet-50/40 dark:bg-violet-950/20' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold capitalize flex items-center gap-2">
                      {p.phase_name}
                      {p.is_active && <Badge className="bg-violet-500">Active</Badge>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{p.notes}</p>
                  </div>
                  <Switch checked={p.is_active} onCheckedChange={() => togglePhaseActive(p.id, p.phase_name)} disabled={savingId === p.id} />
                </div>
                <RowEditor
                  title="Weights" subtitle={`TLS = α·PLS + β·NLS + γ·LLS`}
                  fields={[
                    { key: 'alpha', label: 'α', value: p.alpha, step: 0.05 },
                    { key: 'beta', label: 'β', value: p.beta, step: 0.05 },
                    { key: 'gamma', label: 'γ', value: p.gamma, step: 0.05 },
                  ]}
                  saving={savingId === p.id + '-w'}
                  onSave={(patch) => saveRow('pplp_v25_phase_config', p.id, patch, p)}
                  compact
                />
                <RowEditor
                  title="Activation thresholds"
                  fields={[
                    { key: 'threshold_earn_basic', label: 'Basic', value: p.threshold_earn_basic },
                    { key: 'threshold_earn_advanced', label: 'Advanced', value: p.threshold_earn_advanced },
                    { key: 'threshold_referral', label: 'Referral', value: p.threshold_referral },
                    { key: 'threshold_governance', label: 'Vote', value: p.threshold_governance },
                    { key: 'threshold_proposal', label: 'Proposal', value: p.threshold_proposal },
                    { key: 'threshold_validator', label: 'Validator', value: p.threshold_validator },
                    { key: 'min_tc_for_basic', label: 'min TC', value: p.min_tc_for_basic, step: 0.05 },
                  ]}
                  saving={savingId === p.id + '-t'}
                  onSave={(patch) => saveRow('pplp_v25_phase_config', p.id, patch, p)}
                  compact
                />
              </div>
            ))}
          </TabsContent>

          {/* MINT LINK */}
          <TabsContent value="mint" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">Mint = ΔLS × base_rate × TC^tc_w × SI^sta_w (per phase)</p>
            {params.mint_linking.map((ml: any) => (
              <RowEditor
                key={ml.id} title={`Phase ${ml.phase_name}`} subtitle={ml.formula}
                fields={[
                  { key: 'mint_base_rate', label: 'base_rate', value: ml.mint_base_rate, step: 0.05 },
                  { key: 'tc_weight', label: 'tc_weight', value: ml.tc_weight, step: 0.05 },
                  { key: 'stability_weight', label: 'sta_weight', value: ml.stability_weight, step: 0.05 },
                  { key: 'delta_ls_window_days', label: 'window(d)', value: ml.delta_ls_window_days, step: 1 },
                  { key: 'min_tc_to_mint', label: 'min_TC', value: ml.min_tc_to_mint, step: 0.05 },
                  { key: 'max_mint_per_epoch_per_user', label: 'cap', value: ml.max_mint_per_epoch_per_user, step: 50 },
                ]}
                saving={savingId === ml.id}
                onSave={(patch) => saveRow('pplp_v25_mint_linking_config', ml.id, patch, ml)}
              />
            ))}
          </TabsContent>

          {/* PREVIEW */}
          <TabsContent value="preview" className="mt-4">
            <PreviewSimulator />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface FieldDef { key: string; label: string; value: number | string; step?: number }
function RowEditor({
  title, subtitle, badge, fields, saving, onSave, compact,
}: {
  title: string; subtitle?: string; badge?: string;
  fields: FieldDef[]; saving: boolean;
  onSave: (patch: Record<string, any>) => void;
  compact?: boolean;
}) {
  const [vals, setVals] = useState<Record<string, any>>(() =>
    Object.fromEntries(fields.map(f => [f.key, f.value]))
  );
  const dirty = fields.some(f => String(vals[f.key]) !== String(f.value));

  return (
    <div className={`rounded border p-2 ${compact ? 'bg-background/40' : 'bg-card'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {badge && <Badge variant="outline" className="text-[9px]">{badge}</Badge>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-[9px] uppercase text-muted-foreground">{f.label}</label>
            <Input
              type="number" step={f.step ?? 0.1} value={vals[f.key]}
              onChange={(e) => setVals(v => ({ ...v, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
              className="h-7 text-xs"
            />
          </div>
        ))}
        <div className="flex items-end">
          <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(vals)} className="h-7 w-full text-xs">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Lưu</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewSimulator() {
  const [b, setB] = useState(5);
  const [q, setQ] = useState(1.0);
  const [tc, setTc] = useState(1.0);
  const [iis, setIis] = useState(1.0);
  const [im, setIm] = useState(1.0);
  const [aaf, setAaf] = useState(1.0);
  const [erp, setErp] = useState(1.0);
  const [siVal, setSiVal] = useState(1.0);

  const vvu = b * q * tc * iis * im * aaf * erp;
  const display = displayLS(vvu * 10);
  const mint = vvu * Math.pow(tc, 1.0) * Math.pow(siVal, 0.8);

  const fields: { label: string; v: number; setV: (n: number) => void; step?: number }[] = [
    { label: 'B (base)', v: b, setV: setB, step: 0.5 },
    { label: 'Q', v: q, setV: setQ },
    { label: 'TC', v: tc, setV: setTc },
    { label: 'IIS', v: iis, setV: setIis },
    { label: 'IM', v: im, setV: setIm },
    { label: 'AAF', v: aaf, setV: setAaf },
    { label: 'ERP', v: erp, setV: setErp },
    { label: 'SI', v: siVal, setV: setSiVal },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Mô phỏng VVU + DisplayLS + Mint estimate realtime</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {fields.map(f => (
          <div key={f.label}>
            <label className="text-[10px] text-muted-foreground">{f.label}</label>
            <Input type="number" step={f.step ?? 0.1} value={f.v}
              onChange={(e) => f.setV(Number(e.target.value))}
              className="h-8 text-sm" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ResultCard label="VVU" value={vvu.toFixed(3)} />
        <ResultCard label="DisplayLS" value={display.toFixed(2)} />
        <ResultCard label="Mint est." value={mint.toFixed(3)} />
      </div>
      <div className="text-[10px] font-mono text-muted-foreground bg-muted/40 rounded p-2">
        VVU = B × Q × TC × IIS × IM × AAF × ERP<br />
        Display = 100·log(1+RawLS)<br />
        Mint = VVU × TC^1.0 × SI^0.8 (early phase mặc định)
      </div>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 p-3 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-violet-700 dark:text-violet-300">{value}</p>
    </div>
  );
}
