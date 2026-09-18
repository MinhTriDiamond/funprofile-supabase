import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FunCoreEndpoint =
  | "profile"
  | "badges"
  | "light-score"
  | "identity-by-platform"
  | "identity-summary"
  | "federation-stats"
  | "federation-candidates"
  | "ecosystem-dashboard";

export interface FunCoreCallArgs {
  endpoint: FunCoreEndpoint;
  userId?: string;
  ecosystemIdentityId?: string;
}

export interface FunCoreResponse<T = unknown> {
  success: boolean;
  meta?: { schemaVersion?: string; traceId?: string } | null;
  data?: T;
  error?: {
    code: string;
    message: string;
    upstreamStatus?: number | null;
    traceId?: string | null;
    upstreamBody?: unknown;
  };
  _http?: { status: number; durationMs: number };
}

export async function callFunCoreProxy<T = unknown>(args: FunCoreCallArgs): Promise<FunCoreResponse<T>> {
  try {
    const { data, error } = await supabase.functions.invoke("fun-core-proxy", { body: args });
    if (error) {
      return { success: false, error: { code: "INVOKE_ERROR", message: error.message ?? "Không gọi được proxy." } };
    }
    return data as FunCoreResponse<T>;
  } catch (e: any) {
    return { success: false, error: { code: "CLIENT_ERROR", message: e?.message ?? String(e) } };
  }
}

/** Backwards-compatible wrapper hook (giữ chữ ký cũ cho code legacy). */
export function useFunCoreProxy() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const call = useCallback(async (endpoint: FunCoreEndpoint, userId: string): Promise<FunCoreResponse> => {
    setLoading((s) => ({ ...s, [endpoint]: true }));
    try {
      return await callFunCoreProxy({ endpoint, userId });
    } finally {
      setLoading((s) => ({ ...s, [endpoint]: false }));
    }
  }, []);

  return { call, loading };
}
