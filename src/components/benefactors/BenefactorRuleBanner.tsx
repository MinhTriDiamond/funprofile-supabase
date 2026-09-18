import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Banner giải thích quy tắc BXH USD của Benefactors.
 * Nút "Xem quy tắc" hiện tại là placeholder (sẽ mở modal trong sub-phase sau).
 */
export function BenefactorRuleBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground">
          Xếp hạng USD chỉ tính các giao dịch hợp lệ giữa người dùng. Các token thuộc hệ sinh
          thái (như FUN) được hiển thị ở khu vực riêng và không ảnh hưởng đến thứ hạng USD
          hiện tại.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 text-primary hover:text-primary"
        onClick={() => {
          /* placeholder — modal quy tắc sẽ được mở trong sub-phase sau */
        }}
      >
        Xem quy tắc
      </Button>
    </div>
  );
}
