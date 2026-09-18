import { ShieldCheck, FlaskConical, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  verified?: boolean;
  isTest?: boolean;
  level?: string | null;
  docMismatch?: boolean;
  compact?: boolean;
}

/**
 * Badge KYC public (Phase B Hardening). KHÔNG ảnh hưởng Trust Tier / DID / SBT.
 * - Sandbox: nền xám, "KYC Sandbox" — chỉ kiểm thử kỹ thuật.
 * - Production: nền xanh emerald, "KYC Verified".
 * - Doc mismatch: thêm cảnh báo cờ đỏ kề bên.
 */
export function KycVerifiedBadge({ verified, isTest, level, docMismatch, compact }: Props) {
  if (!verified) return null;

  const isSandbox = !!isTest;
  const label = isSandbox ? 'KYC Sandbox' : 'KYC Verified';
  const Icon = isSandbox ? FlaskConical : ShieldCheck;

  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`gap-1 ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} ${
                isSandbox
                  ? 'border-muted-foreground/30 text-muted-foreground bg-muted/40'
                  : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
              }`}
            >
              <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground mt-1">
              {isSandbox
                ? 'Chỉ kiểm thử kỹ thuật trên môi trường Sumsub Sandbox. Không có giá trị xác minh danh tính thật và không ảnh hưởng Trust/Tier/SBT.'
                : 'Xác minh danh tính đã hoàn tất trên môi trường production.'}
            </p>
            {level && <p className="text-muted-foreground mt-0.5">Level: {level}</p>}
          </TooltipContent>
        </Tooltip>

        {docMismatch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`gap-1 ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10`}
              >
                <AlertTriangle className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                Doc mismatch
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-medium">Cảnh báo: Document mismatch</p>
              <p className="text-muted-foreground mt-1">
                Loại giấy tờ / quốc gia user chọn không khớp với giấy tờ thực tế được Sumsub xác minh. Không nâng Trust.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
