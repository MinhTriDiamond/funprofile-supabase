import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function OrgCreateDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ display_name: '', legal_name: '', domain: '', website: '', description: '', org_type: 'general' });
  const qc = useQueryClient();

  const submit = async () => {
    if (!form.display_name) return toast.error('Tên hiển thị bắt buộc');
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('identity-org-create', { body: form });
      if (error) throw error;
      toast.success('Đã tạo tổ chức');
      qc.invalidateQueries({ queryKey: ['my-orgs'] });
      qc.invalidateQueries({ queryKey: ['all-orgs'] });
      setOpen(false);
      setForm({ display_name: '', legal_name: '', domain: '', website: '', description: '', org_type: 'general' });
    } catch (e: any) {
      toast.error('Lỗi tạo tổ chức', { description: e.message });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Building2 className="w-4 h-4" />Tạo tổ chức</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Tạo tổ chức mới</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tên hiển thị *</Label>
            <Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Acme DAO" />
          </div>
          <div>
            <Label>Loại tổ chức</Label>
            <Select value={form.org_type} onValueChange={v => setForm({ ...form, org_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Chung</SelectItem>
                <SelectItem value="dao">DAO</SelectItem>
                <SelectItem value="company">Doanh nghiệp</SelectItem>
                <SelectItem value="nonprofit">Phi lợi nhuận</SelectItem>
                <SelectItem value="validator_pool">Validator Pool</SelectItem>
                <SelectItem value="partner">Đối tác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Domain</Label>
              <Input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="acme.org" />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://" />
            </div>
          </div>
          <div>
            <Label>Mô tả</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={loading} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}Tạo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
