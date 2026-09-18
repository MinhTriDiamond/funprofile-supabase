/**
 * MultiSendModeBanner — Banner hiện ở step Confirm khi gửi nhiều người.
 *
 * - Nếu FunDisperse đã deploy trên chain hiện tại: banner xanh "1 chữ ký cho cả lô".
 * - Nếu chưa deploy: banner amber "ký tuần tự (N lần)".
 */

import { Zap, AlertTriangle } from 'lucide-react';
import { MAX_RECIPIENTS_PER_TX, isDisperseAvailable } from '@/config/disperse';

interface MultiSendModeBannerProps {
  chainId: number;
  recipientCount: number;
  /** Có cần approve token trước không (lần đầu/allowance không đủ). */
  needsApproval?: boolean;
}

export function MultiSendModeBanner({
  chainId,
  recipientCount,
  needsApproval = false,
}: MultiSendModeBannerProps) {
  if (recipientCount <= 1) return null;

  const disperseOn = isDisperseAvailable(chainId);

  if (disperseOn) {
    const batches = Math.ceil(recipientCount / MAX_RECIPIENTS_PER_TX);
    const totalSigs = batches + (needsApproval ? 1 : 0);
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40">
        <Zap className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-xs text-emerald-700 dark:text-emerald-300">
          <p className="font-medium">
            Gửi nhanh: chỉ cần ký <strong>{totalSigs}</strong> lần cho cả{' '}
            <strong>{recipientCount}</strong> ví
          </p>
          <p className="text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
            {needsApproval && <>1 lần cấp quyền token + </>}
            {batches > 1
              ? `${batches} chữ ký disperse (mỗi lô tối đa ${MAX_RECIPIENTS_PER_TX} ví)`
              : '1 chữ ký disperse duy nhất'}{' '}
            qua hợp đồng FunDisperse. Mỗi ví vẫn nhận Transfer event chuẩn.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-xs text-amber-700 dark:text-amber-300">
        <p className="font-medium">
          Đang dùng chế độ ký tuần tự — cần ký <strong>{recipientCount}</strong> lần
        </p>
        <p className="text-amber-700/80 dark:text-amber-300/80 mt-0.5">
          Để bật chế độ "1 chữ ký cho cả lô", contract FunDisperse cần được deploy trên chain này.
        </p>
      </div>
    </div>
  );
}
