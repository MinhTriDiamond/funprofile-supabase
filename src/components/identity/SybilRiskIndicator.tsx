import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { DisputeDialog } from './DisputeDialog';

const MAP: Record<string, { color: string; icon: any; label: string }> = {
  low: { color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: ShieldCheck, label: 'Sybil Low' },
  medium: { color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: AlertTriangle, label: 'Sybil Medium' },
  high: { color: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', icon: ShieldAlert, label: 'Sybil High' },
  critical: { color: 'bg-red-500/15 text-red-700 dark:text-red-300', icon: ShieldAlert, label: 'Sybil Critical' },
};

interface Props {
  risk?: string;
  did_id?: string;
  showDispute?: boolean;
}

export function SybilRiskIndicator({ risk, did_id, showDispute }: Props) {
  if (!risk) return null;
  const cfg = MAP[risk] ?? MAP.low;
  const Icon = cfg.icon;
  return (
    <div className="inline-flex items-center gap-2">
      <Badge variant="outline" className={`${cfg.color} border-0 gap-1`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
      {showDispute && did_id && (risk === 'high' || risk === 'critical') && (
        <DisputeDialog dispute_type="sybil_flag" target_ref={did_id} triggerLabel="Khiếu nại" />
      )}
    </div>
  );
}
