import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FunCorePilotFlag {
  enabled: boolean;
  allowedUserIds: string[];
}

async function fetchFlag(): Promise<FunCorePilotFlag> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["fun_core_pilot_enabled", "fun_core_pilot_allowed_user_ids"]);

  if (error) {
    return { enabled: false, allowedUserIds: [] };
  }

  const map = new Map((data ?? []).map((r: any) => [r.key, r.value as string | null]));
  const enabled = (map.get("fun_core_pilot_enabled") ?? "false").toLowerCase() === "true";
  let allowed: string[] = [];
  try {
    const raw = map.get("fun_core_pilot_allowed_user_ids");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) allowed = parsed.map((s) => String(s).toLowerCase());
    }
  } catch { /* ignore */ }
  return { enabled, allowedUserIds: allowed };
}

export function useFunCorePilotFlag() {
  return useQuery({
    queryKey: ["fun-core-pilot-flag"],
    queryFn: fetchFlag,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function isUserInPilot(flag: FunCorePilotFlag | undefined, userId: string | null | undefined): boolean {
  if (!flag || !flag.enabled || !userId) return false;
  if (flag.allowedUserIds.length === 0) return false;
  return flag.allowedUserIds.includes(userId.toLowerCase());
}
