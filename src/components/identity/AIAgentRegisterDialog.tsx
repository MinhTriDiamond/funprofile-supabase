import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function AIAgentRegisterDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    display_name: '', description: '', model_name: '', model_version: '',
    autonomy_level: 'supervised', audit_log_url: '', api_endpoint: '',
  });
  const qc = useQueryClient();

  const submit = async () => {
    if (!form.display_name) return toast.error('Tên agent bắt buộc');
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('identity-ai-agent-register', { body: form });
      if (error) throw error;
      toast.success('Đã đăng ký AI agent');
      qc.invalidateQueries({ queryKey: ['my-ai-agents'] });
      setOpen(false);
    } catch (e: any) {
      toast.error('Lỗi đăng ký', { description: e.message });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Bot className="w-4 h-4" />Đăng ký AI Agent</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đăng ký AI Agent</DialogTitle>
          <p className="text-xs text-muted-foreground">Bạn sẽ là <strong>operator</strong> chịu trách nhiệm cho mọi hành động của agent này.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tên agent *</Label>
            <Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Angel AI Assistant" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Model</Label>
              <Input value={form.model_name} onChange={e => setForm({ ...form, model_name: e.target.value })} placeholder="gpt-5" />
            </div>
            <div>
              <Label>Version</Label>
              <Input value={form.model_version} onChange={e => setForm({ ...form, model_version: e.target.value })} placeholder="1.0" />
            </div>
          </div>
          <div>
            <Label>Mức tự chủ</Label>
            <Select value={form.autonomy_level} onValueChange={v => setForm({ ...form, autonomy_level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supervised">Có giám sát (mỗi action cần approve)</SelectItem>
                <SelectItem value="semi_autonomous">Bán tự chủ (action low-risk auto)</SelectItem>
                <SelectItem value="autonomous">Tự chủ hoàn toàn</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Audit log URL</Label>
            <Input value={form.audit_log_url} onChange={e => setForm({ ...form, audit_log_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>Mô tả</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={loading} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}Đăng ký
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
