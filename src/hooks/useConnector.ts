import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMyConnector(userId?: string) {
  return useQuery({
    queryKey: ["my-connector", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const [{ data: window }, { data: link }] = await Promise.all([
        supabase
          .from("connector_windows")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("connector_links")
          .select(
            "id,connector_user_id,tx_hash,chain,token_symbol,amount,matched_at,status"
          )
          .eq("new_user_id", userId)
          .maybeSingle(),
      ]);

      let connectorProfile = null as any;
      if (link?.connector_user_id) {
        const { data } = await supabase
          .from("profiles")
          .select("id,username,display_name,full_name,avatar_url,fun_id,soul_level")
          .eq("id", link.connector_user_id)
          .maybeSingle();
        connectorProfile = data;
      }

      return { window, link, connectorProfile };
    },
    staleTime: 30_000,
  });
}

export function useUsersIConnect(userId?: string) {
  return useQuery({
    queryKey: ["users-i-connect", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data: links } = await supabase
        .from("connector_links")
        .select(
          "id,new_user_id,tx_hash,token_symbol,amount,matched_at,status"
        )
        .eq("connector_user_id", userId)
        .order("matched_at", { ascending: false });
      if (!links || links.length === 0) return [];

      const ids = links.map((l) => l.new_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,display_name,full_name,avatar_url,fun_id,soul_level")
        .in("id", ids);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

      const { data: events } = await supabase
        .from("connector_growth_events")
        .select("link_id,milestone,score_delta,awarded_at")
        .in("link_id", links.map((l) => l.id));
      const emap = new Map<string, any[]>();
      for (const e of events ?? []) {
        const arr = emap.get(e.link_id) ?? [];
        arr.push(e);
        emap.set(e.link_id, arr);
      }

      return links.map((l) => ({
        ...l,
        new_user: pmap.get(l.new_user_id) ?? null,
        growth_events: emap.get(l.id) ?? [],
      }));
    },
    staleTime: 30_000,
  });
}

export function useConnectorStats(userId?: string) {
  return useQuery({
    queryKey: ["connector-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { count: 0 };
      const { count } = await supabase
        .from("connector_links")
        .select("id", { count: "exact", head: true })
        .eq("connector_user_id", userId)
        .eq("status", "confirmed");
      return { count: count ?? 0 };
    },
    staleTime: 60_000,
  });
}
