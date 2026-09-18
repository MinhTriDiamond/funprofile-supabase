import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';
import { useMyDisputes } from '@/hooks/useDisputes';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  under_review: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  accepted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  withdrawn: 'bg-muted text-muted-foreground',
};

export function DisputeList() {
  const { data: disputes = [] } = useMyDisputes();

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="w-4 h-4 text-primary" />
          Khiếu nại của con ({disputes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {disputes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Chưa có khiếu nại nào</p>
        ) : disputes.map((d: any) => (
          <div key={d.id} className="rounded border p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{d.dispute_type}</Badge>
              <Badge className={`${STATUS_COLOR[d.status]} border-0 text-[9px] h-4 px-1.5`}>{d.status}</Badge>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground truncate">target: {d.target_ref}</p>
            <p className="text-xs">{d.reason}</p>
            {d.resolution_note && (
              <p className="text-[10px] italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                Phản hồi: {d.resolution_note}
              </p>
            )}
            <p className="text-[9px] text-muted-foreground">{new Date(d.created_at).toLocaleString('vi-VN')}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
