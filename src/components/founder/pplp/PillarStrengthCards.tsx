interface PillarStat { name: string; avg: number }

interface Props {
  strongest?: PillarStat;
  weakest?: PillarStat;
  rejected: number;
  total: number;
}

export function PillarStrengthCards({ strongest, weakest, rejected, total }: Props) {
  return (
    <div className="flex gap-4 text-sm">
      <div className="flex-1 rounded-lg border p-3 text-center">
        <p className="text-xs text-muted-foreground">Mạnh nhất</p>
        <p className="font-bold text-primary">{strongest?.name}</p>
        <p className="text-xs">trung bình {strongest?.avg}</p>
      </div>
      <div className="flex-1 rounded-lg border p-3 text-center">
        <p className="text-xs text-muted-foreground">Yếu nhất</p>
        <p className="font-bold text-destructive">{weakest?.name}</p>
        <p className="text-xs">trung bình {weakest?.avg}</p>
      </div>
      <div className="flex-1 rounded-lg border p-3 text-center">
        <p className="text-xs text-muted-foreground">Bị từ chối</p>
        <p className="font-bold">{rejected}/{total}</p>
      </div>
    </div>
  );
}
