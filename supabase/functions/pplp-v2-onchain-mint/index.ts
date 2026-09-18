import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet, JsonRpcProvider, Contract, keccak256, toUtf8Bytes, AbiCoder } from "npm:ethers@6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

const PPLP_DEFINITION = 'Proof of Pure Love Protocol — Truth Validation Engine v2';

// FUNMoneyMinter v2 ABI (minimal for mint calls)
const MINTER_ABI = [
  'function mintValidatedAction(bytes32 actionId, address user, uint256 totalMint, bytes32 validationDigest) external',
  'function mintValidatedActionLocked(bytes32 actionId, address user, uint256 totalMint, uint256 userClaimableNow, uint64 releaseAt, bytes32 validationDigest) external',
  'function processedActionIds(bytes32) external view returns (bool)',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const MINTER_PRIVATE_KEY = Deno.env.get('MINTER_PRIVATE_KEY');
    const MINTER_CONTRACT_ADDRESS = Deno.env.get('FUN_MINTER_V2_ADDRESS');
    if (!MINTER_PRIVATE_KEY || !MINTER_CONTRACT_ADDRESS) {
      return new Response(JSON.stringify({ error: 'Minter not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const { mint_record_id, release_mode: requestedReleaseMode, claim_percent } = await req.json();
    if (!mint_record_id) {
      return new Response(JSON.stringify({ code: 'VALIDATION', message: 'mint_record_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate release_mode and claim_percent if provided
    const validReleaseModes = ['instant', 'partial_lock'];
    if (requestedReleaseMode && !validReleaseModes.includes(requestedReleaseMode)) {
      return new Response(JSON.stringify({ code: 'VALIDATION', message: `release_mode must be: ${validReleaseModes.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (claim_percent !== undefined && (typeof claim_percent !== 'number' || claim_percent < 0 || claim_percent > 100)) {
      return new Response(JSON.stringify({ code: 'VALIDATION', message: 'claim_percent must be 0-100' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch mint record
    const { data: mintRecord, error: mrErr } = await supabase
      .from('pplp_v2_mint_records')
      .select('*, pplp_v2_user_actions!inner(user_id, action_type_code, title)')
      .eq('id', mint_record_id)
      .eq('status', 'pending')
      .single();

    if (mrErr || !mintRecord) {
      return new Response(JSON.stringify({ error: 'Mint record not found or not pending' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user wallet address
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', mintRecord.user_id)
      .single();

    if (!profile?.wallet_address) {
      await supabase.from('pplp_v2_mint_records')
        .update({ status: 'failed', error_message: 'User has no wallet address' })
        .eq('id', mint_record_id);
      return new Response(JSON.stringify({ error: 'User has no wallet address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Setup contract
    const provider = new JsonRpcProvider(BSC_TESTNET_RPC);
    const wallet = new Wallet(MINTER_PRIVATE_KEY, provider);
    const contract = new Contract(MINTER_CONTRACT_ADDRESS, MINTER_ABI, wallet);

    // Compute actionId = keccak256(action_id UUID)
    const actionId = keccak256(toUtf8Bytes(mintRecord.action_id));

    // Check if already processed on-chain
    const alreadyProcessed = await contract.processedActionIds(actionId);
    if (alreadyProcessed) {
      await supabase.from('pplp_v2_mint_records')
        .update({ status: 'failed', error_message: 'Already processed on-chain' })
        .eq('id', mint_record_id);
      return new Response(JSON.stringify({ error: 'Already processed on-chain' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build FULL validationDigest per pseudocode: hash(actionId, userId, score, mint, pplpScores, PPLP_DEFINITION)
    // Use stored validation_digest from mint record if available, otherwise compute
    let validationDigest: string;
    if (mintRecord.validation_digest) {
      // Use pre-computed digest from validate-action
      validationDigest = keccak256(toUtf8Bytes(mintRecord.validation_digest));
    } else {
      // Fallback: compute from basic fields
      const coder = AbiCoder.defaultAbiCoder();
      validationDigest = keccak256(
        coder.encode(
          ['string', 'uint256', 'uint256'],
          [mintRecord.action_id, BigInt(Math.floor(mintRecord.light_score * 1e4)), BigInt(Math.floor(mintRecord.mint_amount_total * 1e18))],
        ),
      );
    }

    // Convert amounts to wei (18 decimals)
    const totalMintWei = BigInt(Math.floor(mintRecord.mint_amount_total * 1e18));
    const userAddress = profile.wallet_address;

    // Determine release mode: use request override or mint record value
    const effectiveReleaseMode = requestedReleaseMode || mintRecord.release_mode || 'instant';
    const effectiveClaimPercent = claim_percent ?? (effectiveReleaseMode === 'instant' ? 100 : 50);
    const claimableNowWei = BigInt(Math.floor(Number(totalMintWei) * effectiveClaimPercent / 100));
    const lockedWei = totalMintWei - claimableNowWei;

    let tx;
    if (effectiveReleaseMode === 'partial_lock' && lockedWei > 0n) {
      const releaseAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 days lock
      tx = await contract.mintValidatedActionLocked(
        actionId, userAddress, totalMintWei, claimableNowWei, releaseAt, validationDigest,
      );

      // Update mint record with partial lock info
      await supabase.from('pplp_v2_mint_records').update({
        release_mode: 'partial_lock',
        claimable_now: Number(claimableNowWei) / 1e18,
        locked_amount: Number(lockedWei) / 1e18,
      }).eq('id', mint_record_id);
    } else {
      tx = await contract.mintValidatedAction(
        actionId, userAddress, totalMintWei, validationDigest,
      );
    }

    console.log(`[pplp-v2-onchain-mint] TX submitted: ${tx.hash} for mint_record ${mint_record_id}`);

    // Update status to submitted
    await supabase.from('pplp_v2_mint_records')
      .update({ status: 'submitted', tx_hash: tx.hash })
      .eq('id', mint_record_id);

    // Wait for confirmation (with timeout)
    try {
      const receipt = await tx.wait(1);
      if (receipt && receipt.status === 1) {
        await supabase.from('pplp_v2_mint_records')
          .update({ status: 'minted', confirmed_at: new Date().toISOString() })
          .eq('id', mint_record_id);

        // Update balance ledger entry type to 'claim' (on-chain confirmed)
        await supabase.from('pplp_v2_balance_ledger')
          .update({ entry_type: 'claim' })
          .eq('reference_id', mint_record_id)
          .eq('entry_type', 'mint_user');

        // Audit trail
        await supabase.from('pplp_v2_event_log').insert({
          event_type: 'mint.completed',
          actor_id: mintRecord.user_id,
          reference_table: 'pplp_v2_mint_records',
          reference_id: mint_record_id,
          payload: { tx_hash: tx.hash, mint_amount_total: mintRecord.mint_amount_total },
        });

        console.log(`[pplp-v2-onchain-mint] TX confirmed: ${tx.hash}`);
      } else {
        await supabase.from('pplp_v2_mint_records')
          .update({ status: 'failed', error_message: 'TX reverted' })
          .eq('id', mint_record_id);
      }
    } catch (waitErr: unknown) {
      console.warn(`[pplp-v2-onchain-mint] TX wait error (will poll later):`, waitErr);
    }

    return new Response(JSON.stringify({
      success: true,
      tx_hash: tx.hash,
      mint_record_id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[pplp-v2-onchain-mint] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
