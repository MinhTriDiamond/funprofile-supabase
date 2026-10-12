import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fingerprint } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const SECTIONS = [
  { id: 'I', titleKey: 'itlS1Title', bodyKey: 'itlS1Body' },
  { id: 'II', titleKey: 'itlS2Title', bodyKey: 'itlS2Body' },
  { id: 'III', title: 'DID Layer', bodyKey: 'itlS3Body' },
  { id: 'IV', title: 'SBT Layer', bodyKey: 'itlS4Body' },
  { id: 'V', title: 'DIB — Digital Identity Bank', bodyKey: 'itlS5Body' },
  { id: 'VI', title: 'Trust Engine', body: 'Input: identity/behavior/social/on-chain signals. Output: TC, Trust Tier, Risk Scores, Permission Flags.' },
  { id: 'VII', title: 'Trust Confidence Formula', body: 'TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF. Range 0.30–1.50.' },
  { id: 'VIII', title: 'Trust Tier Table', body: 'T0 (0.30–0.59) Unknown · T1 (0.60–0.79) Basic · T2 (0.80–0.99) Verified · T3 (1.00–1.24) Trusted · T4 (1.25–1.50) Core.' },
  { id: 'IX', title: 'Anti-Sybil Logic', bodyKey: 'itlS9Body' },
  { id: 'X', title: 'Recovery & Safety', bodyKey: 'itlS10Body' },
  { id: 'XI', title: 'Activation Matrix', body: 'Basic: L0 + TC 0.3+. Earn basic: L1 + TC 0.8+. Vote: T2/T3 + TC 1.0+. Proposal: T3 + TC 1.1+. SBT issuer: T4 + TC 1.25+.' },
  { id: 'XII', titleKey: 'itlS12Title', bodyKey: 'itlS12Body' },
  { id: 'XIII', titleKey: 'itlS13Title', bodyKey: 'itlS13Body' },
];

export default function IdentityTrustLayerDocs() {
  const { t } = useLanguage();
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="text-center space-y-2">
        <Fingerprint className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-3xl font-bold">Identity + Trust Layer Spec v1.0</h1>
        <p className="text-muted-foreground text-sm">{t('itlSubtitle')}</p>
      </div>
      <div className="grid gap-3">
        {SECTIONS.map((s) => (
          <Card key={s.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base"><span className="text-primary mr-2">{s.id}.</span>{s.titleKey ? t(s.titleKey) : s.title}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{s.bodyKey ? t(s.bodyKey) : s.body}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-0 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-6 text-center text-sm italic">
          {t('itlQuote')}
        </CardContent>
      </Card>
    </div>
  );
}
