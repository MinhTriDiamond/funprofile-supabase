import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Button } from '@/components/ui/button';
import { Download, X, Share, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Banner gợi ý cài đặt app — hiển thị nổi phía trên Bottom Nav (mobile).
 * - Android/Chrome: bấm cài đặt trực tiếp.
 * - iOS Safari: mở dialog hướng dẫn Share → Add to Home Screen.
 * - Đã cài hoặc đã dismiss → không hiển thị.
 */
export function InstallBanner() {
  const { canShowBanner, canPrompt, platform, promptInstall, dismiss } = useInstallPrompt();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (!canShowBanner) return null;

  const handleInstall = async () => {
    if (canPrompt) {
      await promptInstall();
    } else if (platform === 'ios') {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] max-w-md
                   bg-card border border-border shadow-lg rounded-2xl px-3 py-2.5
                   flex items-center gap-3 animate-fade-in"
        style={{ bottom: 'calc(var(--mbn-h, 64px) + var(--safe-bottom, 0px) + 8px)' }}
        role="dialog"
        aria-label="Cài đặt FUN.RICH"
      >
        <img
          src="/pwa-192.png"
          alt="FUN.RICH"
          className="w-10 h-10 rounded-xl flex-shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Cài FUN.RICH</p>
          <p className="text-xs text-muted-foreground leading-tight truncate">
            Mở nhanh từ màn hình chính
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleInstall}
          className="h-9 px-3 text-xs flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          Cài
        </Button>
        <button
          onClick={dismiss}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted flex-shrink-0 touch-target"
          aria-label="Đóng"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cài FUN.RICH trên iPhone</DialogTitle>
            <DialogDescription>Làm theo 3 bước trong Safari</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                1
              </div>
              <div className="text-sm">
                <p className="font-medium">Bấm nút Chia sẻ</p>
                <p className="text-muted-foreground flex items-center gap-1">
                  Biểu tượng <Share className="w-3.5 h-3.5" /> ở thanh dưới Safari
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                2
              </div>
              <div className="text-sm">
                <p className="font-medium">Chọn "Thêm vào MH chính"</p>
                <p className="text-muted-foreground flex items-center gap-1">
                  Biểu tượng <Plus className="w-3.5 h-3.5" /> Add to Home Screen
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                3
              </div>
              <div className="text-sm">
                <p className="font-medium">Bấm "Thêm" góc trên phải</p>
                <p className="text-muted-foreground">Icon FUN.RICH xuất hiện ở Home Screen</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
