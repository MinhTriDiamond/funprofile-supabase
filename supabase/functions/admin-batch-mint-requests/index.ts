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
const PAGE_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 100; // Số allocation xử lý mỗi lần gọi (tránh timeout edge fn)
const MAX_SCAN_SIZE = 5000;
const ACTIVE_MINT_STATUSES = ['pending_sig', 'signing', 'signed', 'submitted'];

// Hard cap 1.05M FUN/tháng/user — phải đồng bộ với DB trigger và allocation engine (3% × 35M user pool)
const MAX_MINT_PER_USER_PER_MONTH = '1050000';

function compareDecimalStrings(a: string, b: string): number {
  const wa = BigInt(amountToWeiString(a));
  const wb = BigInt(amountToWeiString(b));
  return wa < wb ? -1 : wa > wb ? 1 : 0;
}

type ActiveMintRequest = {
  id: string;
  user_id: string;
  status: string;
  signature: string | null;
  multisig_signatures: Record<string, unknown> | null;
  amount_display: number | null;
  action_ids: string[] | null;
  action_types: string[] | null;
};

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

function amountToWeiString(amount: number | string): string {
  const raw = normalizeDecimalString(amount);
  const [wholeRaw, fractionRaw = ''] = raw.split('.');
  const whole = wholeRaw.replace(/[^0-9]/g, '') || '0';
  const fraction = (fractionRaw.replace(/[^0-9]/g, '') + '0'.repeat(18)).slice(0, 18) || '0';
  return (BigInt(whole) * 10n ** 18n + BigInt(fraction)).toString();
}

function normalizeDecimalString(amount: number | string | null | undefined): string {
  const raw = String(amount ?? '0').trim();
  if (!/[eE]/.test(raw)) return raw;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 18 });
}

