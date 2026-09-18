import { useState } from "react";
import { MissionCard } from "./MissionCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/pdk/core/components/ui/tabs";
import { Skeleton } from "@/pdk/core/components/ui/skeleton";
import { Card, CardContent } from "@/pdk/core/components/ui/card";
import { Target } from "lucide-react";

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
  mission_id: string;
  current_value: number;
  is_completed: boolean;
  is_claimed: boolean;
}

interface MissionListProps {
  missions: Mission[];
  progresses: Progress[];
  onClaimReward: (missionId: string) => Promise<void>;
  loading?: boolean;
}

export function MissionList({ 
  missions, 
  progresses, 
  onClaimReward,
  loading 
}: MissionListProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const getProgressForMission = (missionId: string) => {
    return progresses.find(p => p.mission_id === missionId) || null;
  };

  const handleClaim = async (missionId: string) => {
    setClaimingId(missionId);
    try {
      await onClaimReward(missionId);
    } finally {
      setClaimingId(null);
    }
  };

  const filterMissions = (type: string) => {
    if (type === "all") return missions;
    return missions.filter(m => m.mission_type === type);
  };

  const getCompletedCount = (missionsList: Mission[]) => {
    return missionsList.filter(m => {
      const progress = getProgressForMission(m.id);
      return progress?.is_completed;
    }).length;
  };

  if (loading) {
    return <MissionListSkeleton />;
  }

  if (missions.length === 0) {
    return <MissionListEmpty />;
  }

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="all">
          Tất cả ({missions.length})
        </TabsTrigger>
        <TabsTrigger value="daily">
          Hàng ngày
        </TabsTrigger>
        <TabsTrigger value="weekly">
          Hàng tuần
        </TabsTrigger>
        <TabsTrigger value="one_time">
          Một lần
        </TabsTrigger>
      </TabsList>

      {["all", "daily", "weekly", "one_time"].map((type) => {
        const filteredMissions = filterMissions(type);
        const completedCount = getCompletedCount(filteredMissions);

        return (
          <TabsContent key={type} value={type} className="space-y-4">
            {/* Summary */}
            <div className="text-sm text-muted-foreground">
              Hoàn thành: {completedCount}/{filteredMissions.length} nhiệm vụ
            </div>

            {/* Mission Cards */}
            <div className="space-y-3">
              {filteredMissions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  progress={getProgressForMission(mission.id)}
                  onClaim={() => handleClaim(mission.id)}
                  claiming={claimingId === mission.id}
                />
              ))}
            </div>

            {filteredMissions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Không có nhiệm vụ nào trong danh mục này.
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function MissionListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2 w-full mt-4" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MissionListEmpty() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Target className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Chưa có nhiệm vụ</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Các nhiệm vụ sẽ xuất hiện ở đây. Quay lại sau nhé!
        </p>
      </CardContent>
    </Card>
  );
}
