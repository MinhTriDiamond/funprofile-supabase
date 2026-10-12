import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Waves,
  Layers,
  Coins,
  Shield,
  ArrowDownToLine,
  Calculator,
  Recycle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CASCADE_CONFIG, PER_USER_HARD_CAP } from "@/config/cascade-constants";
import { useLanguage } from "@/i18n/LanguageContext";

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const LOCALES: Record<string, string> = { vi: "vi-VN", en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", th: "th-TH", fr: "fr-FR", id: "id-ID", es: "es-ES", pt: "pt-PT", de: "de-DE", ru: "ru-RU", ar: "ar-EG" };

export default function CascadeFormulaDocs() {
  const { t, language } = useLanguage();
  const loc = LOCALES[language] || "en-US";
  const fmtFun = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString(loc);
  const c = CASCADE_CONFIG;
  useEffect(() => {
    document.title = t("casDocTitle");
  }, [t]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
          <Waves className="w-4 h-4" />
          <span className="text-sm font-semibold">Cascade Distribution End-to-End</span>
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {t("casTitle")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          {t("casIntroA")}<strong>{t("casIntroStrong")}</strong>{t("casIntroB")}{" "}
          <em>{t("casIntroEm")}</em>{t("casIntroC")}
        </p>
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <Badge variant="outline">v1.2 · {Object.keys(c.pools).length}{t("casPoolsSuffix")}</Badge>
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
            ACTIVE · stage={c.systemStage}
          </Badge>
          <Badge variant="secondary" title={t("casSyncedTitle")}>
            🔄 Synced from DB
          </Badge>
        </div>
      </div>

      {/* Sơ đồ tổng quan */}
      <Card className="mb-8 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            {t("casDiagramTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">{t("casTier1")}</Badge>
                  <span className="font-bold">Soft Ceiling</span>
                </div>
                <code className="text-sm">finalMint ≤ soft_ceiling</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("casT1Desc")}
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownToLine className="w-6 h-6 text-primary animate-pulse" />
            </div>

            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">{t("casTier2")}</Badge>
                  <span className="font-bold">Pool Split</span>
                </div>
                <code className="text-sm">{fmtPct(c.pools.user)} user · {fmtPct(c.pools.ecosystem)} ecosystem · {fmtPct(c.pools.treasury)} treasury · {fmtPct(c.pools.strategic)} strategic · {fmtPct(c.pools.resilience)} resilience</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("casT2DescA")}<strong>{t("casT2DescStrong")}</strong>{t("casT2DescB")}<code>epoch_config</code>)
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownToLine className="w-6 h-6 text-primary animate-pulse" />
            </div>

            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">{t("casTier3")}</Badge>
                  <span className="font-bold">Anti-Whale Cap 3%</span>
                </div>
                <code className="text-sm">cap = userRewardPool × {c.maxSharePerUser} → {fmtFun(PER_USER_HARD_CAP)} FUN/user</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("casT3Desc")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tầng 1 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {t("casS1Title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
            <div className="text-primary font-bold">finalMint_month ≤ soft_ceiling</div>
            <Separator className="my-2" />
            <div>where soft_ceiling ∈ {`{`} 20M, 50M, 100M {`}`}{t("casS1Where")}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">{t("casColLevel")}</th>
                  <th className="text-right py-2 px-3">Soft Ceiling</th>
                  <th className="text-right py-2 px-3">{t("casColTrigger")}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3 font-bold">{t("casLvl1")}</td>
                  <td className="text-right py-2 px-3">20,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">6 on-chain actions registered</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">{t("casLvl2")}</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">Governance vote + adoption KPI</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">{t("casLvl3")}</td>
                  <td className="text-right py-2 px-3">100,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">Mainnet + liquidity ≥ threshold</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              {t("casS1AlertA")}<code>totalMintedMonth</code>{t("casS1AlertB")}<code>soft_ceiling</code>{t("casS1AlertC")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tầng 2 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            {t("casS2Title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1">
            <div>userRewardPool   = finalMint × <span className="text-primary font-bold">0.70</span></div>
            <div>ecosystemPool    = finalMint × <span className="text-primary font-bold">0.12</span></div>
            <div>treasuryPool     = finalMint × <span className="text-primary font-bold">0.10</span></div>
            <div>strategicPool    = finalMint × <span className="text-primary font-bold">0.05</span></div>
            <div>resiliencePool   = finalMint × <span className="text-primary font-bold">0.03</span></div>
            <Separator className="my-2" />
            <div className="text-xs text-muted-foreground">
              {t("casS2FormulaNote")}<code>epoch_config.{`{user|ecosystem|treasury|strategic|resilience}`}_pool_pct</code>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">💎 userRewardPool (70%)</p>
              <p className="text-xs text-muted-foreground">
                {t("casPool1")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🌱 ecosystemPool (12%)</p>
              <p className="text-xs text-muted-foreground">
                {t("casPool2")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🏛️ treasuryPool (10%)</p>
              <p className="text-xs text-muted-foreground">
                {t("casPool3")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🎯 strategicPool (5%)</p>
              <p className="text-xs text-muted-foreground">
                {t("casPool4")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 sm:col-span-2">
              <p className="font-semibold mb-1">🛡️ resiliencePool (3%)</p>
              <p className="text-xs text-muted-foreground">
                {t("casPool5")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tầng 3 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            {t("casS3Title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
            <div><span className="text-muted-foreground">{t("casStep1Comment")}</span></div>
            <div>raw_share<sub>i</sub> = LS<sub>i</sub> / Σ LS</div>
            <div>raw_alloc<sub>i</sub> = raw_share<sub>i</sub> × userRewardPool</div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">{t("casStep2Comment")}</span></div>
            <div className="text-primary font-bold">cap_amount = userRewardPool × 0.03</div>
            <div className="text-primary font-bold">
              capped_alloc<sub>i</sub> = MIN(raw_alloc<sub>i</sub>, cap_amount)
            </div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">{t("casStep3Comment")}</span></div>
            <div>rollover = Σ (raw_alloc<sub>i</sub> − capped_alloc<sub>i</sub>) → resiliencePool</div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm">
            <p className="flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>
                {t("awcNoteA")}<strong>{t("awcNoteStrong1")}</strong>{t("casS3NoteB")}<strong>{t("awcNoteStrong2")}</strong>{t("casS3NoteC")}<strong>{t("casS3NoteStrong")}</strong>.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ví dụ end-to-end */}
      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle>{t("casExampleTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">{t("casTierLabel")}</th>
                  <th className="text-left py-2 px-3">{t("sceColStep")}</th>
                  <th className="text-right py-2 px-3">{t("idocColValue")}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3" rowSpan={2}><Badge>T1</Badge></td>
                  <td className="py-2 px-3">soft_ceiling</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">{t("casExFinalMint")}</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                </tr>

                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3" rowSpan={5}><Badge>T2</Badge></td>
                  <td className="py-2 px-3">userRewardPool (70%)</td>
                  <td className="text-right py-2 px-3">35,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">ecosystemPool (12%)</td>
                  <td className="text-right py-2 px-3">6,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">treasuryPool (10%)</td>
                  <td className="text-right py-2 px-3">5,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">strategicPool (5%)</td>
                  <td className="text-right py-2 px-3">2,500,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">resiliencePool (3%)</td>
                  <td className="text-right py-2 px-3">1,500,000 FUN</td>
                </tr>

                <tr className="border-b border-border/50 bg-primary/10">
                  <td className="py-2 px-3" rowSpan={2}><Badge>T3</Badge></td>
                  <td className="py-2 px-3 font-bold">cap/user (3%)</td>
                  <td className="text-right py-2 px-3 font-bold text-primary">1,050,000 FUN</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">{t("casExRollover")}</td>
                  <td className="text-right py-2 px-3 text-emerald-600">~24,450,000 FUN</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bảng cap/user theo từng nấc */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("casCapTableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">{t("casColLevel")}</th>
                  <th className="text-right py-2 px-3">soft_ceiling</th>
                  <th className="text-right py-2 px-3">userRewardPool (70%)</th>
                  <th className="text-right py-2 px-3">cap/user (3%)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">{t("casLvl1Plain")}</td>
                  <td className="text-right py-2 px-3">20M</td>
                  <td className="text-right py-2 px-3">14,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">420,000</td>
                </tr>
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3">{t("casLvl2")}</td>
                  <td className="text-right py-2 px-3">50M</td>
                  <td className="text-right py-2 px-3">35,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">1,050,000</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">{t("casLvl3")}</td>
                  <td className="text-right py-2 px-3">100M</td>
                  <td className="text-right py-2 px-3">70,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">2,100,000</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t("casCapFormulaA")}<code>MAX_MINT_PER_USER_PER_MONTH = soft_ceiling × 0.70 × 0.03 = soft_ceiling × 0.021</code>
          </p>
        </CardContent>
      </Card>

      {/* Cơ chế rollover */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Recycle className="w-5 h-5 text-primary" />
            {t("casRolloverTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">{t("casRoll1Title")}</p>
            <p className="text-muted-foreground">{t("casRoll1")}<code>resiliencePool</code>{t("casRoll1B")}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">{t("casRoll2Title")}</p>
            <p className="text-muted-foreground">{t("casRoll2A")}<code>epoch</code>{t("casRoll2B")}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">{t("casRoll3Title")}</p>
            <p className="text-muted-foreground">{t("casRoll3")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Liên kết tài liệu */}
      <Card>
        <CardHeader>
          <CardTitle>{t("casRelatedTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link to="/docs/anti-whale-cap" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Anti-Whale Cap 3%</span>
            <p className="text-xs text-muted-foreground">{t("casRel1")}</p>
          </Link>
          <Link to="/docs/token-limits" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Token Limits Realtime</span>
            <p className="text-xs text-muted-foreground">{t("casRel2")}</p>
          </Link>
          <Link to="/docs/light-score-params" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Light Score Parameters</span>
            <p className="text-xs text-muted-foreground">{t("casRel3")}</p>
          </Link>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-8">
        © FUN Ecosystem · Cascade Distribution Formula v1.0
      </p>
    </div>
  );
}
