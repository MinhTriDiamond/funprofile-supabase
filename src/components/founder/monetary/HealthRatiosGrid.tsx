import { Progress } from '@/components/ui/progress';

interface Ratio {
  icon: React.ReactNode;
  label: string;
  value: number;
  ideal: string;
  inverse?: boolean;
}

function RatioCard({ icon, label, value, ideal, inverse }: Ratio) {
  const pct = Math.min(100, value * 100);
  const isHealthy = inverse ? value < 0.1 : value >= 0.5;
  return (
    <div className="p-3 rounded-lg border bg-card space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-lg font-semibold ${isHealthy ? 'text-emerald-600' : 'text-amber-600'}`}>
        {value.toFixed(2)}
      </div>
      <Progress value={pct} className="h-1" />
      <div className="text-[10px] text-muted-foreground">Lý tưởng {ideal}</div>
    </div>
  );
}

export function HealthRatiosGrid({ ratios }: { ratios: Ratio[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {ratios.map((r) => (
        <RatioCard key={r.label} {...r} />
      ))}
    </div>
  );
}
