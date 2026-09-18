import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLanguage } from '@/i18n/LanguageContext';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, details: string) => Promise<void>;
}

export function ReportDialog({ open, onOpenChange, onSubmit }: ReportDialogProps) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const REASONS = [
    { value: 'spam', label: t('reportSpam') },
    { value: 'harassment', label: t('reportHarassment') },
    { value: 'inappropriate', label: t('reportInappropriate') },
    { value: 'scam', label: t('reportScam') },
    { value: 'other', label: t('reportOther') },
  ];

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(reason, details);
      setReason('spam');
      setDetails('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reportTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={setReason}>
            {REASONS.map(r => (
              <div key={r.value} className="flex items-center space-x-2">
                <RadioGroupItem value={r.value} id={r.value} />
                <Label htmlFor={r.value}>{r.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea
            placeholder={t('reportDetails')}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('reportCancel')}</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('reportSubmitting') : t('reportSubmitBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
