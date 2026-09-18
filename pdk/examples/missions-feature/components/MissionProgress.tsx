import { Progress } from "@/pdk/core/components/ui/progress";

interface MissionProgressProps {
  current: number;
  target: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function MissionProgress({ 
  current, 
  target, 
  showLabel = false,
  size = "md" 
}: MissionProgressProps) {
  const percentage = Math.min((current / target) * 100, 100);
  const isComplete = current >= target;

  const heightClass = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  }[size];

  return (
    <div className="space-y-1">
      <Progress 
        value={percentage} 
        className={`${heightClass} ${isComplete ? "[&>div]:bg-primary" : ""}`}
      />
      
      {showLabel && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {isComplete ? (
              <span className="text-primary font-medium">Hoàn thành!</span>
            ) : (
              `${current} / ${target}`
            )}
          </span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
    </div>
  );
}
