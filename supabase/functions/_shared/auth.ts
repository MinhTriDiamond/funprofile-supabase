/**
 * Auth helper for Edge Functions.
 * Extracts and verifies the user from Authorization header.
 *
 * Usage:
 *   const { user, error } = await getAuthUser(req, supabase);
 *   if (error) return error;
 */

import { corsHeaders } from "./cors.ts";

interface AuthResult {
  user: { id: string; email?: string } | null;
  error: Response | null;
}

/**
 * Extract authenticated user from request.
 * Returns { user, error } — if error is non-null, return it immediately.
 */
export async function getAuthUser(
  req: Request,
  supabase: { auth: { getUser: (token: string) => Promise<{ data: { user: unknown }; error: unknown }> } }
): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token) as {
    data: { user: { id: string; email?: string } | null };
    error: unknown;
  };

  if (error || !user) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { user, error: null };
}
