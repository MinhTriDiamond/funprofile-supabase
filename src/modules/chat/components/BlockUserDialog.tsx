
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';

interface BlockUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  isBlocking: boolean;
  onConfirm: () => void;
  mode: 'block' | 'unblock';
}

export function BlockUserDialog({
  open,
  onOpenChange,
  username,
  isBlocking,
  onConfirm,
  mode,
}: BlockUserDialogProps) {
  const { t } = useLanguage();
  const title = mode === 'block' ? t('dlgBlockTitle') : t('dlgUnblockTitle');
  const body =
    mode === 'block'
      ? t('dlgBlockBody', { name: username })
      : t('dlgUnblockBody', { name: username });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{body}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBlocking}>
            {t('cancel')}
          </Button>
          <Button
            variant={mode === 'block' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isBlocking}
          >
            {isBlocking ? t('dlgBlockProcessing') : mode === 'block' ? t('dlgBlockConfirm') : t('dlgUnblockConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
