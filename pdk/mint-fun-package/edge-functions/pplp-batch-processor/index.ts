import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/pplp-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // This is a backend-to-backend function - verify service role authorization
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized - service role required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createAdminClient();
    const BATCH_SIZE = 50;

    // Fetch unscored actions
    const { data: pendingActions, error: fetchErr } = await supabase
      .from('pplp_actions')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!pendingActions || pendingActions.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, processed: 0, message: 'No pending actions' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[PPLP Batch] Processing ${pendingActions.length} pending actions`);

    let scored = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const action of pendingActions) {
      try {
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/pplp-score-action`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
            },
            body: JSON.stringify({ action_id: action.id }),
          }
        );

        if (response.ok) {
          scored++;
        } else {
          const errData = await response.json();
          if (errData.error !== 'Action already scored') {
            failed++;
            errors.push(`${action.id}: ${errData.error}`);
          }
        }
      } catch (err) {
        failed++;
        errors.push(`${action.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // Also expire old actions
    const { data: expiredCount } = await supabase.rpc('expire_old_mint_requests_v2');

    console.log(`[PPLP Batch] Done: ${scored} scored, ${failed} failed, ${expiredCount || 0} expired`);

    return new Response(JSON.stringify({
      success: true,
      total: pendingActions.length,
      scored,
      failed,
      expired: expiredCount || 0,
      errors: errors.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP Batch] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
