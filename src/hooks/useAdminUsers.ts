import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { OWN_PROFILE_COLUMNS } from "@/lib/profileColumns";

export interface AdminUserData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  pending_reward: number;
  approved_reward: number;
  wallet_address: string | null;
  reward_status: string;
  created_at: string;
  bio?: string | null;
  posts_count?: number;
  comments_count?: number;
  reactions_count?: number;
  email?: string | null;
}

const PAGE_SIZE = 1000;

const fetchAdminUsers = async (adminUserId: string | null): Promise<AdminUserData[]> => {
  // Paginate to bypass PostgREST default 1000-row limit
  const profiles: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("profiles")
      .select(OWN_PROFILE_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    profiles.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  if (profiles.length === 0) return [];

  const { data: rewardsData } = await supabase.rpc("get_user_rewards", { limit_count: Math.max(profiles.length, 2000) });

  const rewardsMap = new Map(rewardsData?.map((r: Record<string, unknown>) => [r.id as string, r]) || []);

  // Fetch emails for admin using passed-in userId
  let emailsMap = new Map<string, string>();
  if (adminUserId) {
    const { data: emailsData } = await supabase.rpc("get_user_emails_for_admin", { p_admin_id: adminUserId });
    if (emailsData) {
      emailsMap = new Map((emailsData as Array<{ user_id: string; email: string }>).map((e) => [e.user_id, e.email]));
    }
  }

  return profiles.map((profile) => {
    const rewardInfo = rewardsMap.get(profile.id) as Record<string, unknown> | undefined;
    return {
      ...profile,
      pending_reward: profile.pending_reward || 0,
      approved_reward: profile.approved_reward || 0,
      wallet_address: profile.wallet_address || null,
      reward_status: profile.reward_status || "pending",
      posts_count: Number(rewardInfo?.posts_count) || 0,
      comments_count: Number(rewardInfo?.comments_count) || 0,
      reactions_count: Number(rewardInfo?.reactions_count) || 0,
      email: emailsMap.get(profile.id) || null,
    };
  });
};

export const ADMIN_USERS_KEY = ["admin-users"];

export const useAdminUsers = (adminUserId?: string | null) => {
  return useQuery({
    queryKey: [...ADMIN_USERS_KEY, adminUserId],
    queryFn: () => fetchAdminUsers(adminUserId ?? null),
    staleTime: 2 * 60 * 1000,
    enabled: !!adminUserId,
  });
};

export const invalidateAdminData = () => {
  queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
};
