import { useState, useEffect } from 'react';
import { Wallet as WalletIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLinkedWallet } from '@/hooks/useLinkedWallet';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Link } from 'react-router-dom';

/**
 * Thanh sticky cố định ở đáy trang Wallet (trên Mobile Bottom Nav).
 * Hiển thị khi user đã đăng nhập nhưng chưa liên kết ví Web3 — giúp
 * liên kết nhanh từ bất kỳ vị trí nào trên trang mà không phải cuộn lại.
 */
export const StickyLinkWalletBar = () => {
  const { isAuthenticated } = useCurrentUser();
  const { linkedWalletAddress, isLoading } = useLinkedWallet();
  const [dismissed, setDismissed] = useState(false);

  // Reset trạng thái dismiss mỗi session
  useEffect(() => {
    setDismissed(false);
  }, [linkedWalletAddress]);

  if (!isAuthenticated || isLoading || linkedWalletAddress || dismissed) {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 z-40 px-3 sm:px-6 pointer-events-none"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
      }}
    >
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/90 dark:to-orange-950/90 backdrop-blur-md shadow-lg p-3 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center flex-shrink-0">
            <WalletIcon className="w-4 h-4 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              Chưa liên kết ví
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-300/80 leading-tight truncate">
              Liên kết để claim FUN đang chờ
            </div>
          </div>
          <Link to="/wallet/asset" className="flex-shrink-0">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-9 px-3"
            >
              Liên kết ví
            </Button>
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Đóng"
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
