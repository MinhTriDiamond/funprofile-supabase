import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

const sybilColor: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  critical: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const sybilLabel: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

export function SybilRiskList({ bySybil, levels }: { bySybil: Record<string, number>; levels: readonly string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500" /> Nguy cơ Sybil
      </p>
      <div className="space-y-1.5">
        {levels.map((s) => (
          <div key={s} className="flex justify-between items-center text-sm">
            <Badge variant="outline" className={sybilColor[s]}>{sybilLabel[s] || s}</Badge>
            <span className="font-medium tabular-nums">{Number(bySybil[s] || 0).toLocaleString('vi-VN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
