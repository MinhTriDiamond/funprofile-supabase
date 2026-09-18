/**
 * useEcosystemIdentity — đọc Ecosystem Identity của 1 user từ FUN Core.
 *
 * - Gọi proxy endpoint `identity-by-platform` (self hoặc admin).
 * - Trả về { data, isLoading, error, notReady }.
 * - `notReady = true` khi FUN Core trả UPSTREAM_NOT_READY → UI hiện trạng thái "đang chuẩn bị".
 * - KHÔNG fake data.
 */
import { useQuery } from "@tanstack/react-query";
import { callFunCoreProxy } from "@/hooks/useFunCoreProxy";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export interface LinkedPlatform {
  platform_slug: string;
  platform_user_id: string;
  link_status: string;
  link_method?: string | null;
  linked_at?: string | null;
  source_event_id?: number | null;
}

export interface EcosystemIdentityData {
  ecosystem_identity_id: string;
  status: string;
  primary_did?: string | null;
  merged_into?: string | null;
  linked_platforms: LinkedPlatform[];
  freshness?: {
    updated_at?: string | null;
    link_count?: number | null;
  } | null;
  trace_id?: string | null;
}

export interface UseEcosystemIdentityResult {
  data: EcosystemIdentityData | null;
  isLoading: boolean;
  isError: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  notReady: boolean;
  notFound: boolean;
}


export function useEcosystemIdentity(targetUserId?: string | null): UseEcosystemIdentityResult {
  const { userId: currentUserId } = useCurrentUser();
  const userId = (targetUserId ?? currentUserId ?? "").toLowerCase();

  const q = useQuery({
    queryKey: ["ecosystem-identity", userId],
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      return await callFunCoreProxy<EcosystemIdentityData>({
        endpoint: "identity-by-platform",
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
    return { data: resp.data as EcosystemIdentityData, isLoading: false, isError: false, errorCode: null, errorMessage: null, notReady: false, notFound: false };
  }

  const code = resp.error?.code ?? "UNKNOWN";
  const notFound = code === "IDENTITY_NOT_FOUND";
  const notReady = code === "UPSTREAM_NOT_READY";
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
