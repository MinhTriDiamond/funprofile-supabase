/**
 * MobileWalletConnectSheet — Drawer hướng dẫn kết nối ví trên mobile (dùng chung).
 *
 * Mục đích: thay vì mở thẳng RainbowKit modal (gây "WalletConnect popup" không deep-link
 * được trên Safari mobile), hiển thị 1 sheet thân thiện cho user 3 lựa chọn:
 *   1. Mở trong MetaMask / Trust / Bitget (deep link → dApp browser)
 *   2. Kết nối ví đang inject (nếu đang trong dApp browser)
 *   3. Fallback: WalletConnect universal modal
 *
 * Dùng ở Wallet Center, dialog Tặng quà, và bất kỳ luồng "Kết nối" nào trên mobile.
 */

import { useCallback } from 'react';
import { ExternalLink, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { toast } from 'sonner';
import {
  getBitgetDeepLink,
  getInjectedMobileBrowserType,
  getMetaMaskDeepLink,
  getTrustWalletDeepLink,
  isInjectedMobileBrowser,
} from '@/utils/mobileWalletConnect';

export interface MobileWalletConnectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gọi khi user bấm "Kết nối {ví đang inject}" — chỉ hiển thị khi đang ở dApp browser */
  onInjectedConnect?: () => void;
  /** Gọi khi user chọn "Kết nối bằng WalletConnect" (fallback) */
  onOpenWalletConnect?: () => void;
  /** Gọi khi user bấm "Thử lại / Làm mới" — optional */
  onReset?: () => void;
}

export const MobileWalletConnectSheet = ({
  open,
  onOpenChange,
  onInjectedConnect,
  onOpenWalletConnect,
  onReset,
}: MobileWalletConnectSheetProps) => {
  const injectedType = getInjectedMobileBrowserType();
  const injectedName =
    injectedType === 'metamask' ? 'MetaMask'
    : injectedType === 'trustwallet' ? 'Trust Wallet'
    : injectedType === 'bitget' ? 'Bitget Wallet'
    : 'ví đang mở';

  const openWalletDeepLink = useCallback((url: string) => {
    if (!url) return;
    toast.info('Đang mở app ví. Nếu app không tự mở, hãy mở ví rồi vào Browser/DApp và nhập fun.rich.');
    window.location.href = url;
  }, []);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Chọn cách kết nối ví
          </DrawerTitle>
          <DrawerDescription>
            Cách dễ nhất: mở FUN Profile bên trong app ví rồi bấm Kết nối. Nếu ví không bật popup,
            quay lại app ví và xác nhận yêu cầu kết nối.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Mở MetaMask / Trust / Bitget &gt; Browser/DApp &gt; nhập fun.rich &gt; Ví của tôi &gt; Kết nối ví.
          </div>

          {isInjectedMobileBrowser() && onInjectedConnect && (
            <Button
              onClick={onInjectedConnect}
              className="h-12 w-full justify-start rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Wallet className="mr-2 h-5 w-5" />
              Kết nối {injectedName}
            </Button>
          )}

          <button
            onClick={() => openWalletDeepLink(getMetaMaskDeepLink())}
            className="flex w-full items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left transition-colors hover:bg-orange-100"
          >
            <span>
              <span className="block font-semibold text-orange-700">Mở trong MetaMask</span>
              <span className="text-xs text-orange-700/75">Dùng Browser/DApp trong MetaMask để kết nối ổn định.</span>
            </span>
            <ExternalLink className="h-4 w-4 text-orange-600" />
          </button>

          <button
            onClick={() => openWalletDeepLink(getTrustWalletDeepLink())}
            className="flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-colors hover:bg-blue-100"
          >
            <span>
              <span className="block font-semibold text-blue-700">Mở trong Trust Wallet</span>
              <span className="text-xs text-blue-700/75">Mở đúng trang FUN Profile trong dApp browser của Trust.</span>
            </span>
            <ExternalLink className="h-4 w-4 text-blue-600" />
          </button>

          <button
            onClick={() => openWalletDeepLink(getBitgetDeepLink())}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
          >
            <span>
              <span className="block font-semibold text-slate-800">Mở trong Bitget Wallet</span>
              <span className="text-xs text-slate-600">Dùng Bitget Wallet để duyệt FUN Profile và xác nhận ví.</span>
            </span>
            <ExternalLink className="h-4 w-4 text-slate-600" />
          </button>

          {onOpenWalletConnect && (
            <div className="grid grid-cols-1 gap-2 pt-1">
              <Button onClick={onOpenWalletConnect} variant="outline" className="h-11 rounded-xl">
                <Wallet className="mr-2 h-4 w-4" />
                Kết nối bằng WalletConnect
              </Button>
              {onReset && (
                <Button onClick={onReset} variant="ghost" className="h-11 rounded-xl text-muted-foreground">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Thử lại / Làm mới kết nối
                </Button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileWalletConnectSheet;
