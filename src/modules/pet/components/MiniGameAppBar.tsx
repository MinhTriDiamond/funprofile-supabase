import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MiniGameAppBarProps {
  title: string;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Đường về nếu user vào thẳng bằng URL (không có lịch sử nội bộ). Mặc định `/pet`. */
  fallback?: string;
  /** Slot bên phải (nút phụ, dropdown, badge…). */
  right?: ReactNode;
  className?: string;
}

/**
 * AppBar dùng chung cho mọi màn hình con của Mini Game (Cửa hàng, Arena, Kháng nghị…).
 * Nút Back đi lùi 1 bước trong history stack (giống Flutter Navigator.pop). Nếu user
 * mở trực tiếp URL (history rỗng) thì fallback về `/pet`.
 */
export function MiniGameAppBar({
  title,
  icon: Icon,
  iconClassName = 'w-5 h-5 text-purple-500',
  fallback = '/pet',
  right,
  className,
}: MiniGameAppBarProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    // react-router v6 lưu index vào window.history.state.idx. Nếu > 0 nghĩa là có entry trước đó
    // do app push (không phải vào trực tiếp).
    const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <header
      className={`sticky top-14 z-30 -mx-3 px-3 py-2 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex items-center gap-2 ${className ?? ''}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 -ml-1"
        onClick={handleBack}
        aria-label="Quay lại trang trước"
      >
        <ArrowLeft className="w-4 h-4" />
      </Button>
      {Icon && <Icon className={iconClassName} aria-hidden />}
      <h1 className="text-xl font-bold truncate">{title}</h1>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}
