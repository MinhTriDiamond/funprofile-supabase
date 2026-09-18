import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminSecretRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  configured: true;
}

const QK = ["admin", "secrets"] as const;

async function invoke<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-secrets", { body });
  if (error) throw new Error(error.message);
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function useAdminSecrets() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const res = await invoke<{ ok: true; secrets: AdminSecretRow[] }>({ action: "list" });
      return res.secrets ?? [];
    },
    staleTime: 30_000,
  });
}

export function useUpsertAdminSecrets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { name: string; value: string; description?: string }[]) => {
      return invoke<{ ok: true; results: { name: string; ok: boolean; error?: string }[] }>({
        action: "upsert",
        items,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteAdminSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => invoke({ action: "delete", name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export const SUGGESTED_SECRET_NAMES = [
  "AGORA_APP_ID",
  "AGORA_APP_CERTIFICATE",
  "AGORA_CUSTOMER_ID",
  "AGORA_CUSTOMER_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "RESTREAM_CLIENT_ID",
  "RESTREAM_CLIENT_SECRET",
];

export const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]{2,127}$/;
