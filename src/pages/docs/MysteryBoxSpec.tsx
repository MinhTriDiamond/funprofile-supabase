import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/i18n/LanguageContext';

export default function MysteryBoxDocs() {
  const { t } = useLanguage();
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">{t('mbxTitle')}</h1>
        <p className="text-muted-foreground">
          {t('mbxIntro')}
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>{t('mbxTiersTitle')}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li><Badge>{t('mbxTierCommon')}</Badge>{t('mbxTierCommonDesc')}</li>
            <li><Badge>{t('mbxTierRare')}</Badge>{t('mbxTierRareDesc')}</li>
            <li><Badge>{t('mbxTierEpic')}</Badge>{t('mbxTierEpicDesc')}</li>
            <li><Badge>{t('mbxTierLegendary')}</Badge>{t('mbxTierLegendaryDesc')}</li>
            <li><Badge>{t('mbxTierCosmic')}</Badge>{t('mbxTierCosmicDesc')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('mbxMechTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><b>RNG:</b>{t('mbxRngA')}<code>gen_random_uuid()</code>{t('mbxRngB')}</p>
          <p><b>Pity:</b>{t('mbxPity')}</p>
          <p><b>TTL:</b>{t('mbxTtlA')}<b>{t('mbxTtlDays')}</b>{t('mbxTtlB')}<code>mystery_box_expiring</code>{t('mbxTtlC')}<code>mystery_box_expired</code>.</p>
          <p><b>Rate limit:</b>{t('mbxRate')}</p>
          <p><b>T0 gate:</b>{t('mbxT0A')}&lt; 0.60{t('mbxT0Mid')}<code>locked</code>{t('mbxT0B')}</p>
          <p><b>Cap LS:</b>{t('mbxCapA')}<b>{t('mbxCapBold')}</b>{t('mbxCapB')}<code>MYSTERY_BOX_REWARD</code>{t('mbxCapC')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('mbxTriggersTitle')}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm border-collapse">
            <thead className="text-left">
              <tr className="border-b"><th className="py-2">Source</th><th>{t('mbxColDefaultBox')}</th><th>{t('mbxColCondition')}</th></tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="py-2"><code>daily_login</code></td><td>common_box</td><td>{t('mbxCond1')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>quest_complete</code></td><td>common_box</td><td>{t('mbxCond2')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>streak_7d</code></td><td>rare_box</td><td>{t('mbxCond3')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>streak_30d</code></td><td>epic_box</td><td>{t('mbxCond4')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>gift_sent</code></td><td>common_box</td><td>{t('mbxCond5')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>invite_t1</code></td><td>epic_box</td><td>{t('mbxCond6')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>premium_purchase</code></td><td>legendary_box</td><td>{t('mbxCond7')}</td></tr>
              <tr className="border-b"><td className="py-2"><code>event_manual</code></td><td>cosmic_box</td><td>{t('mbxCond8')}</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Apply reward</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><b>type=ls:</b>{t('mbxApply1A')}<code>light_actions</code>{t('mbxApply1B')}<code>MYSTERY_BOX_REWARD</code>{t('mbxApply1C')}</p>
          <p><b>type=camly:</b>{t('mbxApply2A')}<code>pplp_v2_balance_ledger</code>{t('mbxApply2B')}<code>mystery_box_reward</code>{t('mbxApply2C')}</p>
          <p><b>type=pet_xp / pet_skin / cosmetic / sbt_trigger / box_upgrade:</b>{t('mbxApply3')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Anti-abuse</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>Rate limit 10 box/user/UTC day (RPC enforce).</li>
            <li>{t('mbxAbuse2A')}<code>(user_id, source_event, source_ref_id)</code>.</li>
            <li>{t('mbxAbuse3A')}<code>risk_flag</code>{t('mbxAbuse3B')}</li>
            <li>{t('mbxAbuse4A')}<code>mystery_box_grant_audit</code>{t('mbxAbuse4B')}</li>
            <li>{t('mbxAbuse5A')}<code>locked</code>{t('mbxAbuse5B')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
