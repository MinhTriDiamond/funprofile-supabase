/**
 * MintBlockedAlert — Hiển thị lý do mint bị chặn + hướng dẫn retry.
 *
 * 3 loại blocker:
 * - PENDING_REQUEST   : Đang có 1 lệnh chờ ký (409 từ pplp-mint-fun)
 * - SOFT_CEILING      : Allocation bị cắt do trần tháng 20M FUN
 * - NO_PUBLIC_WALLET  : Chưa cài địa chỉ ví công khai
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Wallet, Gauge, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type MintBlockReason =
  | 'PENDING_REQUEST'
  | 'SOFT_CEILING'
  | 'NO_PUBLIC_WALLET'
  | 'GENERIC';

interface MintBlockedAlertProps {
  reason: MintBlockReason;
  /** Message gốc từ server (nếu có) */
  message?: string;
  /** Cho PENDING_REQUEST */
  existingRequestId?: string;
  /** Cho SOFT_CEILING */
  rawAmount?: number;
  cappedAmount?: number;
  softCeiling?: number;
  /** Action retry tuỳ ý */
  onRetry?: () => void;
}

const REASON_META: Record<
  MintBlockReason,
  { icon: typeof AlertTriangle; title: string; tone: string }
> = {
  PENDING_REQUEST: { icon: Clock, title: 'Đang có lệnh mint chờ ký', tone: 'border-amber-500/50 bg-amber-500/10' },
  SOFT_CEILING: { icon: Gauge, title: 'Đã chạm trần phát hành tháng', tone: 'border-blue-500/50 bg-blue-500/10' },
  NO_PUBLIC_WALLET: { icon: Wallet, title: 'Chưa có ví công khai', tone: 'border-rose-500/50 bg-rose-500/10' },
  GENERIC: { icon: AlertTriangle, title: 'Không thể tạo lệnh mint', tone: 'border-destructive/50 bg-destructive/10' },
};

export function MintBlockedAlert({
  reason,
  message,
  existingRequestId,
  rawAmount,
  cappedAmount,
  softCeiling,
  onRetry,
}: MintBlockedAlertProps) {
  const navigate = useNavigate();
  const meta = REASON_META[reason];
  const Icon = meta.icon;

  const renderBody = () => {
    switch (reason) {
      case 'PENDING_REQUEST':
        return (
          <>
            <p>
              Bạn đã có <strong>1 lệnh mint đang chờ Admin ký duyệt</strong>. Hệ
              thống chỉ cho phép tối đa 1 lệnh active mỗi lúc để tránh trùng nonce.
            </p>
            <p className="mt-2 text-sm opacity-90">
              <strong>Cách xử lý:</strong> Chờ nhóm GOV ký xong (thường &lt; 24h).
              Khi lệnh chuyển sang trạng thái <em>confirmed</em> hoặc <em>rejected</em>,
              bạn có thể tạo lệnh mới ngay.
            </p>
            {existingRequestId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/wallet?tab=mint&request=${existingRequestId}`)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Xem lệnh đang chờ
              </Button>
            )}
          </>
        );

      case 'SOFT_CEILING': {
        const cut = rawAmount && cappedAmount ? rawAmount - cappedAmount : 0;
        const cutPct = rawAmount ? Math.round((cut / rawAmount) * 100) : 0;
        return (
          <>
            <p>
              Hệ thống đang ở <strong>SoftCeiling {(softCeiling ?? 50_000_000).toLocaleString('vi-VN')} FUN/tháng</strong>
              {' '}cho toàn bộ cộng đồng. Số FUN của bạn được chia tỷ lệ theo Light Score.
            </p>
            {rawAmount !== undefined && cappedAmount !== undefined && (
              <div className="mt-2 text-sm space-y-1">
                <div>• Allocation thô (theo Light Score): <strong>{rawAmount.toLocaleString('vi-VN')} FUN</strong></div>
                <div>• Sau khi cắt theo trần tháng: <strong>{cappedAmount.toLocaleString('vi-VN')} FUN</strong></div>
                <div className="text-amber-600 dark:text-amber-400">
                  → Bị cắt: <strong>{cut.toLocaleString('vi-VN')} FUN ({cutPct}%)</strong>
                </div>
              </div>
            )}
            <p className="mt-2 text-sm opacity-90">
              <strong>Cách xử lý:</strong> Đây <em>không phải lỗi</em>. Cứ claim
              phần được duyệt; phần bị cắt sẽ tự động chuyển sang epoch tháng sau.
            </p>
          </>
        );
      }

      case 'NO_PUBLIC_WALLET':
        return (
          <>
            <p>
              Bạn chưa cài <strong>địa chỉ ví công khai</strong> để nhận FUN Money
              on-chain. Hệ thống cần ví này để gửi token sau khi multisig ký xong.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate('/settings?tab=wallet')}
            >
              <Wallet className="w-3.5 h-3.5 mr-1.5" />
              Cài đặt ví công khai
            </Button>
          </>
        );

      default:
        return (
          <>
            <p>{message || 'Có lỗi xảy ra khi tạo lệnh mint.'}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Thử lại
              </Button>
            )}
          </>
        );
    }
  };

  return (
    <Alert className={meta.tone}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{meta.title}</AlertTitle>
      <AlertDescription className="mt-1">{renderBody()}</AlertDescription>
    </Alert>
  );
}
