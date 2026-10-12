import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, TrendingDown, Users, Calculator, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

const USER_POOL = 35_000_000;
const CAP_AMOUNT = 1_050_000;
const ACTIVATION_N = 33; // floor(35M / 1.05M) = 33

const LOCALES: Record<string, string> = { vi: "vi-VN", en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", th: "th-TH", fr: "fr-FR", id: "id-ID", es: "es-ES", pt: "pt-PT", de: "de-DE", ru: "ru-RU", ar: "ar-EG" };

export default function AntiWhaleCapDocs() {
  const { t, language } = useLanguage();
  const loc = LOCALES[language] || "en-US";
  const fmtFun = (n: number) => Math.round(n).toLocaleString(loc);
  useEffect(() => {
    document.title = "Anti-Whale Cap 3% | FUN Ecosystem Mint Policy";
  }, []);

  // Đường cong FUN/user theo N giả định LS đều: min(35M / N, 1.05M)
  const chartData = useMemo(() => {
    const points: { n: number; funPerUser: number; capLine: number }[] = [];
    // Lấy mẫu dày ở vùng N nhỏ (nơi cap kích hoạt), thưa dần ở vùng N lớn
    const samples = [
      ...Array.from({ length: 60 }, (_, i) => i + 1),       // 1..60
      ...Array.from({ length: 14 }, (_, i) => 70 + i * 10), // 70..200
      250, 300, 400, 500, 635, 800, 1000,
    ];
    for (const n of samples) {
      points.push({
        n,
        funPerUser: Math.min(USER_POOL / n, CAP_AMOUNT),
        capLine: CAP_AMOUNT,
      });
    }
    return points;
  }, []);

  const quickRows = [
    { n: 10, statusKey: "awcQr1Status", tone: "destructive" as const, note: "rollover ~24.5M" },
    { n: 33, statusKey: "awcQr2Status", tone: "destructive" as const, noteKey: "awcQr2Note" },
    { n: 34, statusKey: "awcQr3Status", tone: "default" as const, noteKey: "awcQr3Note" },
    { n: 100, statusKey: "awcQr4Status", tone: "secondary" as const, note: "—" },
    { n: 635, statusKey: "awcQr5Status", tone: "secondary" as const, noteKey: "awcQr5Note" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-semibold">{t("awcBadge")}</span>
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Anti-Whale Cap 3%
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("awcIntroA")}<strong>3% userRewardPool</strong>{t("awcIntroB")}
        </p>
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <Badge variant="outline">v1.0 — 30/04/2026</Badge>
          <Badge variant="secondary">{t("awcBadgeApply")}</Badge>
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
            ACTIVE
          </Badge>
        </div>
      </div>

      {/* 1. Định nghĩa */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            {t("conS1Title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">max_share_per_user</code>
              <span className="text-sm">
                {t("awcDef1")}<code>userRewardPool</code>{t("awcDef1B")}
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">userRewardPool</code>
              <span className="text-sm">
                {t("awcDef2A")}<code>finalMint × user_pool_pct</code>{t("awcDef2B")}
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">cap_amount</code>
              <span className="text-sm">
                {t("awcDef3A")}<code>userRewardPool × max_share_per_user</code>.
              </span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              {t("awcDefaultsTitle")}
            </p>
            <code className="text-sm font-mono block">max_share_per_user = 0.03 (3%)</code>
          </div>
        </CardContent>
      </Card>

      {/* 2. Công thức */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-primary" />
            {t("awcS2Title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
            <div><span className="text-muted-foreground">// Step 1:</span>{t("awcStep1B")}</div>
            <div>raw_share<sub>i</sub> = LS<sub>i</sub> / Σ LS</div>
            <div>raw_alloc<sub>i</sub> = raw_share<sub>i</sub> × userRewardPool</div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Step 2:</span>{t("awcStep2B")}</div>
            <div className="text-primary font-bold">
              cap_amount = userRewardPool × 0.03
            </div>
            <div className="text-primary font-bold">
              capped_alloc<sub>i</sub> = MIN(raw_alloc<sub>i</sub>, cap_amount)
            </div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Step 3:</span>{t("awcStep3B")}</div>
            <div>rollover = Σ (raw_alloc<sub>i</sub> − capped_alloc<sub>i</sub>)</div>
            <div className="text-muted-foreground">{t("awcRolloverDest")}</div>
          </div>

          <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <p className="text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                {t("awcNoteA")}<strong>{t("awcNoteStrong1")}</strong>{t("awcNoteB")}<strong>{t("awcNoteStrong2")}</strong>{t("awcNoteC")}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Ví dụ thực tế */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {t("awcS3Title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold">{t("chgColMetric")}</th>
                  <th className="text-right py-2 px-3 font-semibold">{t("idocColValue")}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">finalMint</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">userRewardPool (70%)</td>
                  <td className="text-right py-2 px-3">35,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3 font-bold">cap_amount (3%)</td>
                  <td className="text-right py-2 px-3 font-bold text-primary">1,050,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">{t("awcRowEligible")}</td>
                  <td className="text-right py-2 px-3">635</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">{t("awcRowCapped")}</td>
                  <td className="text-right py-2 px-3">~10–44</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">Rollover → treasury</td>
                  <td className="text-right py-2 px-3 text-emerald-600">~24,450,000 FUN</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
            <strong>{t("awcNote2Strong")}</strong>{t("awcNote2A")}<code>300,000 FUN/user</code>{t("awcNote2B")}
          </div>
        </CardContent>
      </Card>

      {/* 3.5 Ngưỡng kích hoạt cap & biểu đồ FUN/user theo N */}
      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {t("awcS35Title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("awcS35ParaA")}<strong>{t("awcS35Strong1")}</strong>{t("awcS35ParaB")}<strong>{t("awcS35Strong2")}</strong>{t("awcS35ParaC")}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Cột trái: công thức ngưỡng */}
            <div className="space-y-3">
              <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
                <div><span className="text-muted-foreground">{t("awcCommentAbs")}</span></div>
                <div>cap_amount = userRewardPool × 3% = <span className="text-primary font-bold">1,050,000 FUN</span></div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">{t("awcCommentEqual")}</span></div>
                <div>FUN/user = userRewardPool / N = 35,000,000 / N</div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">{t("awcCommentTrigger")}</span></div>
                <div>35,000,000 / N &gt; 1,050,000</div>
                <div className="text-primary font-bold">⇔ N &lt; 33.33</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30">
                  <Badge variant="destructive" className="shrink-0">N ≤ 33</Badge>
                  <span className="text-sm">{t("awcTier1")}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/30">
                  <Badge className="shrink-0">N = 34–100</Badge>
                  <span className="text-sm">{t("awcTier2")}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <Badge variant="secondary" className="shrink-0 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">N ≥ 100</Badge>
                  <span className="text-sm">{t("awcTier3")}</span>
                </div>
              </div>
            </div>

            {/* Cột phải: biểu đồ */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>{t("awcChartTitle")}</span>
                <span>Pool 35M FUN</span>
              </div>
              <div className="w-full h-[280px] bg-muted/20 rounded-lg p-2 border border-border/40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="n"
                      type="number"
                      scale="log"
                      domain={[1, 1000]}
                      ticks={[1, 5, 10, 33, 100, 300, 1000]}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      label={{ value: t("awcAxisN"), position: "insideBottom", offset: -4, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, name: string) => {
                        if (name === "capLine") return [`${fmtFun(v)} FUN`, "Cap 3%"];
                        return [`${fmtFun(v)} FUN/user`, t("awcTooltipEven")];
                      }}
                      labelFormatter={(l) => `N = ${l} user`}
                    />
                    <ReferenceLine
                      x={ACTIVATION_N}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="4 4"
                      label={{ value: "N=33", fontSize: 10, fill: "hsl(var(--primary))", position: "top" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="capLine"
                      stroke="hsl(45 95% 55%)"
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="funPerUser"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-primary inline-block" />{t("awcLegendActual")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block" style={{ background: "hsl(45 95% 55%)" }} />{t("awcLegendCap")}
                </span>
              </div>
            </div>
          </div>

          {/* Bảng nhanh các mốc tham khảo */}
          <div>
            <p className="text-sm font-semibold mb-2">{t("awcQuickTitle")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2 px-3 font-semibold">N</th>
                    <th className="text-right py-2 px-3 font-semibold">{t("awcColFunEven")}</th>
                    <th className="text-left py-2 px-3 font-semibold">{t("awcColStatus")}</th>
                    <th className="text-left py-2 px-3 font-semibold">{t("pmdColNote")}</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {quickRows.map((row) => {
                    const value = Math.min(USER_POOL / row.n, CAP_AMOUNT);
                    const capped = USER_POOL / row.n > CAP_AMOUNT;
                    return (
                      <tr key={row.n} className="border-b border-border/50">
                        <td className="py-2 px-3 font-bold">{row.n}</td>
                        <td className="text-right py-2 px-3">
                          {fmtFun(value)}{capped && <span className="text-amber-600 ml-1">(capped)</span>}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <Badge variant={row.tone}>{t(row.statusKey)}</Badge>
                        </td>
                        <td className="py-2 px-3 font-sans text-muted-foreground">{row.noteKey ? t(row.noteKey) : row.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span>
              <strong>{t("awcConclusionStrong")}</strong>{t("awcConcA")}<strong>N &lt; 34</strong>{t("awcConcB")}<strong>{t("awcConcStrong")}</strong>{t("awcConcC")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 4. Lý do triết học */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("awcS4Title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">{t("awcWhy1Title")}</p>
              <p className="text-muted-foreground">
                {t("awcWhy1A")}<strong>34 user</strong>{t("awcWhy1B")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">{t("awcWhy2Title")}</p>
              <p className="text-muted-foreground">
                {t("awcWhy2")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">{t("awcWhy3Title")}</p>
              <p className="text-muted-foreground">
                {t("awcWhy3")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">💚 Light Economy</p>
              <p className="text-muted-foreground">
                {t("awcWhy4")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Implementation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("awcS5Title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">Edge function</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              supabase/functions/pplp-epoch-snapshot/index.ts
            </code>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("awcImpl2Label")}</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              epoch_config.max_share_per_user
            </code>
            <span className="text-muted-foreground ml-2">(numeric, default 0.03)</span>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("awcImpl3Label")}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><code>allocation_amount</code>{t("awcAudit1")}</li>
              <li><code>allocation_amount_capped</code>{t("awcAudit2")}</li>
              <li><code>reason_codes</code>{t("awcAudit3A")}<code>'capped_at_3pct'</code>{t("awcAudit3B")}</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("awcImpl4Label")}</p>
            <p className="text-muted-foreground">
              {t("awcImpl4A")}<code>cap_amount</code>{t("awcImpl4B")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. Changelog */}
      <Card>
        <CardHeader>
          <CardTitle>{t("awcS6Title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-3">
            <Badge variant="outline" className="whitespace-nowrap">v1.0 · 30/04/2026</Badge>
            <span>{t("awcVer1")}</span>
          </div>
          <div className="flex gap-3">
            <Badge variant="outline" className="whitespace-nowrap">Pre-v1</Badge>
            <span className="text-muted-foreground">{t("awcVer2")}</span>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-8">
        {t("awcFooter")}
      </p>
    </div>
  );
}
