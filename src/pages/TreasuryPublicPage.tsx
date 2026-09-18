import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Vault, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import TreasuryPublicHistory from '@/components/treasury/TreasuryPublicHistory';
import { useTreasuryPublicInflows } from '@/hooks/useTreasuryPublicInflows';
import { toast } from 'sonner';

const TREASURY_ADDRESS = '0x032269c811a2E58683Df9514D3bF6Ce70d1D09bB';
const TREASURY_BTC_ADDRESS = 'bc1q05nm7esjp4d96jyaypgc4499lfnclf2g4f787n';

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');

export default function TreasuryPublicPage() {
  const [copied, setCopied] = useState(false);
  const { data } = useTreasuryPublicInflows(500);

  const stats = useMemo(() => {
    const rows = data || [];
    const now = Date.now();
    const d7 = now - 7 * 24 * 3600 * 1000;
    const d30 = now - 30 * 24 * 3600 * 1000;
    let s7 = 0, s30 = 0, sAll = 0;
    rows.forEach((r) => {
      const t = new Date(r.confirmed_at).getTime();
      sAll += r.price_camly;
      if (t >= d30) s30 += r.price_camly;
      if (t >= d7) s7 += r.price_camly;
    });
    return { s7, s30, sAll, count: rows.length };
  }, [data]);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(TREASURY_ADDRESS);
      setCopied(true);
      toast.success('Đã chép địa chỉ ví Treasury');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Không chép được');
    }
  };

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-5xl mx-auto px-4 py-4 pb-32 space-y-5">
          <BackToHomeBar />

          <header className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Vault className="w-7 h-7 text-primary" />
              Ví Treasury công khai
            </h1>
            <p className="text-sm text-muted-foreground">
              CAMLY thu được từ Cửa hàng Lumi và Hộp bí ẩn đều chảy về một ví Treasury chung.
              Trang này hiển thị toàn bộ giao dịch để cộng đồng cùng kiểm chứng.
            </p>
          </header>

          <Card className="bg-gradient-to-br from-primary/5 to-amber-50/30 border-primary/20">
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                  BNB (BSC)
                </span>
                <code className="font-mono text-xs sm:text-sm break-all flex-1">{TREASURY_ADDRESS}</code>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={copyAddr}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Đã chép' : 'Chép'}
                  </button>
                  <a
                    href={`https://bscscan.com/address/${TREASURY_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    BscScan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-3 border-t border-primary/10">
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                  Bitcoin
                </span>
                <code className="font-mono text-xs sm:text-sm break-all flex-1">{TREASURY_BTC_ADDRESS}</code>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`https://mempool.space/address/${TREASURY_BTC_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Mempool <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">CAMLY thu trong 7 ngày</div>
                <div className="text-2xl font-bold mt-1">{fmt(stats.s7)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">CAMLY thu trong 30 ngày</div>
                <div className="text-2xl font-bold mt-1">{fmt(stats.s30)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">
                  Tổng (hiển thị {stats.count.toLocaleString('vi-VN')} đơn gần nhất)
                </div>
                <div className="text-2xl font-bold mt-1">{fmt(stats.sAll)}</div>
              </CardContent>
            </Card>
          </div>

          <TreasuryPublicHistory />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
