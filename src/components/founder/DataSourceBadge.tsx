import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';

type Status = 'production' | 'pilot' | 'inactive';

const MAP: Record<Status, { label: string; cls: string; Icon: any }> = {
  production: { label: 'Production', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', Icon: CheckCircle2 },
  pilot: { label: 'Pilot', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', Icon: AlertCircle },
  inactive: { label: 'Chưa active', cls: 'bg-muted text-muted-foreground border-border', Icon: Clock },
};

export function DataSourceBadge({ status, note }: { status: Status; note?: string }) {
  const m = MAP[status];
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${m.cls}`} title={note}>
      <m.Icon className="w-3 h-3" />{m.label}
    </Badge>
  );
}
