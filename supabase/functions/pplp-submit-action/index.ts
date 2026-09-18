import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { submitPPLPAction, createAdminClient } from "../_shared/pplp-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check banned status
    const { data: banCheck } = await supabase
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      platform_id = 'fun_profile',
      action_type,
      target_id,
      metadata = {},
      impact = {},
      integrity = {},
    } = body;

    if (!action_type) {
      return new Response(JSON.stringify({ error: 'action_type is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enrich metadata with defaults
    const enrichedMetadata = {
      has_evidence: true,
      verified: true,
      sentiment_score: 0.75,
      ...metadata,
    };

    const enrichedImpact = {
      beneficiaries: 1,
      outcome: 'positive',
      promotes_unity: true,
      healing_effect: true,
      ...impact,
    };

    const enrichedIntegrity = {
      source_verified: true,
      anti_sybil_score: 0.85,
      ...integrity,
    };

    console.log(`[PPLP Submit] User ${user.id} submitting ${action_type} on ${platform_id}`);

    const result = await submitPPLPAction({
      platform_id,
      action_type,
      actor_id: user.id,
      target_id,
      metadata: enrichedMetadata,
      impact: enrichedImpact,
      integrity: enrichedIntegrity,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.error === 'Duplicate action within 24h' ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-trigger scoring
    try {
      const scoreResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/pplp-score-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
          },
          body: JSON.stringify({ action_id: result.action_id }),
        }
      );
      const scoreData = await scoreResponse.json();
      console.log(`[PPLP Submit] Auto-score result:`, scoreData);
    } catch (scoreErr) {
      console.warn('[PPLP Submit] Auto-score failed (will be batch processed):', scoreErr);
    }

    return new Response(JSON.stringify({
      success: true,
      action_id: result.action_id,
      evidence_hash: result.evidence_hash,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP Submit] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
