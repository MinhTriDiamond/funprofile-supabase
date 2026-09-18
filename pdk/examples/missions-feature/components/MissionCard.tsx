import { Card, CardContent } from "@/pdk/core/components/ui/card";
import { Button } from "@/pdk/core/components/ui/button";
import { Badge } from "@/pdk/core/components/ui/badge";
import { MissionProgress } from "./MissionProgress";
import { Gift, Check, Clock, Loader2 } from "lucide-react";

interface Mission {
  id: string;
  name: string;
  description: string;
  reward_amount: number;
  reward_type: string;
  target_value: number;
  mission_type: string;
}

interface Progress {
  current_value: number;
  is_completed: boolean;
  is_claimed: boolean;
}

interface MissionCardProps {
  mission: Mission;
  progress: Progress | null;
  onClaim: () => void;
  claiming?: boolean;
}

export function MissionCard({ mission, progress, onClaim, claiming }: MissionCardProps) {
  const currentValue = progress?.current_value || 0;
  const isCompleted = progress?.is_completed || false;
  const isClaimed = progress?.is_claimed || false;

  const getMissionTypeLabel = (type: string) => {
    switch (type) {
      case "daily":
        return "Hàng ngày";
      case "weekly":
        return "Hàng tuần";
      case "one_time":
        return "Một lần";
      default:
        return type;
    }
  };

  const getMissionTypeVariant = (type: string) => {
    switch (type) {
      case "daily":
        return "default" as const;
      case "weekly":
        return "secondary" as const;
      case "one_time":
        return "outline" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <Card className={isClaimed ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Mission Info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{mission.name}</h3>
              <Badge variant={getMissionTypeVariant(mission.mission_type)}>
                {getMissionTypeLabel(mission.mission_type)}
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {mission.description}
            </p>

            {/* Progress */}
            <div className="pt-2">
              <MissionProgress
                current={currentValue}
                target={mission.target_value}
                showLabel
              />
            </div>
          </div>

          {/* Right: Reward & Action */}
          <div className="flex flex-col items-end gap-2">
            {/* Reward */}
            <div className="flex items-center gap-1 text-primary">
              <Gift className="h-4 w-4" />
              <span className="font-semibold">
                {mission.reward_amount} {mission.reward_type}
              </span>
            </div>

            {/* Action Button */}
            {isClaimed ? (
              <Button variant="ghost" size="sm" disabled>
                <Check className="h-4 w-4 mr-1" />
                Đã nhận
              </Button>
            ) : isCompleted ? (
              <Button 
                size="sm" 
                onClick={onClaim}
                disabled={claiming}
              >
                {claiming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Đang nhận...
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4 mr-1" />
                    Nhận thưởng
                  </>
                )}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <Clock className="h-4 w-4 mr-1" />
                Đang tiến hành
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
