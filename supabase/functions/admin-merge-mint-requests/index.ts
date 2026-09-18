import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { keccak256, toBytes } from "npm:viem@^2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FUN_MONEY_CONTRACT = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6';
const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const DEFAULT_ACTION_NAME = 'FUN_REWARD';

async function getNonceFromContract(address: string): Promise<bigint> {
  try {
    const functionSelector = keccak256(toBytes('nonces(address)')).slice(0, 10);
    const paddedAddress = '0x' + address.slice(2).toLowerCase().padStart(64, '0');
    const data = functionSelector + paddedAddress.slice(2);

    const response = await fetch(BSC_TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: FUN_MONEY_CONTRACT, data }, 'latest'],
      }),
    });

    const result = await response.json();
    if (result.error) return 0n;
    return BigInt(result.result || '0x0');
  } catch {
    return 0n;
  }
}

function generateEvidenceHash(actionTypes: string[], userId: string, timestamp: number): string {
  const input = `${actionTypes.sort().join(',')}:${userId}:${timestamp}`;
  return keccak256(toBytes(input));
}

function generateActionHash(actionName: string): string {
  return keccak256(toBytes(actionName));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin check
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: 1 request per minute
    const { data: rateLimit } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `admin_merge_mint:${user.id}`,
      p_limit: 1,
      p_window_ms: 60000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Vui lòng chờ 1 phút.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MERGE-MINT] Admin ${user.id} triggered merge mint requests`);

    // Step 0: Auto-reject pending_sig requests from banned users
    const { data: bannedUsers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_banned', true);

    const bannedIds = (bannedUsers || []).map(u => u.id);
    let bannedRejected = 0;

    if (bannedIds.length > 0) {
      const { data: bannedRequests } = await supabaseAdmin
        .from('pplp_mint_requests')
        .select('id')
        .eq('status', 'pending_sig')
        .in('user_id', bannedIds);

      if (bannedRequests && bannedRequests.length > 0) {
        await supabaseAdmin
          .from('pplp_mint_requests')
          .update({ status: 'rejected', error_message: 'User đã bị cấm', updated_at: new Date().toISOString() })
          .in('id', bannedRequests.map(r => r.id));
        bannedRejected = bannedRequests.length;
        console.log(`[MERGE-MINT] Auto-rejected ${bannedRejected} requests from banned users`);
      }
    }

    // Step 1: Find all pending_sig requests grouped by user
    const { data: allRequests, error: fetchError } = await supabaseAdmin
      .from('pplp_mint_requests')
      .select('id, user_id, recipient_address, amount_wei, amount_display, action_ids, action_types, evidence_hash, nonce')
      .eq('status', 'pending_sig')
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    if (!allRequests || allRequests.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        summary: { merged_users: 0, old_requests_removed: 0, new_requests_created: 0 },
        message: 'Không có requests nào ở trạng thái pending_sig để gộp.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Group by user_id
    const userRequestsMap: Record<string, typeof allRequests> = {};
    for (const req of allRequests) {
      if (!userRequestsMap[req.user_id]) userRequestsMap[req.user_id] = [];
      userRequestsMap[req.user_id].push(req);
    }

    const allUserEntries = Object.entries(userRequestsMap);

    if (allUserEntries.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        summary: { merged_users: 0, old_requests_removed: 0, new_requests_created: 0, recalculated: 0 },
        message: 'Không có requests nào để xử lý.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const usersWithMultiple = allUserEntries.filter(([, reqs]) => reqs.length > 1).length;
    const singleRequestUsers = allUserEntries.length - usersWithMultiple;
    console.log(`[MERGE-MINT] Processing ${allUserEntries.length} users total (multi=${usersWithMultiple}, single=${singleRequestUsers})`);

    let mergedUsers = 0;
    let oldRequestsRemoved = 0;
    let newRequestsCreated = 0;
    let recalculated = 0;
    const errors: string[] = [];
    const actionHash = generateActionHash(DEFAULT_ACTION_NAME);
    const now = Date.now();

    for (const [userId, requests] of allUserEntries) {
      try {
        const walletAddress = requests[0].recipient_address;

        // Deduplicate action_ids
        const allActionIds = [...new Set(requests.flatMap(r => r.action_ids || []))];
        const allActionTypes = [...new Set(requests.flatMap(r => r.action_types || []))];

        // Use amount_display directly from requests (already correct from epoch flow)
        const totalDisplay = requests.reduce((sum, r) => sum + (r.amount_display || 0), 0);

        if (totalDisplay <= 0) {
          console.log(`[MERGE-MINT] User ${userId}: totalDisplay=0, skipping`);
          continue;
        }

        const totalWei = BigInt(Math.floor(totalDisplay * 1e18));

        if (requests.length === 1) {
          // Single request: no merge needed, amount_display already correct
          continue;
        }

        // Multiple requests: merge into one
        const nonce = await getNonceFromContract(walletAddress);
        const evidenceHash = generateEvidenceHash(allActionTypes, userId, now);

        const { data: newReq, error: insertError } = await supabaseAdmin
          .from('pplp_mint_requests')
          .insert({
            user_id: userId,
            recipient_address: walletAddress,
            amount_wei: totalWei.toString(),
            amount_display: totalDisplay,
            action_name: DEFAULT_ACTION_NAME,
            action_hash: actionHash,
            evidence_hash: evidenceHash,
            action_types: allActionTypes,
            nonce: Number(nonce),
            deadline: null,
            status: 'pending_sig',
            action_ids: allActionIds,
          })
          .select('id')
          .single();

        if (insertError) {
          errors.push(`User ${userId}: Insert failed - ${insertError.message}`);
          continue;
        }

        // Update all light_actions to point to new request
        if (allActionIds.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < allActionIds.length; i += CHUNK) {
            await supabaseAdmin
              .from('light_actions')
              .update({ mint_request_id: newReq.id })
              .in('id', allActionIds.slice(i, i + CHUNK));
          }
        }

        // Delete old requests
        const oldIds = requests.map(r => r.id);
        const { error: deleteError } = await supabaseAdmin
          .from('pplp_mint_requests')
          .delete()
          .in('id', oldIds);

        if (deleteError) {
          errors.push(`User ${userId}: Delete old requests failed - ${deleteError.message}`);
          continue;
        }

        mergedUsers++;
        oldRequestsRemoved += oldIds.length;
        newRequestsCreated++;

        console.log(`[MERGE-MINT] User ${userId}: merged ${oldIds.length} requests -> 1 (${totalDisplay} FUN, ${allActionIds.length} actions)`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`User ${userId}: ${msg}`);
      }
    }

    console.log(`[MERGE-MINT] Complete: merged=${mergedUsers}, removed=${oldRequestsRemoved}, created=${newRequestsCreated}, errors=${errors.length}`);

    const friendlyMessage = mergedUsers > 0
      ? `✅ Đã gộp ${oldRequestsRemoved} requests cũ → ${newRequestsCreated} requests mới (${mergedUsers} users).`
      : `ℹ️ Không có gì để gộp. Hệ thống đã quét ${allUserEntries.length} users đang ở trạng thái pending_sig — mỗi user chỉ có đúng 1 mint request, không có request nào trùng lặp cần gộp. ${bannedRejected > 0 ? `(Đã tự động reject ${bannedRejected} requests của user bị ban.)` : ''}`;

    return new Response(JSON.stringify({
      success: true,
      summary: {
        merged_users: mergedUsers,
        old_requests_removed: oldRequestsRemoved,
        new_requests_created: newRequestsCreated,
        users_scanned: allUserEntries.length,
        users_with_multiple_requests: usersWithMultiple,
        users_with_single_request: singleRequestUsers,
        total_pending_before: allRequests.length,
        total_pending_after: allRequests.length - oldRequestsRemoved + newRequestsCreated,
        banned_rejected: bannedRejected,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      },
      message: friendlyMessage,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[MERGE-MINT] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
