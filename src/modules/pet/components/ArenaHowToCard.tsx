import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, X } from 'lucide-react';

const KEY = 'pet-arena-guide-dismissed-v1';

export function ArenaHowToCard() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '1') setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const reopen = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={reopen}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center gap-1"
      >
        <Lightbulb className="w-3 h-3" /> Xem lại hướng dẫn mời so tài
      </button>
    );
  }

  return (
    <Card className="p-4 border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/40 dark:from-amber-950/30 dark:to-orange-950/20">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-2 shrink-0">
          <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-300" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-semibold">Cách mời thành viên cùng so tài Lumi</h3>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-4">
            <li>
              Mở tab <strong className="text-foreground">"Bạn so tài"</strong> để thấy
              mọi Lumi đang sẵn sàng (kể cả cấp 1).
            </li>
            <li>
              Bấm <strong className="text-foreground">"So tài"</strong> cạnh người bạn muốn —
              hoặc dùng nút <strong className="text-foreground">"Tìm &amp; mời bạn cụ thể"</strong>
              {' '}để mời đích danh ai đó theo tên.
            </li>
            <li>
              Bạn ấy sẽ thấy lời mời ở tab <strong className="text-foreground">"Lời mời"</strong>
              {' '}và bấm <strong className="text-foreground">"So tài ngay"</strong> để cùng giao lưu
              5 vòng Ánh Sáng.
            </li>
            <li>
              Kết quả hiện ngay trong <strong className="text-foreground">"Hành trình"</strong>
              {' '}và cộng điểm cho <strong className="text-foreground">"Bảng vinh danh"</strong>.
            </li>
          </ol>
          <div className="pt-1">
            <Button size="sm" variant="secondary" onClick={dismiss}>
              Đã hiểu, cảm ơn
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mr-1 -mt-1"
          onClick={dismiss}
          aria-label="Đóng hướng dẫn"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
