import { Card } from "@/components/ui/card";
import { useLanguage } from "@/i18n/LanguageContext";

export default function ConnectorSpecPage() {
  const { t } = useLanguage();
  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold">CONNECTOR — First On-chain Giver</h1>
        <p className="text-muted-foreground italic">
          "Referral is claimed by words. Connector is proven by giving."
        </p>
      </header>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">{t('conS1Title')}</h2>
        <p>
          <b>Connector</b>{t('conDefA')}<b>{t('conDefB')}</b>{t('conDefC')}
        </p>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>{t('conDefItem1A')}<b>{t('conDefItem1B')}</b>{t('conDefItem1C')}</li>
          <li>{t('conDefItem2')}</li>
          <li>{t('conDefItem3A')}<b>{t('conDefItem3B')}</b>{t('conDefItem3C')}</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">{t('conS2Title')}</h2>
        <ul className="grid grid-cols-2 gap-1 text-sm">
          <li>FUN: 9</li>
          <li>USDT: 1</li>
          <li>CAMLY: 1.000</li>
          <li>BNB: 0,001</li>
          <li>BTC: 0,00001</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">{t('conS3Title')}</h2>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>{t('conS3Item1')}<b>+10</b></li>
          <li>{t('conS3Item2')}<b>+2</b></li>
          <li>{t('conS3Item3')}<b>+5</b></li>
          <li>{t('conS3Item4')}<b>+10</b></li>
          <li>{t('conS3Item5')}<b>+20</b></li>
        </ul>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">{t('conS4Title')}</h2>
        <p className="text-sm">
          {t('conS4ParaA')}
          <code className="text-primary mx-1">blockNumber → txIndex → logIndex</code>{t('conS4ParaB')}
        </p>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-lg">5. Anti-sybil</h2>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>{t('conS5Item1')}</li>
          <li>{t('conS5Item2')}</li>
          <li>{t('conS5Item3')}</li>
        </ul>
      </Card>

      <Card className="p-6 space-y-2 text-center italic">
        <p>The first valid on-chain giver becomes the official Connector.</p>
        <p>The act of giving opens the flow.</p>
        <p>The flow is recorded transparently.</p>
        <p>The light is recognized through Light Score.</p>
      </Card>
    </div>
  );
}
