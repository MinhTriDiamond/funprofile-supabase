import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PublicPetCard } from './PublicPetCard';

interface Props {
  userId: string;
  currentUserId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PetQuickViewDialog({ userId, currentUserId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Linh thú Lumi</DialogTitle>
        </DialogHeader>
        <PublicPetCard userId={userId} currentUserId={currentUserId} />
      </DialogContent>
    </Dialog>
  );
}
