import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/i18n/LanguageContext';

interface EndLiveConfirmDialogProps {
  open: boolean;
  ending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function EndLiveConfirmDialog({ open, ending, onOpenChange, onConfirm }: EndLiveConfirmDialogProps) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dlgEndLiveTitle')}</DialogTitle>
          <DialogDescription>
            {t('dlgEndLiveDesc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ending}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={ending}>
            {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            {t('dlgEndLiveConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
