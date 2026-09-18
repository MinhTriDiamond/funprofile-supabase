import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface Props {
  vs?: number; bs?: number; ss?: number; os?: number; hs?: number; rf?: number; tc?: number;
}

const ROWS = [
  {
    key: 'vs', label: 'Verification Strength', weight: 0.30, color: 'bg-emerald-500',
    explain: 'Đo bởi số liên kết identity đã verify (email, ví, social, device).',
    howTo: 'Tăng bằng: liên kết & xác minh ví, thêm email backup, link tài khoản social.',
  },
  {
    key: 'bs', label: 'Behavior Stability', weight: 0.25, color: 'bg-sky-500',
    explain: 'Mức độ ổn định hành vi (Stability Index nội bộ).',
    howTo: 'Tăng bằng: hoạt động đều đặn mỗi ngày, tránh spike bất thường.',
  },
  {
    key: 'ss', label: 'Social Trust', weight: 0.15, color: 'bg-violet-500',
    explain: 'Số attestation nhận được từ guardian / user khác.',
    howTo: 'Tăng bằng: mời ≥2 guardian, được user T2+ tương tác và attest.',
  },
  {
    key: 'os', label: 'On-chain Credibility', weight: 0.20, color: 'bg-amber-500',
    explain: 'Có ví xác minh + tuổi tài khoản (max 1 năm).',
    howTo: 'Tăng bằng: liên kết ví on-chain, duy trì account lâu dài.',
  },
  {
    key: 'hs', label: 'Historical Cleanliness', weight: 0.10, color: 'bg-rose-500',
    explain: 'Lịch sử không bị flag/ban + tuổi account.',
    howTo: 'Tăng bằng: tránh vi phạm, không bị report, giữ profile sạch.',
  },
] as const;

export function TrustEngineBreakdown(props: Props) {
  const values: Record<string, number | undefined> = props as any;
  return (
    <TooltipProvider delayDuration={150}>
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Trust Engine Breakdown
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px]">
                <p className="text-xs">
                  TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Hover từng dòng dưới để xem cách tăng từng thành phần.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {ROWS.map((r) => {
            const v = Number(values[r.key] ?? 0);
            return (
              <div key={r.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1">
                    {r.label} <span className="text-muted-foreground">×{r.weight}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
                          <Info className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px]">
                        <p className="text-xs font-semibold mb-1">{r.label}</p>
                        <p className="text-[11px]">{r.explain}</p>
                        <p className="text-[11px] text-emerald-500 mt-1">
                          <strong>Cách tăng:</strong> {r.howTo}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="font-mono">{v.toFixed(2)}</span>
                </div>
                <Progress value={v * 100} className="h-1.5" />
              </div>
            );
          })}
          <div className="pt-2 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Risk Factor
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px]">
                  <p className="text-xs font-semibold mb-1">Risk Factor (RF)</p>
                  <p className="text-[11px]">
                    Hệ số nhân toàn cục. RF=1.0 nếu device sạch, RF=0.5 nếu device bị flag.
                  </p>
                  <p className="text-[11px] text-emerald-500 mt-1">
                    <strong>Cách tăng:</strong> Dùng device không bị fraud flag, tránh đăng nhập IP rủi ro.
                  </p>
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="font-mono text-sm">×{Number(props.rf ?? 1).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Trust Confidence</span>
            <span className="font-mono text-lg font-bold text-primary">
              {Number(props.tc ?? 0).toFixed(3)}
            </span>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
