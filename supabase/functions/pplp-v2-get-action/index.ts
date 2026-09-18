import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action_id } = await req.json();
    if (!action_id) {
      return new Response(JSON.stringify({ code: 'VALIDATION', message: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch action
    const { data: action, error: actionErr } = await supabase
      .from('pplp_v2_user_actions')
      .select('*')
      .eq('id', action_id)
      .single();

    if (actionErr || !action) {
      return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Không tìm thấy hành động' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ownership check (only owner can view)
    if (action.user_id !== user.id) {
      return new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'Bạn không có quyền xem hành động này' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch proofs
    const { data: proofs } = await supabase
      .from('pplp_v2_proofs')
      .select('id, proof_type, proof_url, file_hash, external_ref, extracted_text, raw_metadata, created_at')
      .eq('action_id', action_id)
      .order('created_at', { ascending: true });

    // Fetch validation if exists
    const { data: validation } = await supabase
      .from('pplp_v2_validations')
      .select('validation_status, final_light_score, serving_life, transparent_truth, healing_love, long_term_value, unity_over_separation, confidence, flags, validated_at')
      .eq('action_id', action_id)
      .order('validated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch mint record if exists
    const { data: mintRecord } = await supabase
      .from('pplp_v2_mint_records')
      .select('id, mint_amount_total, mint_amount_user, mint_amount_platform, release_mode, claimable_now, locked_amount, status, tx_hash')
      .eq('action_id', action_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      success: true,
      action: {
        id: action.id,
        action_type_code: action.action_type_code,
        title: action.title,
        description: action.description,
        source_url: action.source_url,
        source_platform: action.source_platform,
        status: action.status,
        raw_metadata: action.raw_metadata,
        created_at: action.created_at,
      },
      proofs: proofs || [],
      validation: validation || null,
      mint: mintRecord || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP v2 Get Action] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ code: 'INTERNAL', message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
