/**
 * Media Guard Edge Function
 * 
 * Anti-hotlinking protection for FUN Profile media assets.
 * Validates Referer header to prevent unauthorized bandwidth usage.
 * 
 * Allowed origins:
 * - fun.rich, www.fun.rich (production)
 * - funprofile.lovable.app (preview)
 * - *.lovable.app (Lovable preview domains)
 * - *.vercel.app (Vercel preview)
 * - Direct access (no Referer) - allowed for browser/app loads
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Whitelist of allowed domains
const ALLOWED_ORIGINS = [
  'fun.rich',
  'www.fun.rich',
  'funprofile.lovable.app',
  'localhost',
  '127.0.0.1',
];

// Suffix patterns for wildcard matching
const ALLOWED_SUFFIXES = [
  '.lovable.app',
  '.vercel.app',
  '.lovable.dev',
];

/**
 * Check if a hostname is allowed to access media
 */
function isAllowedOrigin(hostname: string): boolean {
  // Check exact match
  if (ALLOWED_ORIGINS.includes(hostname)) {
    return true;
  }
  
  // Check suffix patterns (wildcard subdomains)
  for (const suffix of ALLOWED_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract hostname from Referer URL safely
 */
function getRefererHost(referer: string): string | null {
  try {
    const url = new URL(referer);
    return url.hostname;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const referer = req.headers.get('Referer');
    const origin = req.headers.get('Origin');
    
    // Allow requests with no Referer (direct browser access, mobile apps, etc.)
    // This is necessary for images to load in browser tabs, downloads, etc.
    if (!referer && !origin) {
      return new Response(
        JSON.stringify({ 
          allowed: true, 
          reason: 'Direct access permitted',
          timestamp: new Date().toISOString(),
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
    
    // Check Referer header
    let isAllowed = false;
    let checkedHost = '';
    
    if (referer) {
      const refererHost = getRefererHost(referer);
      if (refererHost) {
        checkedHost = refererHost;
        isAllowed = isAllowedOrigin(refererHost);
      }
    }
    
    // Also check Origin header (for CORS requests)
    if (!isAllowed && origin) {
      const originHost = getRefererHost(origin);
      if (originHost) {
        checkedHost = originHost;
        isAllowed = isAllowedOrigin(originHost);
      }
    }
    
    if (!isAllowed) {
      console.warn(`Hotlinking blocked from: ${checkedHost || 'unknown'}`);
      return new Response(
        JSON.stringify({ 
          error: 'Forbidden',
          message: 'Access to FUN Profile media from this domain is not permitted.',
          blocked_host: checkedHost,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }
    
    // Request is allowed
    console.log(`Media access allowed from: ${checkedHost}`);
    return new Response(
      JSON.stringify({ 
        allowed: true,
        host: checkedHost,
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in media-guard:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
