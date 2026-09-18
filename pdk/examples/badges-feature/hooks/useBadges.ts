import { useState, useEffect } from "react";
import { useToast } from "@/pdk/core/hooks/use-toast";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  isUnlocked: boolean;
  unlockedAt?: string;
  requirement?: string;
}

// Định nghĩa các huy hiệu có sẵn
const BADGE_DEFINITIONS: Omit<Badge, "isUnlocked" | "unlockedAt">[] = [
  {
    id: "first-post",
    name: "Người tiên phong",
    description: "Đăng bài viết đầu tiên",
    icon: "🎉",
    category: "posts",
    requirement: "posts >= 1",
  },
  {
    id: "social-butterfly",
    name: "Bướm xã hội",
    description: "Kết bạn với 10 người",
    icon: "🦋",
    category: "social",
    requirement: "friends >= 10",
  },
  {
    id: "popular",
    name: "Nổi tiếng",
    description: "Nhận 100 reactions trên bài viết",
    icon: "⭐",
    category: "engagement",
    requirement: "reactions_received >= 100",
  },
  {
    id: "storyteller",
    name: "Người kể chuyện",
    description: "Đăng 10 bài viết",
    icon: "📖",
    category: "posts",
    requirement: "posts >= 10",
  },
  {
    id: "early-bird",
    name: "Chim sớm",
    description: "Đăng nhập lúc 5h sáng",
    icon: "🐦",
    category: "special",
    requirement: "login_at_5am",
  },
  {
    id: "night-owl",
    name: "Cú đêm",
    description: "Đăng nhập lúc 2h sáng",
    icon: "🦉",
    category: "special",
    requirement: "login_at_2am",
  },
  {
    id: "philanthropist",
    name: "Nhà từ thiện",
    description: "Tặng 1000 CAMLY cho người khác",
    icon: "💝",
    category: "rewards",
    requirement: "camly_given >= 1000",
  },
  {
    id: "whale",
    name: "Cá voi",
    description: "Sở hữu 10,000 CAMLY",
    icon: "🐋",
    category: "rewards",
    requirement: "camly_balance >= 10000",
  },
];

export function useBadges(userId: string) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    fetchBadges();
  }, [userId]);

  const fetchBadges = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual Supabase query
      // const { data: userBadges, error } = await supabase
      //   .from('badge_awards')
      //   .select('badge_id, awarded_at')
      //   .eq('user_id', userId);

      // Mock: Simulate some unlocked badges
      const mockUnlockedIds = ["first-post", "social-butterfly"];

      const badgesWithStatus: Badge[] = BADGE_DEFINITIONS.map((def) => ({
        ...def,
        isUnlocked: mockUnlockedIds.includes(def.id),
        unlockedAt: mockUnlockedIds.includes(def.id)
          ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
      }));

      // Sort: unlocked first, then by name
      badgesWithStatus.sort((a, b) => {
        if (a.isUnlocked && !b.isUnlocked) return -1;
        if (!a.isUnlocked && b.isUnlocked) return 1;
        return a.name.localeCompare(b.name);
      });

      setBadges(badgesWithStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải huy hiệu";
      setError(message);
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unlockedCount = badges.filter((b) => b.isUnlocked).length;
  const totalCount = badges.length;

  return {
    badges,
    isLoading,
    error,
    unlockedCount,
    totalCount,
    refetch: fetchBadges,
  };
}
