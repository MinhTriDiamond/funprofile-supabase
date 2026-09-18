/**
 * useFederationStats — admin-only. Đọc tổng quan Federation từ FUN Core.
 * Endpoint: /api/v1/admin/federation/stats (qua proxy).
 * Khi Core chưa expose → notReady = true (không fake data).
 */
import { useQuery } from "@tanstack/react-query";
import { callFunCoreProxy } from "@/hooks/useFunCoreProxy";
import { useAdminRole } from "@/hooks/useAdminRole";

export interface FederationStats {
  total_identities?: number;
  total_linked_platforms?: number;
  total_candidates?: number;
  total_conflicts?: number;
  consumer_lag_seconds?: number;
  events_last_24h?: number;
  events_per_day?: Array<{ date: string; count: number }>;
  // Cho phép field bổ sung khi Core mở rộng response.
  [k: string]: unknown;
}

export function useFederationStats() {
  const { isAdmin } = useAdminRole();

  const q = useQuery({
    queryKey: ["federation-stats"],
    enabled: !!isAdmin,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      return await callFunCoreProxy<FederationStats>({ endpoint: "federation-stats" });
    },
  });

  const resp = q.data;
  const ok = !!resp?.success && !!resp?.data;
  const code = resp?.success ? null : (resp?.error?.code ?? null);

  return {
    data: ok ? (resp!.data as FederationStats) : null,
    isLoading: q.isLoading,
    isError: !!resp && !resp.success,
    errorCode: code,
    errorMessage: resp?.error?.message ?? null,
    notReady: code === "UPSTREAM_NOT_READY",
    refetch: q.refetch,
  };
}
