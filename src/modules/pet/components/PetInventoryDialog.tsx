import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PetCosmeticInventory } from './PetCosmeticInventory';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog hiển thị tủ đồ Lumi — danh sách trang phục đã sở hữu
 * (từ Shop CAMLY hoặc Mystery Box), kèm nút "Trang bị" cho từng món.
 */
export function PetInventoryDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tủ đồ Lumi</DialogTitle>
          <DialogDescription>
            Bấm <span className="font-semibold">Trang bị</span> để Lumi mặc món đồ bạn vừa mua.
            Mỗi slot (Mũ / Hào quang / Nền / Phụ kiện / Da) chỉ mặc được 1 món cùng lúc.
          </DialogDescription>
        </DialogHeader>
        <PetCosmeticInventory />
      </DialogContent>
    </Dialog>
  );
}
