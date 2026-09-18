import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  dispute_type: 'sbt_revoke' | 'sbt_freeze' | 'sybil_flag' | 'trust_penalty' | 'did_demotion';
  target_ref: string;
  triggerLabel?: string;
  onSubmitted?: () => void;
}

export function DisputeDialog({ dispute_type, target_ref, triggerLabel = 'Khiếu nại', onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 20) {
      toast.error('Cần lý do ≥ 20 ký tự');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('identity-dispute-submit', {
        body: { dispute_type, target_ref, reason: reason.trim(), evidence: {} },
      });
      if (error) throw error;
      toast.success('Đã gửi khiếu nại', { description: 'Admin sẽ xem xét sớm' });
      setOpen(false);
      setReason('');
      onSubmitted?.();
    } catch (e: any) {
      toast.error('Lỗi gửi', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
          <ShieldAlert className="w-3 h-3" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Khiếu nại</DialogTitle>
          <DialogDescription>Loại: <b>{dispute_type}</b> · Target: <code className="text-[10px]">{target_ref.slice(0, 24)}…</code></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Lý do (≥ 20 ký tự)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-[100px] text-sm" placeholder="Giải thích vì sao quyết định này không chính xác..." />
            <p className="text-[10px] text-muted-foreground mt-1">{reason.length}/20 ký tự tối thiểu</p>
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Gửi khiếu nại
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Cooldown 7 ngày / cùng mục. Tối đa 3 dispute pending cùng lúc.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
