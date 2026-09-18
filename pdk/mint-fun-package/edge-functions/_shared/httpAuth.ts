import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Sau rotate API key (2026-06-11) Lovable Cloud cấp SUPABASE_SECRET_KEY +
 * SUPABASE_PUBLISHABLE_KEY mới; legacy SERVICE_ROLE/ANON đã bị disable.
 * Ưu tiên key mới, fallback key cũ.
 */
function getServiceKey(): string {
  return Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
function getAnonKey(): string {
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    getServiceKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createAuthedClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    getAnonKey(),
    {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error: unknown): { message: string; stack?: string; code?: string; status?: number; details?: unknown } {
  if (error instanceof HttpError) {
    return { message: error.message, stack: error.stack, code: error.code, status: error.status, details: error.details };
  }
  if (error instanceof Error) {
    return { message: error.message || error.name || 'Error', stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    const message = typeof anyErr.message === 'string' ? anyErr.message
      : typeof anyErr.error === 'string' ? anyErr.error
      : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
    return { message, details: error };
  }
  return { message: String(error) };
}

export async function requireUser(req: Request): Promise<{ id: string; email?: string | null }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Thiếu Authorization header');
  }
  const token = authHeader.slice(7).trim();
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Token rỗng');

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    getAnonKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Try getClaims first (signing-keys flow), fall back to getUser
  try {
    const anyAuth = (client.auth as unknown) as { getClaims?: (t: string) => Promise<{ data: { claims?: { sub?: string; email?: string | null } } | null; error: unknown }> };
    if (typeof anyAuth.getClaims === 'function') {
      const { data, error } = await anyAuth.getClaims(token);
      if (!error && data?.claims?.sub) {
        return { id: data.claims.sub, email: data.claims.email ?? null };
      }
    }
  } catch {
    // fall through
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const msg = error instanceof Error ? error.message : (error ? normalizeError(error).message : 'Unauthorized');
    throw new HttpError(401, 'UNAUTHORIZED', msg || 'Unauthorized');
  }
  return { id: data.user.id, email: data.user.email };
}
