import { useState, useMemo, useCallback, useEffect } from 'react';
import { useBalance } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Search, RefreshCw, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer';

// ============================================================
// AccountSelectorModal
// Cho phép người dùng xem danh sách accounts trong ví
// và chọn 1 account làm "tài khoản đang dùng".
// Desktop: Dialog, Mobile: Drawer (bottom sheet).
// ============================================================

interface AccountSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---- Identicon đơn giản tạo từ address (CSS gradient) ----
function AddressIdenticon({ address }: { address: string }) {
  const colors = useMemo(() => {
    // Tạo 2 màu từ hex address
    const hash = address.slice(2, 14);
    const h1 = parseInt(hash.slice(0, 4), 16) % 360;
    const h2 = parseInt(hash.slice(4, 8), 16) % 360;
    const s = 60 + (parseInt(hash.slice(8, 10), 16) % 30);
    return { h1, h2, s };
  }, [address]);

  return (
    <div
      className="w-10 h-10 rounded-full shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${colors.h1}, ${colors.s}%, 55%), hsl(${colors.h2}, ${colors.s}%, 45%))`,
      }}
    />
  );
}

// ---- Dòng account với lazy-load balance ----
function AccountRow({
  address,
  isActive,
  onSelect,
}: {
  address: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const shortened = `${address.slice(0, 6)}...${address.slice(-4)}`.toUpperCase();

  // Lazy-load balance BNB native
  const { data: balanceData, isLoading: isBalLoading } = useBalance({
    address: address as `0x${string}`,
    chainId: bsc.id,
  });

  const formattedBal = useMemo(() => {
    if (!balanceData) return null;
    const val = parseFloat(balanceData.formatted);
    if (val === 0) return '0 BNB';
    if (val < 0.0001) return '<0.0001 BNB';
    return `${val.toFixed(4)} BNB`;
  }, [balanceData]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left',
        isActive
          ? 'bg-emerald-50 border-2 border-emerald-400'
          : 'hover:bg-gray-50 border-2 border-transparent',
      )}
    >
      <AddressIdenticon address={address} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-gray-900">{shortened}</span>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              <Check className="w-3 h-3" /> Đang dùng
            </span>
          )}
        </div>
        <div className="mt-0.5">
          {isBalLoading ? (
            <Skeleton className="h-3 w-20" />
          ) : (
            <span className="text-xs text-muted-foreground">{formattedBal || '---'}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---- Nội dung chính ----
function SelectorContent({ onClose }: { onClose: () => void }) {
  const { accounts, activeAddress, lastUsedAt, setActiveAddress, refreshAccounts, isLoadingAccounts } = useActiveAccount();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Sắp xếp theo lastUsedAt giảm dần
  const sortedAccounts = useMemo(() => {
    const filtered = debouncedSearch
      ? accounts.filter(a => a.includes(debouncedSearch.toLowerCase()))
      : accounts;

    return [...filtered].sort((a, b) => {
      const tA = lastUsedAt[a] || 0;
      const tB = lastUsedAt[b] || 0;
      return tB - tA;
    });
  }, [accounts, lastUsedAt, debouncedSearch]);

  const handleSelect = useCallback((address: string) => {
    setActiveAddress(address);
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    toast.success(`Đã chọn tài khoản ${short}`);
    onClose();
  }, [setActiveAddress, onClose]);

  return (
    <div className="space-y-3 pb-2">
      {/* Thanh tìm kiếm + nút refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo địa chỉ..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAccounts}
          disabled={isLoadingAccounts}
          className="h-9 px-3"
        >
          <RefreshCw className={cn('w-4 h-4', isLoadingAccounts && 'animate-spin')} />
        </Button>
      </div>

      {/* Số lượng */}
      <p className="text-xs text-muted-foreground px-1">
        {accounts.length} tài khoản trong ví
      </p>

      {/* Danh sách accounts */}
      <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
        {sortedAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {debouncedSearch ? 'Không tìm thấy tài khoản phù hợp' : 'Không có tài khoản nào'}
          </p>
        ) : (
          sortedAccounts.map(addr => (
            <AccountRow
              key={addr}
              address={addr}
              isActive={activeAddress?.toLowerCase() === addr.toLowerCase()}
              onSelect={() => handleSelect(addr)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---- Component chính: responsive Dialog / Drawer ----
export const AccountSelectorModal = ({ open, onOpenChange }: AccountSelectorModalProps) => {
  const isMobile = useIsMobile();

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4">
          <DrawerHeader className="text-left">
            <DrawerTitle>Chọn tài khoản</DrawerTitle>
            <DrawerDescription>Chọn tài khoản bạn muốn sử dụng trong ví</DrawerDescription>
          </DrawerHeader>
          <SelectorContent onClose={handleClose} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chọn tài khoản</DialogTitle>
          <DialogDescription>Chọn tài khoản bạn muốn sử dụng trong ví</DialogDescription>
        </DialogHeader>
        <SelectorContent onClose={handleClose} />
      </DialogContent>
    </Dialog>
  );
};

export default AccountSelectorModal;
