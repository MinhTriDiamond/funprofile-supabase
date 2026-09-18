import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_PROOF_TYPES = ['link', 'video', 'image', 'document', 'onchain_tx', 'system_log', 'manual_attestation'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
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

    const { action_id, proof_type, proof_url, file_hash, external_ref, extracted_text, raw_metadata } = await req.json();

    // Validate
    if (!action_id) {
      return new Response(JSON.stringify({ error: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (proof_type && !VALID_PROOF_TYPES.includes(proof_type)) {
      return new Response(JSON.stringify({ error: `proof_type phải là: ${VALID_PROOF_TYPES.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!proof_url && !file_hash && !extracted_text) {
      return new Response(JSON.stringify({ error: 'Cần ít nhất proof_url, file_hash hoặc extracted_text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check ownership
    const { data: action, error: actionError } = await supabase
      .from('pplp_v2_user_actions')
      .select('id, user_id, status')
      .eq('id', action_id)
      .single();

    if (actionError || !action) {
      return new Response(JSON.stringify({ error: 'Không tìm thấy hành động' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Bạn không có quyền trên hành động này' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Duplicate proof detection
    if (proof_url) {
      const { data: existing } = await supabase
        .from('pplp_v2_proofs')
        .select('id')
        .eq('proof_url', proof_url)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ error: 'Bằng chứng này đã được sử dụng trước đó' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Insert proof
    const { data: proof, error: proofError } = await supabase
      .from('pplp_v2_proofs')
      .insert({
        action_id,
        proof_type: proof_type || 'link',
        proof_url: proof_url || null,
        file_hash: file_hash || null,
        external_ref: external_ref || null,
        extracted_text: extracted_text || null,
        raw_metadata: raw_metadata || {},
      })
      .select('id')
      .single();

    if (proofError) {
      if (proofError.code === '23505') {
        return new Response(JSON.stringify({ error: 'File hash đã tồn tại — bằng chứng trùng lặp' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('[PPLP v2 Proof] Insert error:', proofError);
      return new Response(JSON.stringify({ error: 'Không thể đính kèm bằng chứng' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update action status to under_review
    await supabase
      .from('pplp_v2_user_actions')
      .update({ status: 'under_review' })
      .eq('id', action_id);

    // Audit trail
    await supabase.from('pplp_v2_event_log').insert({
      event_type: 'proof.attached',
      actor_id: user.id,
      reference_table: 'pplp_v2_proofs',
      reference_id: proof.id,
      payload: { action_id, proof_type: proof_type || 'link' },
    });

    console.log(`[PPLP v2 Proof] Proof ${proof.id} attached to action ${action_id}, triggering validation`);

    // Auto-trigger validation
    try {
      const validateResponse = await fetch(
        `${supabaseUrl}/functions/v1/pplp-v2-validate-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
          },
          body: JSON.stringify({ action_id }),
        }
      );
      const validateData = await validateResponse.json();
      console.log(`[PPLP v2 Proof] Auto-validation result:`, validateData);

      return new Response(JSON.stringify({
        success: true,
        proof_id: proof.id,
        validation: validateData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (valErr) {
      console.warn('[PPLP v2 Proof] Auto-validation failed:', valErr);
      return new Response(JSON.stringify({
        success: true,
        proof_id: proof.id,
        message: 'Bằng chứng đã đính kèm. Validation sẽ được xử lý sau.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    console.error('[PPLP v2 Proof] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
