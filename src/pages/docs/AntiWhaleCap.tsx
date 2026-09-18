import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, TrendingDown, Users, Calculator, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
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

const fmtFun = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function AntiWhaleCapDocs() {
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
    { n: 10, status: "Cap kích hoạt", tone: "destructive" as const, note: "rollover ~24.5M" },
    { n: 33, status: "Cap vừa cắn", tone: "destructive" as const, note: "ngưỡng tới hạn" },
    { n: 34, status: "Cap vừa ngủ", tone: "default" as const, note: "phân phối tự nhiên" },
    { n: 100, status: "Pool loãng nhẹ", tone: "secondary" as const, note: "—" },
    { n: 635, status: "T4-2026 thực tế", tone: "secondary" as const, note: "phân phối rộng" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
          <Shield className="w-4 h-4" />
          <span className="text-sm font-semibold">Quy tắc bảo vệ phân phối FUN</span>
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Anti-Whale Cap 3%
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Giới hạn tối đa <strong>3% userRewardPool</strong> cho mỗi user trong mỗi cycle mint —
          ngăn tập trung token, đảm bảo phân phối công bằng cho cộng đồng.
        </p>
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <Badge variant="outline">v1.0 — 30/04/2026</Badge>
          <Badge variant="secondary">Áp dụng từ T4-2026</Badge>
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
            1. Định nghĩa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">max_share_per_user</code>
              <span className="text-sm">
                Tỉ lệ % tối đa mỗi user được nhận trong <code>userRewardPool</code> của một cycle mint.
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">userRewardPool</code>
              <span className="text-sm">
                Phần FUN dành cho user trong cycle = <code>finalMint × user_pool_pct</code> (mặc định 70%).
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <code className="text-primary font-mono font-bold whitespace-nowrap">cap_amount</code>
              <span className="text-sm">
                Trần FUN/user = <code>userRewardPool × max_share_per_user</code>.
              </span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Giá trị mặc định v1.0
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
            2. Công thức áp dụng
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
            <div><span className="text-muted-foreground">// Bước 1:</span> Tính share theo Light Score</div>
            <div>raw_share<sub>i</sub> = LS<sub>i</sub> / Σ LS</div>
            <div>raw_alloc<sub>i</sub> = raw_share<sub>i</sub> × userRewardPool</div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Bước 2:</span> Áp cap 3%</div>
            <div className="text-primary font-bold">
              cap_amount = userRewardPool × 0.03
            </div>
            <div className="text-primary font-bold">
              capped_alloc<sub>i</sub> = MIN(raw_alloc<sub>i</sub>, cap_amount)
            </div>
            <Separator className="my-2" />
            <div><span className="text-muted-foreground">// Bước 3:</span> Phần dư rollover</div>
            <div>rollover = Σ (raw_alloc<sub>i</sub> − capped_alloc<sub>i</sub>)</div>
            <div className="text-muted-foreground">→ chuyển vào treasury_pool hoặc cycle kế tiếp</div>
          </div>

          <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <p className="text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                Cap áp dụng <strong>sau khi</strong> tính tỉ lệ Light Score, <strong>trước khi</strong> tách
                instant 15% / locked 85%. Phần dư không bao giờ bị đốt — luôn rollover.
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
            3. Ví dụ thực tế — T4-2026
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold">Chỉ số</th>
                  <th className="text-right py-2 px-3 font-semibold">Giá trị</th>
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
                  <td className="py-2 px-3">Số user eligible</td>
                  <td className="text-right py-2 px-3">635</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">User bị cap</td>
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
            <strong>Lưu ý T4-2026:</strong> do giai đoạn bootstrap, override thủ công sử dụng
            cap tuyệt đối <code>300,000 FUN/user</code> (≈ 0.86% pool 35M) — chặt chẽ hơn 3% chuẩn,
            phù hợp số user hiện tại.
          </div>
        </CardContent>
      </Card>

      {/* 3.5 Ngưỡng kích hoạt cap & biểu đồ FUN/user theo N */}
      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            3.5. Ngưỡng kích hoạt cap & biểu đồ FUN/user theo N
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Cap 3% là <strong>chống cá voi</strong>, không phải <strong>sàn đảm bảo</strong>.
            Khi tất cả user có Light Score bằng nhau, cap chỉ "cắn" khi cộng đồng còn rất nhỏ.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Cột trái: công thức ngưỡng */}
            <div className="space-y-3">
              <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-2">
                <div><span className="text-muted-foreground">// Trần tuyệt đối</span></div>
                <div>cap_amount = userRewardPool × 3% = <span className="text-primary font-bold">1,050,000 FUN</span></div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">// Khi LS đều</span></div>
                <div>FUN/user = userRewardPool / N = 35,000,000 / N</div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">// Cap kích hoạt khi</span></div>
                <div>35,000,000 / N &gt; 1,050,000</div>
                <div className="text-primary font-bold">⇔ N &lt; 33.33</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30">
                  <Badge variant="destructive" className="shrink-0">N ≤ 33</Badge>
                  <span className="text-sm">Cap hoạt động → rollover về treasury</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/30">
                  <Badge className="shrink-0">N = 34–100</Badge>
                  <span className="text-sm">Cap ngủ → phân phối tự nhiên</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <Badge variant="secondary" className="shrink-0 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">N ≥ 100</Badge>
                  <span className="text-sm">Pool loãng → FUN/user nhỏ dần</span>
                </div>
              </div>
            </div>

            {/* Cột phải: biểu đồ */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>FUN/user theo N (giả định LS đều)</span>
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
                      label={{ value: "Số user (N)", position: "insideBottom", offset: -4, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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
                        return [`${fmtFun(v)} FUN/user`, "Phân phối đều"];
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
                  <span className="w-3 h-0.5 bg-primary inline-block" /> FUN/user thực
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block" style={{ background: "hsl(45 95% 55%)" }} /> Trần cap 1.05M
                </span>
              </div>
            </div>
          </div>

          {/* Bảng nhanh các mốc tham khảo */}
          <div>
            <p className="text-sm font-semibold mb-2">Bảng nhanh các mốc N tham khảo</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2 px-3 font-semibold">N</th>
                    <th className="text-right py-2 px-3 font-semibold">FUN/user (đều)</th>
                    <th className="text-left py-2 px-3 font-semibold">Trạng thái</th>
                    <th className="text-left py-2 px-3 font-semibold">Ghi chú</th>
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
                          <Badge variant={row.tone}>{row.status}</Badge>
                        </td>
                        <td className="py-2 px-3 font-sans text-muted-foreground">{row.note}</td>
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
              <strong>Kết luận:</strong> Khi LS đều, cần <strong>N &lt; 34</strong> mới có ai bị cap.
              Hiện hệ thống có ~635 user (T4-2026), cap chỉ áp dụng cho user có LS <strong>vượt trội ~33×</strong> trung bình —
              đây chính là cơ chế chống cá voi đúng vai trò.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 4. Lý do triết học */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>4. Vì sao 3%?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🛡️ Chống tập trung</p>
              <p className="text-muted-foreground">
                Cần tối thiểu <strong>34 user</strong> để chiếm 100% pool → bất khả thi cho 1 sybil farm.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">⚖️ Vẫn thưởng đóng góp</p>
              <p className="text-muted-foreground">
                User Light Score cao vẫn nhận nhiều nhất — chỉ giới hạn ở mức không phá vỡ cân bằng.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">🌊 Khuyến khích rộng</p>
              <p className="text-muted-foreground">
                Phần dư từ user bị cap được phân lại / rollover → khuếch đại pool cho user vừa & nhỏ.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-semibold mb-1">💚 Light Economy</p>
              <p className="text-muted-foreground">
                Phù hợp triết lý Phụng Sự — không ai một mình thâu tóm dòng chảy ánh sáng.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Implementation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>5. Triển khai kỹ thuật</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">Edge function</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              supabase/functions/pplp-epoch-snapshot/index.ts
            </code>
          </div>
          <div>
            <p className="font-semibold mb-1">Bảng cấu hình</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              epoch_config.max_share_per_user
            </code>
            <span className="text-muted-foreground ml-2">(numeric, default 0.03)</span>
          </div>
          <div>
            <p className="font-semibold mb-1">Cột audit trên mint_allocations</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><code>allocation_amount</code> — số trước cap</li>
              <li><code>allocation_amount_capped</code> — số sau cap (= số thực nhận)</li>
              <li><code>reason_codes</code> — chứa <code>'capped_at_3pct'</code> nếu bị cap</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Override thủ công (admin)</p>
            <p className="text-muted-foreground">
              Có thể override <code>cap_amount</code> tuyệt đối qua Admin Panel cho cycle đặc biệt
              (vd. T4-2026 dùng 300k FUN tuyệt đối thay vì 3%).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. Changelog */}
      <Card>
        <CardHeader>
          <CardTitle>6. Lịch sử phiên bản</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-3">
            <Badge variant="outline" className="whitespace-nowrap">v1.0 · 30/04/2026</Badge>
            <span>Ban hành chính thức quy tắc 3% cap; áp dụng từ epoch T4-2026.</span>
          </div>
          <div className="flex gap-3">
            <Badge variant="outline" className="whitespace-nowrap">Pre-v1</Badge>
            <span className="text-muted-foreground">Cap legacy 150,000 FUN/user (Epoch System v1).</span>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-8">
        © FUN Ecosystem · Anti-Whale Policy · Bản quyền cộng đồng
      </p>
    </div>
  );
}
