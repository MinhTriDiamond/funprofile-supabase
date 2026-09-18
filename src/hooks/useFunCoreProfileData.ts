import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FunCoreEndpoint, FunCoreResponse } from "@/hooks/useFunCoreProxy";
import { useFunCorePilotFlag, isUserInPilot } from "@/hooks/useFunCorePilotFlag";
import { useAdminRole } from "@/hooks/useAdminRole";

async function callProxy(endpoint: FunCoreEndpoint, userId: string): Promise<FunCoreResponse> {
  const { data, error } = await supabase.functions.invoke("fun-core-proxy", {
    body: { endpoint, userId },
  });
  if (error) {
    return { success: false, error: { code: "INVOKE_ERROR", message: error.message ?? "Không gọi được proxy." } };
  }
  return data as FunCoreResponse;
}

function useFunCoreEndpoint(endpoint: FunCoreEndpoint, userId: string | null | undefined) {
  const { data: flag } = useFunCorePilotFlag();
  const { isAdmin } = useAdminRole();
  const enabled = !!userId && isAdmin && isUserInPilot(flag, userId);

  return useQuery({
    queryKey: ["fun-core-data", endpoint, userId?.toLowerCase()],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: (count, err: any) => {
      // không retry trên 4xx envelope
      if (count >= 1) return false;
      return true;
    },
    queryFn: async () => {
      if (!userId) throw new Error("missing userId");
      return await callProxy(endpoint, userId);
    },
  });
}

export const useFunCoreProfile = (userId: string | null | undefined) => useFunCoreEndpoint("profile", userId);
export const useFunCoreBadges = (userId: string | null | undefined) => useFunCoreEndpoint("badges", userId);
export const useFunCoreLightScore = (userId: string | null | undefined) => useFunCoreEndpoint("light-score", userId);
