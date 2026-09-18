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

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const fmtFun = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("vi-VN");

export default function CascadeFormulaDocs() {
  const c = CASCADE_CONFIG;
  useEffect(() => {
    document.title = "Công thức Thác Đổ 3 Tầng | FUN Ecosystem";
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
          <Waves className="w-4 h-4" />
          <span className="text-sm font-semibold">Cascade Distribution End-to-End</span>
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Công thức Thác Đổ 3 Tầng
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Cơ chế phân phối FUN tuần tự qua <strong>3 lớp</strong>: Trần mềm hệ thống →
          Chia bể theo tỉ lệ → Trần cá nhân anti-whale. Phần dư từ tầng trên luôn{" "}
          <em>chảy xuống</em> tầng dưới — không bao giờ bị đốt.
        </p>
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <Badge variant="outline">v1.2 · {Object.keys(c.pools).length} hũ</Badge>
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
            ACTIVE · stage={c.systemStage}
          </Badge>
          <Badge variant="secondary" title="Tự động đồng bộ từ epoch_config khi build">
            🔄 Synced from DB
          </Badge>
        </div>
      </div>

      {/* Sơ đồ tổng quan */}
      <Card className="mb-8 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Sơ đồ thác đổ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">Tầng 1</Badge>
                  <span className="font-bold">Soft Ceiling</span>
                </div>
                <code className="text-sm">finalMint ≤ soft_ceiling</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Trần mềm toàn hệ thống mỗi tháng — Nấc 1: 20M · Nấc 2: 50M · Nấc 3: 100M
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownToLine className="w-6 h-6 text-primary animate-pulse" />
            </div>

            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">Tầng 2</Badge>
                  <span className="font-bold">Pool Split</span>
                </div>
                <code className="text-sm">{fmtPct(c.pools.user)} user · {fmtPct(c.pools.ecosystem)} ecosystem · {fmtPct(c.pools.treasury)} treasury · {fmtPct(c.pools.strategic)} strategic · {fmtPct(c.pools.resilience)} resilience</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Chia finalMint thành <strong>5 hũ</strong> theo tỉ lệ cố định trong DB
                (<code>epoch_config</code>)
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownToLine className="w-6 h-6 text-primary animate-pulse" />
            </div>

            <div className="p-4 rounded-lg bg-card border-2 border-primary/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground">Tầng 3</Badge>
                  <span className="font-bold">Anti-Whale Cap 3%</span>
                </div>
                <code className="text-sm">cap = userRewardPool × {c.maxSharePerUser} → {fmtFun(PER_USER_HARD_CAP)} FUN/user</code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Trần cá nhân — phần dư rollover về treasury/cycle sau
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
            Tầng 1 — Soft Ceiling (Trần mềm hệ thống)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
            <div className="text-primary font-bold">finalMint_month ≤ soft_ceiling</div>
            <Separator className="my-2" />
            <div>where soft_ceiling ∈ {`{`} 20M, 50M, 100M {`}`} (Nấc 1/2/3)</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Nấc</th>
                  <th className="text-right py-2 px-3">Soft Ceiling</th>
                  <th className="text-right py-2 px-3">Điều kiện kích hoạt</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3 font-bold">Nấc 1 (hiện tại)</td>
                  <td className="text-right py-2 px-3">20,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">6 on-chain actions registered</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">Nấc 2</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">Governance vote + adoption KPI</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">Nấc 3</td>
                  <td className="text-right py-2 px-3">100,000,000 FUN</td>
                  <td className="text-right py-2 px-3 text-xs">Mainnet + liquidity ≥ threshold</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Khi <code>totalMintedMonth</code> đạt <code>soft_ceiling</code> → mọi mint
              request mới bị chặn cho tới epoch tháng kế tiếp.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tầng 2 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Tầng 2 — Pool Split (Chia bể theo tỉ lệ)
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
              Tổng = 100% · Nguồn: <code>epoch_config.{`{user|ecosystem|treasury|strategic|resilience}`}_pool_pct</code>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">💎 userRewardPool (70%)</p>
              <p className="text-xs text-muted-foreground">
                Bể chính chia cho user theo tỉ lệ Light Score. Áp cap 3% ở Tầng 3.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🌱 ecosystemPool (12%)</p>
              <p className="text-xs text-muted-foreground">
                Phát triển hệ sinh thái: dev grants, integration, community programs.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🏛️ treasuryPool (10%)</p>
              <p className="text-xs text-muted-foreground">
                Quỹ vận hành: marketing, hạ tầng, chi phí cố định.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🎯 strategicPool (5%)</p>
              <p className="text-xs text-muted-foreground">
                Đối tác chiến lược, liquidity, listing, hợp tác dài hạn.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 sm:col-span-2">
              <p className="font-semibold mb-1">🛡️ resiliencePool (3%)</p>
              <p className="text-xs text-muted-foreground">
                Quỹ phục hồi: dự phòng rủi ro, bug bounty, recovery, nhận rollover từ Tầng 3.
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
            Tầng 3 — Anti-Whale Cap 3% (Trần cá nhân)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
            <div><span className="text-muted-foreground">// Bước 1: tỉ lệ Light Score</span></div>
            <div>raw_share<sub>i</sub> = LS<sub>i</sub> / Σ LS</div>
            <div>raw_alloc<sub>i</sub> = raw_share<sub>i</sub> × userRewardPool</div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Bước 2: áp cap 3%</span></div>
            <div className="text-primary font-bold">cap_amount = userRewardPool × 0.03</div>
            <div className="text-primary font-bold">
              capped_alloc<sub>i</sub> = MIN(raw_alloc<sub>i</sub>, cap_amount)
            </div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Bước 3: rollover</span></div>
            <div>rollover = Σ (raw_alloc<sub>i</sub> − capped_alloc<sub>i</sub>) → resiliencePool</div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm">
            <p className="flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>
                Cap áp dụng <strong>sau</strong> tỉ lệ LS, <strong>trước</strong> tách
                instant 15% / locked 85%. Phần dư <strong>không bao giờ bị đốt</strong>.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ví dụ end-to-end */}
      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle>📊 Ví dụ end-to-end — Nấc 2 (50M)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Tầng</th>
                  <th className="text-left py-2 px-3">Bước</th>
                  <th className="text-right py-2 px-3">Giá trị</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3" rowSpan={2}><Badge>T1</Badge></td>
                  <td className="py-2 px-3">soft_ceiling</td>
                  <td className="text-right py-2 px-3">50,000,000 FUN</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">finalMint (đạt trần)</td>
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
                  <td className="py-2 px-3">rollover ước tính</td>
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
          <CardTitle>📐 Bảng cap/user tự động theo Nấc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Nấc</th>
                  <th className="text-right py-2 px-3">soft_ceiling</th>
                  <th className="text-right py-2 px-3">userRewardPool (70%)</th>
                  <th className="text-right py-2 px-3">cap/user (3%)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">Nấc 1</td>
                  <td className="text-right py-2 px-3">20M</td>
                  <td className="text-right py-2 px-3">14,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">420,000</td>
                </tr>
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="py-2 px-3">Nấc 2</td>
                  <td className="text-right py-2 px-3">50M</td>
                  <td className="text-right py-2 px-3">35,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">1,050,000</td>
                </tr>
                <tr>
                  <td className="py-2 px-3">Nấc 3</td>
                  <td className="text-right py-2 px-3">100M</td>
                  <td className="text-right py-2 px-3">70,000,000</td>
                  <td className="text-right py-2 px-3 text-primary font-bold">2,100,000</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Công thức tổng quát: <code>MAX_MINT_PER_USER_PER_MONTH = soft_ceiling × 0.70 × 0.03 = soft_ceiling × 0.021</code>
          </p>
        </CardContent>
      </Card>

      {/* Cơ chế rollover */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Recycle className="w-5 h-5 text-primary" />
            Cơ chế Rollover — đặc trưng "thác đổ"
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">1️⃣ Vượt cap 3% (T3)</p>
            <p className="text-muted-foreground">→ Phần dư chảy về <code>resiliencePool</code> (3%) hoặc treasury của cycle hiện tại.</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">2️⃣ Pool tháng không dùng hết</p>
            <p className="text-muted-foreground">→ Chuyển sang <code>epoch</code> kế tiếp, không reset về 0.</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-semibold mb-1">3️⃣ Vượt daily cap on-chain (1M/action)</p>
            <p className="text-muted-foreground">→ Mint request chờ ngày hôm sau, giữ nguyên trong queue.</p>
          </div>
        </CardContent>
      </Card>

      {/* Liên kết tài liệu */}
      <Card>
        <CardHeader>
          <CardTitle>📚 Tài liệu liên quan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link to="/docs/anti-whale-cap" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Anti-Whale Cap 3%</span>
            <p className="text-xs text-muted-foreground">Chi tiết Tầng 3, audit columns, override admin.</p>
          </Link>
          <Link to="/docs/token-limits" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Token Limits Realtime</span>
            <p className="text-xs text-muted-foreground">Tầng 1 + per-action daily cap, trạng thái live theo wallet.</p>
          </Link>
          <Link to="/docs/light-score-params" className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition">
            <span className="font-semibold text-primary">→ Light Score Parameters</span>
            <p className="text-xs text-muted-foreground">Công thức tính LS<sub>i</sub> dùng ở Tầng 3.</p>
          </Link>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-8">
        © FUN Ecosystem · Cascade Distribution Formula v1.0
      </p>
    </div>
  );
}
