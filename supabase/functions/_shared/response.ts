/**
 * Standard response helpers for Edge Functions.
 *
 * Usage:
 *   return jsonOk({ data: result });
 *   return jsonError('Not found', 404);
 */

import { corsHeaders } from "./cors.ts";

interface SuccessPayload {
  success?: boolean;
  [key: string]: unknown;
}

/**
 * Return a JSON success response with CORS headers.
 */
export function jsonOk(data: SuccessPayload, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Return a JSON error response with CORS headers.
 */
export function jsonError(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
