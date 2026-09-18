import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings, Eye, Keyboard, Users } from 'lucide-react';
import { useChatSettings } from '../hooks/useChatSettings';
import type { ChatSettings } from '../types';
import { toast } from 'sonner';

interface ChatSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

export function ChatSettingsDialog({ open, onOpenChange, userId }: ChatSettingsDialogProps) {
  const { settings, updateSettings, isLoading } = useChatSettings(userId);

  const handleUpdate = async (updates: Partial<ChatSettings>) => {
    try {
      await updateSettings.mutateAsync(updates);
      toast.success('Đã cập nhật cài đặt');
    } catch {
      toast.error('Không thể cập nhật cài đặt');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> Cài đặt tin nhắn
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label>Ai có thể nhắn tin cho bạn</Label>
            </div>
            <Select
              value={settings?.who_can_message || 'everyone'}
              onValueChange={(v) => handleUpdate({ who_can_message: v })}
              disabled={isLoading || updateSettings.isPending}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="pointer-events-auto z-[9999]">
                <SelectItem value="everyone">Mọi người</SelectItem>
                <SelectItem value="friends">Chỉ bạn bè</SelectItem>
                <SelectItem value="nobody">Không ai</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="read-receipts">Xác nhận đã đọc</Label>
              </div>
              <p className="text-xs text-muted-foreground">Hiển thị khi bạn đã xem tin nhắn</p>
            </div>
            <Switch
              id="read-receipts"
              checked={settings?.show_read_receipts ?? true}
              onCheckedChange={(c) => handleUpdate({ show_read_receipts: c })}
              disabled={isLoading || updateSettings.isPending}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="typing">Trạng thái đang nhập</Label>
              </div>
              <p className="text-xs text-muted-foreground">Cho người khác biết khi bạn đang nhập</p>
            </div>
            <Switch
              id="typing"
              checked={settings?.show_typing_indicator ?? true}
              onCheckedChange={(c) => handleUpdate({ show_typing_indicator: c })}
              disabled={isLoading || updateSettings.isPending}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
