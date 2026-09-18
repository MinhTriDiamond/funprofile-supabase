import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/pdk/core/components/ui/tabs";
import { Skeleton } from "@/pdk/core/components/ui/skeleton";
import { Progress } from "@/pdk/core/components/ui/progress";
import { BadgeCard } from "./BadgeCard";
import { useBadges } from "../hooks/useBadges";

interface BadgeListProps {
  userId: string;
}

export function BadgeList({ userId }: BadgeListProps) {
  const { badges, isLoading, unlockedCount, totalCount } = useBadges(userId);

  const unlockedBadges = badges.filter((b) => b.isUnlocked);
  const lockedBadges = badges.filter((b) => !b.isUnlocked);
  const progressPercent = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="bg-card p-4 rounded-lg border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-foreground">Tiến độ huy hiệu</h2>
          <span className="text-sm text-muted-foreground">
            {unlockedCount}/{totalCount} đã đạt
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">
            Tất cả ({totalCount})
          </TabsTrigger>
          <TabsTrigger value="unlocked">
            Đã đạt ({unlockedCount})
          </TabsTrigger>
          <TabsTrigger value="locked">
            Chưa đạt ({totalCount - unlockedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {badges.map((badge) => (
              <BadgeCard
                key={badge.id}
                id={badge.id}
                name={badge.name}
                description={badge.description}
                icon={badge.icon}
                isUnlocked={badge.isUnlocked}
                unlockedAt={badge.unlockedAt}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="unlocked" className="mt-4">
          {unlockedBadges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Bạn chưa đạt được huy hiệu nào
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {unlockedBadges.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  id={badge.id}
                  name={badge.name}
                  description={badge.description}
                  icon={badge.icon}
                  isUnlocked={badge.isUnlocked}
                  unlockedAt={badge.unlockedAt}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="locked" className="mt-4">
          {lockedBadges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Bạn đã đạt được tất cả huy hiệu! 🎉
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lockedBadges.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  id={badge.id}
                  name={badge.name}
                  description={badge.description}
                  icon={badge.icon}
                  isUnlocked={badge.isUnlocked}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
