
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface EditMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: string;
  isSaving: boolean;
  onSave: (next: string) => void;
}

export function EditMessageDialog({
  open,
  onOpenChange,
  initialValue,
  isSaving,
  onSave,
}: EditMessageDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa tin nhắn</DialogTitle>
        </DialogHeader>
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[100px]" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Hủy
          </Button>
          <Button onClick={() => onSave(value)} disabled={isSaving || !value.trim()}>
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
