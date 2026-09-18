import { Card, CardContent } from "@/pdk/core/components/ui/card";
import { cn } from "@/pdk/core/lib/utils";
import { formatRelativeTime } from "@/pdk/core/lib/formatters";

interface BadgeCardProps {
  id: string;
  name: string;
  description: string;
  icon: string;
  isUnlocked: boolean;
  unlockedAt?: string;
  onClick?: () => void;
}

export function BadgeCard({
  id,
  name,
  description,
  icon,
  isUnlocked,
  unlockedAt,
  onClick,
}: BadgeCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isUnlocked ? "bg-card" : "bg-muted/50 opacity-60"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Badge Icon */}
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full text-2xl",
              isUnlocked
                ? "bg-primary/10 ring-2 ring-primary/20"
                : "bg-muted"
            )}
          >
            {icon}
          </div>

          {/* Badge Info */}
          <div className="flex-1 min-w-0">
            <h3
              className={cn(
                "font-semibold truncate",
                isUnlocked ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {name}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
            {isUnlocked && unlockedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Đạt được {formatRelativeTime(unlockedAt)}
              </p>
            )}
          </div>

          {/* Unlocked indicator */}
          {isUnlocked && (
            <div className="flex-shrink-0">
              <span className="text-lg">✓</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