function weiToDecimalString(wei: bigint): string {
  const unit = 10n ** 18n;
  const whole = wei / unit;
  const fraction = (wei % unit).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addDecimalStrings(a: number | string | null | undefined, b: number | string | null | undefined): string {
  return weiToDecimalString(BigInt(amountToWeiString(a ?? '0')) + BigInt(amountToWeiString(b ?? '0')));
}

function isPositiveDecimal(amount: number | string | null | undefined): boolean {
  return BigInt(amountToWeiString(amount ?? '0')) > 0n;
}

function canMergeIntoActiveRequest(active: ActiveMintRequest): boolean {
  const signatures = active.multisig_signatures;
  const hasMultisig = !!signatures && Object.keys(signatures).length > 0;
  return active.status === 'pending_sig' && !active.signature && !hasMultisig;
}

function isValidEvmAddress(address: string | null | undefined): address is string {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Parse body
    let batchSize = DEFAULT_BATCH_SIZE;
    let cleanupRejected = false;
    let isCron = false;
    try {
      const body = await req.json();
      if (typeof body?.batch_size === 'number' && body.batch_size > 0 && body.batch_size <= 500) {
        batchSize = body.batch_size;
      }
      if (body?.cleanup_rejected === true) cleanupRejected = true;
      const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
      if (body?.cron_secret && cronSecret && body.cron_secret === cronSecret) isCron = true;
    } catch { /* no body */ }

    // Auth check (skip nếu cron với secret)
    let actorId = 'cron';
    if (!isCron) {
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
      actorId = user.id;
    }

    console.log(`[BATCH-MINT] Triggered by ${actorId} | batch_size=${batchSize} | cleanup=${cleanupRejected} | cron=${isCron}`);

    // Step 1 (optional): Cleanup rejected requests — chỉ chạy khi admin yêu cầu
    let rejectedCount = 0;
    if (cleanupRejected) {
      const { data: rejectedRequests } = await supabaseAdmin
        .from('pplp_mint_requests')
        .select('id, action_ids')
        .eq('status', 'rejected');

      rejectedCount = rejectedRequests?.length || 0;

      if (rejectedRequests && rejectedRequests.length > 0) {
        const allActionIds = rejectedRequests.flatMap(r => r.action_ids || []);
        if (allActionIds.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < allActionIds.length; i += CHUNK) {
            await supabaseAdmin
              .from('light_actions')
              .update({ mint_status: 'approved', mint_request_id: null })
              .in('id', allActionIds.slice(i, i + CHUNK));
          }
        }
        const rejectedIds = rejectedRequests.map(r => r.id);
        await supabaseAdmin.from('pplp_mint_requests').delete().in('id', rejectedIds);
        console.log(`[BATCH-MINT] Cleaned up ${rejectedIds.length} rejected requests`);
      }

      await supabaseAdmin
        .from('light_actions')
        .update({ mint_status: 'approved', mint_request_id: null })
        .eq('mint_status', 'rejected');
    }

    // Step 2: Đếm tổng pending còn lại
    const { count: totalPending } = await supabaseAdmin
      .from('mint_allocations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('is_eligible', true)
      .is('mint_request_id', null);

    // Step 3: Lấy một cửa sổ lớn allocations pending rồi chọn các dòng có thể xử lý.
    // Nếu 100 dòng đầu đều thiếu ví / đang có active request, vẫn quét tiếp để không bị kẹt.
    const scanSize = Math.min(MAX_SCAN_SIZE, Math.max(batchSize * 10, batchSize));
    const { data: pendingScan, error: fetchErr } = await supabaseAdmin
      .from('mint_allocations')
      .select('id, user_id, epoch_id, allocation_amount_capped, light_score_total')
      .eq('status', 'pending')
      .eq('is_eligible', true)
      .is('mint_request_id', null)
      .order('created_at', { ascending: true })
      .limit(scanSize);

    if (fetchErr) throw fetchErr;

    if (!pendingScan || pendingScan.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        summary: {
          rejected_cleaned: rejectedCount,
          batch_processed: 0,
          created: 0,
          remaining: 0,
        },
        message: 'Không còn allocation nào pending. Hoàn tất!',
        done: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[BATCH-MINT] Scanning ${pendingScan.length}/${totalPending ?? '?'} pending allocations`);

    // Lọc banned users
    const userIds = [...new Set(pendingScan.map(a => a.user_id))];
    const { data: bannedUsers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_banned', true)
      .in('id', userIds);
    const bannedSet = new Set((bannedUsers || []).map(u => u.id));

    const eligibleAllocations = pendingScan.filter(a => !bannedSet.has(a.user_id));
    const eligibleUserIds = [...new Set(eligibleAllocations.map(a => a.user_id))];

    // Lấy wallet từ profiles
    const profiles: { id: string; public_wallet_address: string | null; wallet_address: string | null }[] = [];
    const WALLET_BATCH = 100;
    for (let i = 0; i < eligibleUserIds.length; i += WALLET_BATCH) {
      const slice = eligibleUserIds.slice(i, i + WALLET_BATCH);
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, public_wallet_address, wallet_address')
        .in('id', slice);
      if (data) profiles.push(...data);
    }
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Fallback custodial_wallets
    const custodialMap = new Map<string, string>();
    const needCustodial = eligibleUserIds.filter(id => {
      const p = profileMap.get(id);
      return !p?.public_wallet_address && !p?.wallet_address;
    });
    for (let i = 0; i < needCustodial.length; i += WALLET_BATCH) {
      const slice = needCustodial.slice(i, i + WALLET_BATCH);
      const { data: cws } = await supabaseAdmin
        .from('custodial_wallets')
        .select('user_id, wallet_address')
        .eq('is_active', true)
        .in('user_id', slice);
      (cws || []).forEach(c => { if (c.wallet_address) custodialMap.set(c.user_id, c.wallet_address); });
    }
    console.log(`[BATCH-MINT] Wallets: profiles=${profiles.length}, custodial_fallback=${custodialMap.size}`);

    let typedActiveRequests: ActiveMintRequest[] = [];
    if (eligibleUserIds.length > 0) {
      const { data: activeRequests } = await supabaseAdmin
        .from('pplp_mint_requests')
        .select('id, user_id, status, signature, multisig_signatures, amount_display, action_ids, action_types')
        .in('status', ACTIVE_MINT_STATUSES)
        .in('user_id', eligibleUserIds);
      typedActiveRequests = (activeRequests || []) as ActiveMintRequest[];
    }
    const activeRequestMap = new Map(typedActiveRequests.map(r => [r.user_id, r]));

    const processableAllocations: Array<{
      alloc: typeof eligibleAllocations[number];
      walletAddress: string;
      activeRequest?: ActiveMintRequest;
    }> = [];
    let skippedNoWallet = 0;
    let skippedZero = 0;
    let skippedActiveRequest = 0;
    let skippedBanned = pendingScan.length - eligibleAllocations.length;
    const selectedUserIds = new Set<string>();

    for (const alloc of eligibleAllocations) {
      if (selectedUserIds.has(alloc.user_id)) continue;
      const profile = profileMap.get(alloc.user_id);
      const walletAddress = profile?.public_wallet_address || profile?.wallet_address || custodialMap.get(alloc.user_id);
      if (!isValidEvmAddress(walletAddress)) { skippedNoWallet++; continue; }
      if (!isPositiveDecimal(alloc.allocation_amount_capped)) { skippedZero++; continue; }
      const activeRequest = activeRequestMap.get(alloc.user_id);
      if (activeRequest && !canMergeIntoActiveRequest(activeRequest)) { skippedActiveRequest++; continue; }

      processableAllocations.push({ alloc, walletAddress, activeRequest });
      selectedUserIds.add(alloc.user_id);
      if (processableAllocations.length >= batchSize) break;
    }

    console.log(`[BATCH-MINT] Processing ${processableAllocations.length}/${batchSize} actionable allocations | active_mergeable=${processableAllocations.filter(i => !!i.activeRequest).length}`);

    let created = 0;
    let merged = 0;
    let skippedOverCap = 0;
    const errors: string[] = [];
    const actionHash = generateActionHash(DEFAULT_ACTION_NAME);
    const now = Date.now();

    for (const item of processableAllocations) {
      const { alloc, walletAddress, activeRequest } = item;
      const totalAmount = normalizeDecimalString(alloc.allocation_amount_capped);
      try {
        // Lấy action_ids của epoch
        const { data: epochData } = await supabaseAdmin
          .from('mint_epochs')
          .select('epoch_month')
          .eq('id', alloc.epoch_id)
          .single();

        let actionIds: string[] = [];
        if (epochData?.epoch_month) {
          const monthStart = `${epochData.epoch_month}-01T00:00:00Z`;
          const [y, m] = epochData.epoch_month.split('-').map(Number);
          const nextMonth = m === 12 ? `${y + 1}-01-01T00:00:00Z` : `${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00Z`;

          const { data: actions } = await supabaseAdmin
            .from('light_actions')
            .select('id')
            .eq('user_id', alloc.user_id)
            .eq('is_eligible', true)
            .gte('created_at', monthStart)
            .lt('created_at', nextMonth)
            .limit(PAGE_SIZE);

          actionIds = (actions || []).map(a => a.id);
        }

        let mintRequestId: string;
        if (activeRequest) {
          const existingActionIds = Array.isArray(activeRequest.action_ids) ? activeRequest.action_ids : [];
          const mergedActionIds = [...new Set([...existingActionIds, ...actionIds])];
          const existingActionTypes = Array.isArray(activeRequest.action_types) ? activeRequest.action_types : [];
          const mergedActionTypes = [...new Set([...existingActionTypes, 'epoch_allocation'])];
          const newAmount = addDecimalStrings(activeRequest.amount_display, totalAmount);

          // 🛡️ HARD CAP: tổng sau khi merge không được vượt 1.05M FUN/tháng/user
          if (compareDecimalStrings(newAmount, MAX_MINT_PER_USER_PER_MONTH) > 0) {
            console.warn(
              `[BATCH-MINT][CAP] Skip merge user ${alloc.user_id}: existing=${activeRequest.amount_display} + alloc=${totalAmount} = ${newAmount} > ${MAX_MINT_PER_USER_PER_MONTH}`
            );
            errors.push(`User ${alloc.user_id}: Vượt cap 1.050.000 FUN/tháng (current=${activeRequest.amount_display} + add=${totalAmount} = ${newAmount}) — skip merge`);
            skippedOverCap++;
            continue;
          }

          const { error: updateError } = await supabaseAdmin
            .from('pplp_mint_requests')
            .update({
              amount_display: newAmount,
              amount_wei: amountToWeiString(newAmount),
              action_ids: mergedActionIds,
              action_types: mergedActionTypes,
            })
            .eq('id', activeRequest.id);

          if (updateError) {
            errors.push(`User ${alloc.user_id}: ${updateError.message}`);
            continue;
          }
          mintRequestId = activeRequest.id;
          merged++;
        } else {
          // 🛡️ HARD CAP: lệnh tạo mới cũng không được vượt 1.05M
          if (compareDecimalStrings(totalAmount, MAX_MINT_PER_USER_PER_MONTH) > 0) {
            console.warn(
              `[BATCH-MINT][CAP] Skip create user ${alloc.user_id}: alloc=${totalAmount} > ${MAX_MINT_PER_USER_PER_MONTH}`
            );
            errors.push(`User ${alloc.user_id}: Allocation ${totalAmount} vượt cap 1.050.000 FUN/tháng — skip create`);
            skippedOverCap++;
            continue;
          }

          const nonce = await getNonceFromContract(walletAddress);
          const amountWei = amountToWeiString(totalAmount);
          const evidenceHash = generateEvidenceHash(['epoch_allocation'], alloc.user_id, now);

          const { data: mintReq, error: insertError } = await supabaseAdmin
            .from('pplp_mint_requests')
            .insert({
              user_id: alloc.user_id,
              recipient_address: walletAddress,
              amount_wei: amountWei,
              amount_display: totalAmount,
              action_name: DEFAULT_ACTION_NAME,
              action_hash: actionHash,
              evidence_hash: evidenceHash,
              action_types: ['epoch_allocation'],
              nonce: Number(nonce),
              deadline: null,
              status: 'pending_sig',
              action_ids: actionIds,
            })
            .select('id')
            .single();

          if (insertError) {
            errors.push(`User ${alloc.user_id}: ${insertError.message}`);
            continue;
          }
          mintRequestId = mintReq.id;
          created++;
        }

        await supabaseAdmin
          .from('mint_allocations')
          .update({ status: 'claimed', mint_request_id: mintRequestId })
          .eq('id', alloc.id);

        if (actionIds.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < actionIds.length; i += CHUNK) {
            await supabaseAdmin
              .from('light_actions')
              .update({ mint_status: 'pending_sig', mint_request_id: mintRequestId })
              .in('id', actionIds.slice(i, i + CHUNK));
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`User ${alloc.user_id}: ${msg}`);
      }
    }

    const processed = created + merged;
    const remaining = Math.max(0, (totalPending ?? pendingScan.length) - processed);
    const scannedAllPending = totalPending != null && pendingScan.length >= totalPending;
    const done = remaining === 0 || (scannedAllPending && processableAllocations.length < batchSize);

    console.log(`[BATCH-MINT] Done batch: created=${created}, merged=${merged}, over_cap=${skippedOverCap}, no_wallet=${skippedNoWallet}, zero=${skippedZero}, banned=${skippedBanned}, active_locked=${skippedActiveRequest}, errors=${errors.length}, remaining≈${remaining}, done=${done}`);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        rejected_cleaned: rejectedCount,
        batch_processed: pendingScan.length,
        actionable_processed: processed,
        created,
        merged,
        skipped_over_cap: skippedOverCap,
        skipped_no_wallet: skippedNoWallet,
        skipped_zero_amount: skippedZero,
        skipped_banned: skippedBanned,
        skipped_active_request: skippedActiveRequest,
        remaining,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      },
      message: `Đã tạo ${created} mint requests, gộp ${merged} allocations vào request cũ${skippedOverCap > 0 ? `, bỏ qua ${skippedOverCap} vượt cap 1.05M` : ''}. Còn ~${remaining} allocations chờ xử lý.`,
      done,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[BATCH-MINT] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
