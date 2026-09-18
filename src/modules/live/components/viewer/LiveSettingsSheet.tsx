import { AlertTriangle, MessageCircle, Radio, SlidersHorizontal, Smile } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';

interface LiveSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floatingComments: boolean;
  reactionsEnabled: boolean;
  onFloatingCommentsChange: (enabled: boolean) => void;
  onReactionsEnabledChange: (enabled: boolean) => void;
}

export function LiveSettingsSheet({
  open,
  onOpenChange,
  floatingComments,
  reactionsEnabled,
  onFloatingCommentsChange,
  onReactionsEnabledChange,
}: LiveSettingsSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-white/10 bg-zinc-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white">
        <DrawerHeader className="px-0 text-left">
          <DrawerTitle className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            Cài đặt live
          </DrawerTitle>
        </DrawerHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 text-emerald-300" />
              Chất lượng video
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['Auto', '720p', '480p', '360p'].map((quality, index) => (
                <Button
                  key={quality}
                  type="button"
                  variant={index === 0 ? 'secondary' : 'ghost'}
                  disabled={index > 0}
                  className="rounded-xl border border-white/10 disabled:opacity-40"
                  onClick={() => toast.info('Chất lượng Auto đang được sử dụng.')}
                >
                  {quality}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-sky-300" />
                <div>
                  <div className="text-sm font-semibold">Bình luận nổi</div>
                  <div className="text-xs text-white/55">Hiện tương tác nhẹ trong chế độ tập trung</div>
                </div>
              </div>
              <Switch checked={floatingComments} onCheckedChange={onFloatingCommentsChange} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Smile className="h-4 w-4 text-amber-300" />
                <div>
                  <div className="text-sm font-semibold">Reaction bay</div>
                  <div className="text-xs text-white/55">Hiệu ứng yêu thương trên màn hình live</div>
                </div>
              </div>
              <Switch checked={reactionsEnabled} onCheckedChange={onReactionsEnabledChange} />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="h-12 w-full justify-start rounded-2xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/10"
            onClick={() => toast.info('Cảm ơn bạn, báo cáo sự cố live sẽ sớm được hỗ trợ.')}
          >
            <AlertTriangle className="mr-2 h-4 w-4 text-amber-300" />
            Báo cáo sự cố live
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
