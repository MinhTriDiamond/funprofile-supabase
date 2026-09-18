import { AlertTriangle, Loader2, Radio } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface EndLiveConfirmDialogProps {
  open: boolean;
  ending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function EndLiveConfirmDialog({
  open,
  ending = false,
  onOpenChange,
  onConfirm,
}: EndLiveConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !ending && onOpenChange(nextOpen)}>
      <AlertDialogContent className="overflow-hidden rounded-3xl border-gold/20 p-0 shadow-2xl">
        <div className="bg-gradient-to-br from-red-50 via-background to-gold/10 p-6">
          <AlertDialogHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-2xl font-black">
              Kết thúc phát trực tiếp?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              Bạn có chắc muốn kết thúc buổi phát trực tiếp này không?
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="gap-2 bg-background px-6 py-4 sm:justify-between">
          <AlertDialogCancel className="mt-0 rounded-full px-5 font-bold" disabled={ending}>
            <Radio className="mr-2 h-4 w-4" />
            Tiếp tục phát
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={ending}
            className="rounded-full bg-red-600 px-5 font-black text-white hover:bg-red-700"
          >
            {ending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kết thúc
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
