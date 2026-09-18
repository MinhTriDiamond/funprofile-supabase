import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AttestationDialog({
  open, onOpenChange, fromDid, toDid,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  fromDid: string; toDid: string;
}) {
  const [type, setType] = useState('peer_endorsement');
  const [weight, setWeight] = useState(0.5);
  const [evidence, setEvidence] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('identity-attestation-submit', {
        body: { from_did: fromDid, to_did: toDid, attestation_type: type, weight, evidence_ref: evidence },
      });
      if (error) throw error;
      toast.success('Đã gửi attestation');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Không gửi được', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gửi Peer Attestation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Loại</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="peer_endorsement">Peer Endorsement</SelectItem>
                <SelectItem value="mentor">Mentor</SelectItem>
                <SelectItem value="recovery_guardian">Recovery Guardian</SelectItem>
                <SelectItem value="witness">Witness</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Weight (0–1)</Label>
            <Input type="number" min={0} max={1} step={0.1} value={weight}
              onChange={(e) => setWeight(Number(e.target.value))} />
          </div>
          <div>
            <Label>Evidence (link/text, tuỳ chọn)</Label>
            <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? 'Đang gửi…' : 'Gửi attestation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
