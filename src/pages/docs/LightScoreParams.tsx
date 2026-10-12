import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, ShieldCheck, Vote, Zap, Coins, Activity } from 'lucide-react';
import { useLightScoreParams } from '@/hooks/useLightScoreParams';
import { displayLS } from '@/lib/lightScoreGates';
import { useLanguage } from '@/i18n/LanguageContext';

const LOCALES: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', th: 'th-TH', fr: 'fr-FR', id: 'id-ID', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', ru: 'ru-RU', ar: 'ar-EG' };

export default function LightScoreParamsDocs() {
  const { data, isLoading } = useLightScoreParams();
  const { t, language } = useLanguage();
  const loc = LOCALES[language] || 'en-US';

  useEffect(() => {
    document.title = 'Light Score Parameter Table v1.0 — fun.rich';
    let m = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!m) {
      m = document.createElement('meta');
      m.name = 'description';
      document.head.appendChild(m);
    }
    m.content = t('lspMetaDesc');
  }, [t]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const phase = data.active_phase;
  const displayTable = [10, 50, 100, 500, 1000, 5000, 10000, 100000].map(rls => ({ rls, ds: displayLS(rls) }));

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 space-y-8">
      <header className="text-center space-y-3">
        <Badge className="bg-violet-500">Public Spec · v1.0</Badge>
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
          Light Score Parameter Table
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
          {t('lspIntro')}
        </p>
        {phase && (
          <Badge variant="outline" className="capitalize text-base">
            <Sparkles className="w-4 h-4 mr-1.5" />{t('lspPhaseRunning')}<strong className="ml-1">{phase.phase_name}</strong> · α={phase.alpha} β={phase.beta} γ={phase.gamma}
          </Badge>
        )}
      </header>

      <Section title={t('lspS1Title')} icon={<ShieldCheck className="w-5 h-5" />}>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li>{t('lspS1Item1')}</li>
          <li>{t('lspS1Item2')}</li>
          <li>{t('lspS1Item3')}</li>
          <li>{t('lspS1Item4')}</li>
        </ol>
      </Section>

      <Section title="II. 14 Event Base Values (B_e)" icon={<Zap className="w-5 h-5" />}>
        <DataTable
          head={['Event', t('pdocColDesc'), 'Min', 'Max', 'Default', 'Category']}
          rows={data.events.map((e: any) => [e.event_type, e.description, e.base_min, e.base_max, e.base_default, e.category])}
        />
      </Section>

      <Section title="III. 11 Multipliers" icon={<Activity className="w-5 h-5" />}>
        <DataTable
          head={['Code', 'Group', 'Level', 'Min', 'Max', 'Default', t('lspColCondition')]}
          rows={data.multipliers.map((m: any) => [m.multiplier_code, m.multiplier_group, m.level_label, m.range_min, m.range_max, m.default_value, m.condition_description])}
        />
        <p className="text-xs text-muted-foreground mt-2">⚠️ Trigger DB enforce: range_max ≤ 5.0.</p>
      </Section>

      <Section title="IV. 4 Legacy Params (PV / AD / LO / PU)" icon={<Sparkles className="w-5 h-5" />}>
        <DataTable
          head={['Code', 'Level', 'Min', 'Max', 'Default', 'Formula', 'Notes']}
          rows={data.legacy.map((l: any) => [l.param_code, l.level_label, l.range_min, l.range_max, l.default_value, l.formula ?? '—', l.notes])}
        />
      </Section>

      <Section title="V. Phase Config (3 phases + α/β/γ)" icon={<Vote className="w-5 h-5" />}>
        <DataTable
          head={['Phase', 'α', 'β', 'γ', 'Active', 'Notes']}
          rows={data.phases.map((p: any) => [p.phase_name, p.alpha, p.beta, p.gamma, p.is_active ? '✅' : '—', p.notes])}
        />
        <p className="text-xs text-muted-foreground mt-2">TLS = α·PLS + β·NLS + γ·LLS</p>
      </Section>

      <Section title="VIII. Display Normalization" icon={<Activity className="w-5 h-5" />}>
        <p className="text-sm mb-3 font-mono bg-muted/40 rounded p-2 inline-block">
          DisplayLS = 100 × log(1 + RawLS)
        </p>
        <DataTable head={['RawLS', 'DisplayLS']} rows={displayTable.map(r => [r.rls, r.ds.toFixed(2)])} />
      </Section>

      {phase && (
        <Section title="IX. Activation Thresholds" icon={<Vote className="w-5 h-5" />}>
          <DataTable
            head={[t('lspColFeature'), t('lspColLsReq'), t('lspColOtherReq')]}
            rows={[
              ['Earn basic LS', phase.threshold_earn_basic, `TC ≥ ${phase.min_tc_for_basic}`],
              ['Earn advanced', phase.threshold_earn_advanced, '—'],
              ['Referral rewards', phase.threshold_referral, '—'],
              ['Governance vote', phase.threshold_governance, '—'],
              ['Proposal submit', phase.threshold_proposal, '—'],
              ['Validator/curator', phase.threshold_validator, '—'],
            ]}
          />
        </Section>
      )}

      <Section title="X. Mint Linking Config" icon={<Coins className="w-5 h-5" />}>
        <p className="text-sm mb-3 font-mono bg-muted/40 rounded p-2 inline-block">
          Mint = ΔLS × base_rate × TC^tc_w × SI^sta_w
        </p>
        <DataTable
          head={['Phase', 'base_rate', 'tc_w', 'sta_w', 'Window(d)', 'min TC', 'Cap/epoch']}
          rows={data.mint_linking.map((m: any) => [m.phase_name, m.mint_base_rate, m.tc_weight, m.stability_weight, m.delta_ls_window_days, m.min_tc_to_mint, m.max_mint_per_epoch_per_user])}
        />
        <p className="text-xs text-muted-foreground mt-2">
          <strong>{t('lspS10NoteStrong')}</strong>{t('lspS10Note')}<em>{t('lspS10NoteEm')}</em>{t('lspS10NoteB')}
        </p>
      </Section>

      <Section title={t('lspS11Title')} icon={<Sparkles className="w-5 h-5" />}>
        <blockquote className="border-l-4 border-violet-400 pl-4 italic text-sm text-muted-foreground">
          {t('lspQuote')}
        </blockquote>
      </Section>

      <footer className="text-center text-xs text-muted-foreground pt-4 border-t">
        {t('lspUpdatedAt')}{new Date(data.fetched_at).toLocaleString(loc)}
      </footer>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DataTable({ head, rows }: { head: (string | number)[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            {head.map((h, i) => <th key={i} className="text-left py-2 px-2 font-semibold uppercase text-[10px] text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {r.map((c, j) => <td key={j} className="py-1.5 px-2">{c ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
