/**
 * @deprecated This function references legacy tables (pplp_actions, pplp_scores)
 * which are no longer used in the current epoch-based minting system.
 * 
 * Current flow:
 *   pplp-evaluate → light_actions → pplp-epoch-snapshot → mint_allocations → pplp-mint-fun
 * 
 * This endpoint returns 410 Gone to inform callers to use the new epoch flow.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    error: 'This endpoint is deprecated.',
    message: 'pplp-authorize-mint has been replaced by the epoch-based minting system. ' +
      'Use pplp-epoch-snapshot to create allocations, then pplp-mint-fun to claim.',
    migration_guide: {
      step_1: 'Admin runs pplp-epoch-snapshot to snapshot monthly light scores',
      step_2: 'Users claim via pplp-mint-fun with allocation_id',
      step_3: 'Admin signs via multisig attester flow',
      step_4: 'Admin submits on-chain via lockWithPPLP',
    },
  }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
