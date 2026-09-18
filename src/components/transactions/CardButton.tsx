/**
 * CardButton — pill nhỏ "Card" cạnh Tx Hash trong TransactionRow.
 * Click → mở Celebration Card ở giữa màn hình.
 */
import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export function CardButton({ onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title="Hiển thị thiệp chúc mừng"
      aria-label="Hiển thị thiệp chúc mừng"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5',
        'text-[10px] font-semibold text-emerald-700 transition-colors',
        'hover:bg-emerald-100 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        'dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50',
        className,
      )}
    >
      <CreditCard className="h-3 w-3" />
      Card
    </button>
  );
}
