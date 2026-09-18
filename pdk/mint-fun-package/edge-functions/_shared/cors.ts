/**
 * Standard CORS headers for Edge Functions called from web apps.
 * Usage: import { corsHeaders, handleCors } from "../_shared/cors.ts";
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Handle CORS preflight request.
 * Returns a Response if method is OPTIONS, otherwise null.
 *
 * Usage:
 *   const cors = handleCors(req);
 *   if (cors) return cors;
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
