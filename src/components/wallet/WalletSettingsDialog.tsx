import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface WalletSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WalletSettingsDialog = ({ open, onOpenChange }: WalletSettingsDialogProps) => {
  const [showBalance, setShowBalance] = useState(true);
  const [currency, setCurrency] = useState('USD');
  const [autoLock, setAutoLock] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('wallet_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setShowBalance(parsed.showBalance ?? true);
        setCurrency(parsed.currency ?? 'USD');
        setAutoLock(parsed.autoLock ?? false);
        setNotifications(parsed.notifications ?? true);
      } catch { /* localStorage parse — safe to ignore, use defaults */ }
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('wallet_settings', JSON.stringify({
      showBalance,
      currency,
      autoLock,
      notifications,
    }));
    toast.success('Đã lưu cài đặt');
    onOpenChange(false);
  };

  const handleResetSettings = () => {
    setShowBalance(true);
    setCurrency('USD');
    setAutoLock(false);
    setNotifications(true);
    localStorage.removeItem('wallet_settings');
    toast.success('Đã khôi phục cài đặt mặc định');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cài đặt ví</DialogTitle>
          <DialogDescription>
            Tùy chỉnh cách ví của bạn hoạt động
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {/* Display Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Hiển thị</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="show-balance" className="flex flex-col gap-1">
                <span>Hiển thị số dư</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Ẩn/hiện số dư trên màn hình chính
                </span>
              </Label>
              <Switch
                id="show-balance"
                checked={showBalance}
                onCheckedChange={setShowBalance}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Đơn vị tiền tệ</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - Dollar Mỹ</SelectItem>
                  <SelectItem value="VND">VND - Việt Nam Đồng</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - Bảng Anh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Security Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Bảo mật</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-lock" className="flex flex-col gap-1">
                <span>Tự động khóa</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Yêu cầu mở khóa sau 5 phút không hoạt động
                </span>
              </Label>
              <Switch
                id="auto-lock"
                checked={autoLock}
                onCheckedChange={setAutoLock}
              />
            </div>
          </div>

          <Separator />

          {/* Notification Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Thông báo</h3>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications" className="flex flex-col gap-1">
                <span>Thông báo giao dịch</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Nhận thông báo khi có giao dịch mới
                </span>
              </Label>
              <Switch
                id="notifications"
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Nâng cao</h3>
            
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => toast.info('Tính năng đang phát triển')}
            >
              Quản lý mạng tùy chỉnh
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => toast.info('Tính năng đang phát triển')}
            >
              Xóa dữ liệu ứng dụng
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-destructive"
              onClick={handleResetSettings}
            >
              Khôi phục cài đặt mặc định
            </Button>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Hủy
            </Button>
            <Button onClick={handleSaveSettings} className="flex-1">
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
