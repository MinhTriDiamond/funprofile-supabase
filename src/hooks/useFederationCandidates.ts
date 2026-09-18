/**
 * useFederationCandidates — admin-only. Đọc danh sách candidate merge từ FUN Core.
 * Endpoint: /api/v1/admin/identity/candidates (qua proxy).
 * Phase 1: chỉ đọc. Action approve/reject/relink chờ FUN Core expose API chính thức.
 */
import { useQuery } from "@tanstack/react-query";
import { callFunCoreProxy } from "@/hooks/useFunCoreProxy";
import { useAdminRole } from "@/hooks/useAdminRole";

export interface FederationCandidate {
  candidate_id: string;
  identity_a?: string;
  identity_b?: string;
  match_reason?: string;
  confidence?: number;
  linked_platforms_a?: string[];
  linked_platforms_b?: string[];
  created_at?: string;
  [k: string]: unknown;
}

export interface FederationCandidatesPayload {
  candidates: FederationCandidate[];
  total?: number;
}

export function useFederationCandidates() {
  const { isAdmin } = useAdminRole();

  const q = useQuery({
    queryKey: ["federation-candidates"],
    enabled: !!isAdmin,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      return await callFunCoreProxy<FederationCandidatesPayload | FederationCandidate[]>({
        endpoint: "federation-candidates",
      });
    },
  });

  const resp = q.data;
  const ok = !!resp?.success && !!resp?.data;
  const raw = ok ? resp!.data : null;

  // Chấp nhận cả 2 dạng response: { candidates: [...] } HOẶC [ ... ]
  const candidates: FederationCandidate[] = Array.isArray(raw)
    ? raw
    : (raw as FederationCandidatesPayload | null)?.candidates ?? [];

  const code = resp?.success ? null : (resp?.error?.code ?? null);

  return {
    candidates,
    isLoading: q.isLoading,
    isError: !!resp && !resp.success,
    errorCode: code,
    errorMessage: resp?.error?.message ?? null,
    notReady: code === "UPSTREAM_NOT_READY",
    refetch: q.refetch,
  };
}
