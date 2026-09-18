/**
 * Supabase client factory for Edge Functions.
 * Re-exports createAdminClient for consistency.
 *
 * Usage:
 *   import { createAdminClient } from "../_shared/supabase.ts";
 *   const supabase = createAdminClient();
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Resolve service-role (secret) key.
 * Sau khi rotate (2026-06-11) Lovable Cloud cung cấp SUPABASE_SECRET_KEY mới,
 * legacy SUPABASE_SERVICE_ROLE_KEY (JWT) đã bị Supabase từ chối.
 * Ưu tiên key mới, fallback key cũ để an toàn ngược.
 */
function resolveSecretKey(): string {
  return (
    Deno.env.get('SUPABASE_SECRET_KEY') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    ''
  );
}

function resolvePublishableKey(): string {
  return (
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    ''
  );
}

/**
 * Create an admin Supabase client using the secret (service_role) key.
 * Use this for server-side operations that bypass RLS.
 */
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    resolveSecretKey(),
  );
}

/**
 * Create a Supabase client using the publishable (anon) key.
 * Use this when you want RLS to apply.
 */
export function createAnonClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    resolvePublishableKey(),
  );
}
