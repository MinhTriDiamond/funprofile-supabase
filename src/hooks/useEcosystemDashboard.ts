/**
 * useEcosystemDashboard — Phase 6D.
 * Đọc unified dashboard (Trust + Light Score + PPLP + Rewards + Badges + Linked Platforms)
 * của 1 user từ FUN Core qua secure proxy.
 *
 * - KHÔNG fake data.
 * - `notReady = true` khi FUN Core trả UPSTREAM_NOT_READY (6A chưa lên prod) → UI hiện skeleton.
 * - `notFound` khi chưa có Ecosystem Identity cho user.
 */
import { useQuery } from "@tanstack/react-query";
import { callFunCoreProxy } from "@/hooks/useFunCoreProxy";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { LinkedPlatform } from "@/hooks/useEcosystemIdentity";

export interface TrustBlock {
  score: number | null;
  level: number | null;
  band: string | null;
}
export interface LightScoreBlock {
  score: number | null;
  band: string | null;
}
export interface PplpBlock {
  xp: number | null;
  level: number | null;
  band: string | null;
}
export interface RewardsBlock {
  points: number | null;
  last_reason: string | null;
}
export interface BadgeItem {
  id: string;
  name: string;
  icon_url?: string | null;
  awarded_at?: string | null;
}

export interface EcosystemDashboardData {
  ecosystem_identity_id?: string | null;
  identity?: {
    display_name?: string | null;
    did?: string | null;
  } | null;
  trust?: TrustBlock | null;
  light_score?: LightScoreBlock | null;
  pplp?: PplpBlock | null;
  rewards?: RewardsBlock | null;
  badges?: BadgeItem[] | null;
  linked_platforms?: LinkedPlatform[] | null;
  updated_at?: string | null;
}

export interface UseEcosystemDashboardResult {
  data: EcosystemDashboardData | null;
  isLoading: boolean;
  isError: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  notReady: boolean;
  notFound: boolean;
}

export function useEcosystemDashboard(targetUserId?: string | null): UseEcosystemDashboardResult {
  const { userId: currentUserId } = useCurrentUser();
  const userId = (targetUserId ?? currentUserId ?? "").toLowerCase();

  const q = useQuery({
    queryKey: ["ecosystem-dashboard", userId],
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      return await callFunCoreProxy<EcosystemDashboardData>({
        endpoint: "ecosystem-dashboard",
        userId,
      });
    },
  });

  if (q.isLoading) {
    return { data: null, isLoading: true, isError: false, errorCode: null, errorMessage: null, notReady: false, notFound: false };
  }

  const resp = q.data;
  if (!resp) {
    return { data: null, isLoading: false, isError: false, errorCode: null, errorMessage: null, notReady: false, notFound: false };
  }

  if (resp.success && resp.data) {
    return { data: resp.data as EcosystemDashboardData, isLoading: false, isError: false, errorCode: null, errorMessage: null, notReady: false, notFound: false };
  }

  const code = resp.error?.code ?? "UNKNOWN";
  const notFound = code === "IDENTITY_NOT_FOUND";
  // Khi FUN Core 6A chưa lên hoặc proxy chưa whitelist endpoint, đối xử như "đang chuẩn bị".
  const notReady = code === "UPSTREAM_NOT_READY"
    || code === "UPSTREAM_404"
    || code === "VALIDATION_ERROR"; // endpoint mới — proxy cũ chưa biết → coi như not ready
  return {
    data: null,
    isLoading: false,
    isError: !notFound && !notReady,
    errorCode: code,
    errorMessage: resp.error?.message ?? null,
    notReady,
    notFound,
  };
}
