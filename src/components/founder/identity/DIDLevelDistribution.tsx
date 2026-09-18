import { Fingerprint } from 'lucide-react';

interface Props {
  byLevel: Record<string, number>;
  levels: readonly string[];
}

export function DIDLevelDistribution({ byLevel, levels }: Props) {
  const max = Math.max(1, ...Object.values(byLevel).map(Number));
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Fingerprint className="h-4 w-4" /> Phân bố DID theo cấp độ
      </p>
      <div className="space-y-1.5">
        {levels.map((lvl) => {
          const v = Number(byLevel[lvl] || 0);
          const pct = (v / max) * 100;
          return (
            <div key={lvl} className="flex items-center gap-3 text-sm">
              <span className="w-8 font-mono text-muted-foreground">{lvl}</span>
              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-16 text-right font-medium tabular-nums">{v.toLocaleString('vi-VN')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
