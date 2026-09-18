// Shared KYC access guard for Sumsub edge functions.
// Implements the 2-layer test gate + freeze switch (Plan v3).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface KycAccessResult {
  allowed: boolean;
  status: number;            // HTTP status to return when !allowed
  error?: string;            // machine code
  message?: string;          // user-facing VN message
  isTest: boolean;
  frozen: boolean;
}

async function getFlag(
  supabase: SupabaseClient,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data) return fallback;
  const v = String(data.value).toLowerCase();
  return v === "true" || v === "1";
}

export async function checkKycAccess(opts: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  enforceFreeze?: boolean; // true for create-applicant/get-access-token, false for get-status
}): Promise<KycAccessResult> {
  const { supabaseAdmin, userId, enforceFreeze = true } = opts;

  const [enabled, testMode, freeze] = await Promise.all([
    getFlag(supabaseAdmin, "sumsub_kyc_enabled", false),
    getFlag(supabaseAdmin, "sumsub_kyc_test_mode", true),
    getFlag(supabaseAdmin, "sumsub_kyc_freeze", false),
  ]);

  let allowed = false;
  let isTest = false;

  if (enabled) {
    allowed = true;
    isTest = false;
  } else if (testMode) {
    const { data: testUser } = await supabaseAdmin
      .from("kyc_test_users")
      .select("user_id")
      .eq("user_id", userId)
      .eq("enabled", true)
      .maybeSingle();
    if (testUser) {
      allowed = true;
      isTest = true;
    }
  }

  if (!allowed) {
    return {
      allowed: false,
      status: 403,
      error: "KYC_NOT_AVAILABLE",
      message: "Tính năng xác minh danh tính hiện chỉ mở cho nhóm test nội bộ.",
      isTest: false,
      frozen: freeze,
    };
  }

  if (enforceFreeze && freeze) {
    return {
      allowed: false,
      status: 423,
      error: "KYC_FROZEN",
      message: "Đang tạm dừng nhận hồ sơ KYC mới. Vui lòng quay lại sau.",
      isTest,
      frozen: true,
    };
  }

  return { allowed: true, status: 200, isTest, frozen: freeze };
}

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
    { auth: { persistSession: false } },
  );
}

export async function getAuthedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY"))!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export async function sumsubSign(opts: {
  method: string;
  path: string;
  body?: string;
}): Promise<Record<string, string>> {
  const { method, path, body = "" } = opts;
  const ts = Math.floor(Date.now() / 1000).toString();
  const appToken = Deno.env.get("SUMSUB_APP_TOKEN")!;
  const secret = Deno.env.get("SUMSUB_SECRET_KEY")!;
  const data = ts + method.toUpperCase() + path + body;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    "X-App-Token": appToken,
    "X-App-Access-Sig": sigHex,
    "X-App-Access-Ts": ts,
  };
}

export function sumsubBaseUrl(): string {
  return Deno.env.get("SUMSUB_BASE_URL") || "https://api.sumsub.com";
}

export function sumsubEnvironment(): "sandbox" | "production" {
  const v = (Deno.env.get("SUMSUB_ENVIRONMENT") || "sandbox").toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

export function externalUserIdOf(userId: string): string {
  return `fun_profile:${userId}`;
}
