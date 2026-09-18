import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Wallet, Globe, Smartphone, Building2, Plus, BadgeCheck, Clock, XCircle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useIdentityLinks } from '@/hooks/useIdentityLinks';

const TYPE_ICON: Record<string, any> = {
  wallet: Wallet, social: Globe, device: Smartphone, organization: Building2,
};
const STATE_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  verified: { label: 'Đã xác minh', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', Icon: BadgeCheck },
  unverified: { label: 'Chưa xác minh', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', Icon: Clock },
  revoked: { label: 'Đã thu hồi', cls: 'bg-rose-500/10 text-rose-600 border-rose-500/30', Icon: XCircle },
};

export function LinkedIdentitiesPanel() {
  const { data: links = [], refetch, isLoading } = useIdentityLinks();
  const [open, setOpen] = useState(false);
  const [linkType, setLinkType] = useState('wallet');
  const [linkValue, setLinkValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!linkValue.trim()) return toast.error('Nhập giá trị link');
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('identity-link-manage', {
        body: { action: 'add', link_type: linkType, link_value: linkValue.trim() },
      });
      if (error) throw error;
      toast.success('Đã thêm link');
      setLinkValue(''); setOpen(false); await refetch();
    } catch (e: any) {
      toast.error('Lỗi', { description: e.message });
    } finally { setSubmitting(false); }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      const { error } = await supabase.functions.invoke('identity-link-manage', {
        body: { action: 'revoke', link_id: id },
      });
      if (error) throw error;
      toast.success('Đã thu hồi');
      await refetch();
    } catch (e: any) {
      toast.error('Lỗi', { description: e.message });
    } finally { setRevoking(null); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Linked Identities ({links.length})</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1"><Plus className="w-3 h-3" />Thêm</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Liên kết identity mới</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Loại</Label>
                <Select value={linkType} onValueChange={setLinkType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wallet">Wallet (0x…)</SelectItem>
                    <SelectItem value="social">Social (URL)</SelectItem>
                    <SelectItem value="device">Device (hash/id)</SelectItem>
                    <SelectItem value="organization">Organization (DID)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Giá trị</Label>
                <Input value={linkValue} onChange={(e) => setLinkValue(e.target.value)}
                  placeholder={linkType === 'wallet' ? '0x...' : linkType === 'social' ? 'https://...' : ''} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Wallet sẽ tự xác minh nếu khớp với ví của bạn. Social/device cần xác minh thủ công sau.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} disabled={submitting} className="gap-1">
                {submitting && <Loader2 className="w-3 h-3 animate-spin" />}Thêm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : links.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">Chưa có identity nào được liên kết</p>
        ) : (
          <div className="space-y-2">
            {links.map((l: any) => {
              const Icon = TYPE_ICON[l.link_type] ?? Globe;
              const state = STATE_BADGE[l.verification_state] ?? STATE_BADGE.unverified;
              const StateIcon = state.Icon;
              return (
                <div key={l.id} className="flex items-center gap-2 p-2 rounded-md border bg-card/50">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate">{l.link_value}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[9px] capitalize px-1">{l.link_type}</Badge>
                      <Badge variant="outline" className={`text-[9px] gap-0.5 px-1 ${state.cls}`}>
                        <StateIcon className="w-2.5 h-2.5" />{state.label}
                      </Badge>
                    </div>
                  </div>
                  {l.verification_state !== 'revoked' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => handleRevoke(l.id)} disabled={revoking === l.id}>
                      {revoking === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 text-rose-500" />}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
