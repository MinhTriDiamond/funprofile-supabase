import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PPLP_DEFINITION = 'Proof of Pure Love Protocol — Truth Validation Engine v2';
const BASE_MINT_RATE = 10;

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    const { action_id } = await req.json();
    if (!action_id) {
      return new Response(JSON.stringify({ error: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency is enforced at DB level via unique index uq_mint_records_action
    // (see upsert with onConflict below). No check-before-insert (race-prone).


    // Fetch validation
    const { data: validation, error: valErr } = await supabase
      .from('pplp_v2_validations')
      .select('*')
      .eq('action_id', action_id)
      .eq('validation_status', 'validated')
      .order('validated_at', { ascending: false })
      .limit(1)
      .single();

    if (valErr || !validation) {
      return new Response(JSON.stringify({ error: 'No validated validation found for this action' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch action for user_id
    const { data: action } = await supabase
      .from('pplp_v2_user_actions')
      .select('user_id, action_type_code')
      .eq('id', action_id)
      .single();

    if (!action) {
      return new Response(JSON.stringify({ error: 'Action not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalLightScore = Number(validation.final_light_score) || 0;
    if (finalLightScore <= 0) {
      return new Response(JSON.stringify({ error: 'Final light score is zero — nothing to mint' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mint calculation
    const mintAmountTotal = BASE_MINT_RATE * finalLightScore;
    const mintAmountUser = Math.floor(mintAmountTotal * 99) / 100; // 99%
    const mintAmountPlatform = mintAmountTotal - mintAmountUser; // 1%

    // Build validationDigest (Pseudocode §7)
    const pplpScores = {
      S: validation.serving_life,
      T: validation.transparent_truth,
      L: validation.healing_love,
      V: validation.long_term_value,
      U: validation.unity_over_separation,
    };
    const digestPayload = JSON.stringify({
      actionId: action_id,
      userId: action.user_id,
      finalLightScore,
      totalMint: mintAmountTotal,
      pplpScores,
      definition: PPLP_DEFINITION,
    });
    const validationDigest = await sha256(digestPayload);

    // Insert mint record — atomic idempotency via unique index on action_id
    const { data: mintRows, error: mintErr } = await supabase.from('pplp_v2_mint_records').upsert({
      action_id,
      user_id: action.user_id,
      light_score: finalLightScore,
      base_mint_rate: BASE_MINT_RATE,
      mint_amount_total: mintAmountTotal,
      mint_amount_user: mintAmountUser,
      mint_amount_platform: mintAmountPlatform,
      release_mode: 'instant',
      claimable_now: mintAmountUser,
      locked_amount: 0,
      status: 'pending',
      // NOTE: bảng không có cột validation_digest — digest được ghi vào pplp_v2_event_log

    }, { onConflict: 'action_id', ignoreDuplicates: true }).select('id, mint_amount_user, mint_amount_platform');

    if (mintErr) {
      console.error('[Mint Worker] Insert error:', mintErr);
      return new Response(JSON.stringify({ error: 'Failed to create mint record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mint = mintRows?.[0];
    if (!mint) {
      // Conflict ignored → mint record for this action already exists
      console.log(`[Mint Worker] Mint record already exists for action ${action_id} — skipping (idempotent)`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'MINT_ALREADY_EXISTS',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    // Write balance ledger entries (immutable audit trail)
    await supabase.from('pplp_v2_balance_ledger').insert([
      {
        user_id: action.user_id,
        entry_type: 'mint_user',
        amount: mintAmountUser,
        reference_table: 'pplp_v2_mint_records',
        reference_id: mint.id,
        note: `PPLP v2 mint: action ${action_id}, LS=${finalLightScore.toFixed(4)}`,
      },
      {
        user_id: action.user_id,
        entry_type: 'mint_platform',
        amount: mintAmountPlatform,
        reference_table: 'pplp_v2_mint_records',
        reference_id: mint.id,
        note: `Platform 1% from action ${action_id}`,
      },
    ]);

    // addToLifetimeLightScore ONLY after mint record created (Pseudocode §7)
    const { data: profile } = await supabase.from('profiles').select('total_light_score').eq('id', action.user_id).single();
    const currentTotal = Number(profile?.total_light_score) || 0;
    await supabase.from('profiles').update({ total_light_score: currentTotal + finalLightScore }).eq('id', action.user_id);

    // Update action status to minted
    await supabase.from('pplp_v2_user_actions').update({ status: 'minted' }).eq('id', action_id);

    // Audit trail
    await supabase.from('pplp_v2_event_log').insert({
      event_type: 'mint.completed',
      actor_id: action.user_id,
      reference_table: 'pplp_v2_mint_records',
      reference_id: mint.id,
      payload: { action_id, light_score: finalLightScore, mint_user: mintAmountUser, mint_platform: mintAmountPlatform, validation_digest: validationDigest },
    });

    // Auto-trigger on-chain mint
    const MINTER_V2_ADDRESS = Deno.env.get('FUN_MINTER_V2_ADDRESS');
    const MINTER_PRIVATE_KEY = Deno.env.get('MINTER_PRIVATE_KEY');
    if (MINTER_V2_ADDRESS && MINTER_PRIVATE_KEY) {
      try {
        const mintResp = await fetch(`${supabaseUrl}/functions/v1/pplp-v2-onchain-mint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
          },
          body: JSON.stringify({ mint_record_id: mint.id }),
        });
        const mintResult = await mintResp.json();
        console.log(`[Mint Worker] On-chain mint triggered: ${JSON.stringify(mintResult)}`);
      } catch (onchainErr) {
        console.warn(`[Mint Worker] On-chain mint trigger failed (will retry):`, onchainErr);
      }
    }

    console.log(`[Mint Worker] Action ${action_id}: minted ${mintAmountUser} user / ${mintAmountPlatform} platform`);

    return new Response(JSON.stringify({
      success: true,
      mint_id: mint.id,
      mint_amount_user: mint.mint_amount_user,
      mint_amount_platform: mint.mint_amount_platform,
      validation_digest: validationDigest,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[Mint Worker] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
