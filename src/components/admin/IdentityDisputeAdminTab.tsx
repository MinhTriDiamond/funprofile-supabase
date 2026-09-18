import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Scale, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAdminDisputes } from '@/hooks/useDisputes';

export function IdentityDisputeAdminTab() {
  const { data: disputes = [], refetch } = useAdminDisputes();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);

  const resolve = async (dispute_id: string, decision: 'accepted' | 'rejected') => {
    setResolving(dispute_id);
    try {
      const { error } = await supabase.functions.invoke('identity-dispute-resolve', {
        body: { dispute_id, decision, resolution_note: resolutions[dispute_id] ?? '' },
      });
      if (error) throw error;
      toast.success(`Dispute ${decision}`);
      refetch();
    } catch (e: any) {
      toast.error('Lỗi', { description: e.message });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {disputes.length === 0 ? (
        <Card className="border-0">
          <CardContent className="text-center py-8 text-sm text-muted-foreground">
            <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Không có dispute pending
          </CardContent>
        </Card>
      ) : disputes.map((d: any) => (
        <Card key={d.id} className="border-0 shadow-sm">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-mono truncate">{d.did_id}</p>
                <div className="flex gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">{d.dispute_type}</Badge>
                  <Badge className="text-[9px] h-4 px-1.5">{d.status}</Badge>
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground">{new Date(d.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground truncate">target: {d.target_ref}</p>
            <p className="text-xs bg-muted/50 rounded p-2">{d.reason}</p>
            <Textarea
              placeholder="Ghi chú giải quyết..."
              value={resolutions[d.id] ?? ''}
              onChange={(e) => setResolutions({ ...resolutions, [d.id]: e.target.value })}
              className="text-xs min-h-[50px]"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={() => resolve(d.id, 'accepted')} disabled={resolving === d.id} className="flex-1 h-7 text-xs">
                {resolving === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Chấp nhận'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => resolve(d.id, 'rejected')} disabled={resolving === d.id} className="flex-1 h-7 text-xs">
                Từ chối
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
