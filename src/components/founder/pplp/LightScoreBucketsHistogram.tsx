interface Props {
  buckets: number[];
}

const LABELS = ['0-20', '20-40', '40-60', '60-80', '80-100'];

export function LightScoreBucketsHistogram({ buckets }: Props) {
  const max = Math.max(...buckets, 1);
  return (
    <div>
      <p className="text-sm font-semibold mb-2">Phân bổ điểm Light Score</p>
      <div className="flex gap-1 items-end h-16">
        {LABELS.map((label, i) => {
          const h = (buckets[i] / max) * 100;
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-primary/20 rounded-t" style={{ height: `${h}%`, minHeight: 4 }}>
                <div className="w-full h-full bg-primary rounded-t" />
              </div>
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span className="text-[10px] font-medium">{buckets[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
