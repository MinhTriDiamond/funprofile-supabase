import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { AlertTriangle, ArrowRightLeft, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

// ============================================================
// AccountMismatchModal
// Hiển thị khi provider address (ví thực tế) khác với
// activeAddress (tài khoản người dùng đã chọn trong app).
// Cho 2 lựa chọn: đồng bộ theo ví hoặc giữ nguyên active.
// Tự đóng khi đã khớp.
// ============================================================

interface AccountMismatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AccountMismatchModal = ({ open, onOpenChange }: AccountMismatchModalProps) => {
  const { address: providerAddress } = useAccount();
  const { activeAddress, setActiveAddress, accounts } = useActiveAccount();

  // Tự đóng khi đã khớp
  useEffect(() => {
    if (!providerAddress || !activeAddress) return;
    if (providerAddress.toLowerCase() === activeAddress.toLowerCase()) {
      onOpenChange(false);
    }
  }, [providerAddress, activeAddress, onOpenChange]);

  const shortProvider = providerAddress
    ? `${providerAddress.slice(0, 6)}...${providerAddress.slice(-4)}`
    : '---';
  const shortActive = activeAddress
    ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}`
    : '---';

  // Lựa chọn A: đồng bộ active theo ví
  const syncToProvider = () => {
    if (providerAddress) {
      setActiveAddress(providerAddress);
    }
    onOpenChange(false);
  };

  // Lựa chọn B: giữ nguyên active, yêu cầu user đổi trong ví
  const keepActive = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Tài khoản không khớp
          </DialogTitle>
          <DialogDescription>
            Ví đang chọn tài khoản khác với tài khoản bạn đã chọn trong ứng dụng.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Hiển thị 2 address */}
          <div className="bg-orange-50 rounded-lg p-3 space-y-2 text-sm overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex-shrink-0">Ví hiện tại:</span>
              <span className="font-mono font-medium truncate max-w-[140px] text-right">{shortProvider}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex-shrink-0">Sẽ chuyển sang ví này:</span>
              <span className="font-mono font-medium truncate max-w-[140px] text-right">{shortActive}</span>
            </div>
          </div>

          {/* 2 nút lựa chọn */}
          <div className="space-y-2">
            <Button
              onClick={syncToProvider}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white overflow-hidden"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">Quay lại, tôi không chuyển địa chỉ ví nữa</span>
            </Button>
            <Button
              onClick={keepActive}
              variant="outline"
              className="w-full overflow-hidden"
            >
              <Wallet className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">Tiếp tục, tôi sẽ đổi sang địa chỉ ví đã chọn</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AccountMismatchModal;
