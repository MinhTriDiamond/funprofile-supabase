import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePendingRecoveries } from '@/hooks/useGuardians';

export function PendingRecoveryRequests() {
  const { data: recoveries = [], refetch } = usePendingRecoveries();

  const attest = async (recovery_id: string, decision: 'approve' | 'deny') => {
    try {
      const { data, error } = await supabase.functions.invoke('identity-recovery-attest', {
        body: { recovery_id, decision },
      });
      if (error) throw error;
      toast.success(`Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'}`, {
        description: `${data?.approved}/${data?.required} approval`,
      });
      refetch();
    } catch (e: any) {
      toast.error('Lỗi', { description: e.message });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Yêu cầu Recovery cần con xác nhận ({recoveries.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recoveries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Không có yêu cầu nào</p>
        ) : recoveries.map((r: any) => (
          <div key={r.id} className="rounded border-2 border-amber-500/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono truncate">{r.did_id}</p>
                <div className="flex gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">{r.method}</Badge>
                  <span className="text-[9px] text-muted-foreground">{new Date(r.created_at).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={() => attest(r.id, 'approve')} className="flex-1 h-7 text-xs">
                <Check className="w-3 h-3 mr-1" /> Duyệt
              </Button>
              <Button size="sm" variant="outline" onClick={() => attest(r.id, 'deny')} className="flex-1 h-7 text-xs">
                <X className="w-3 h-3 mr-1" /> Từ chối
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
