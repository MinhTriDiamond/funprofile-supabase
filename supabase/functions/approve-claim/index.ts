import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { createWalletClient, http, parseUnits, encodeFunctionData, createPublicClient } from 'npm:viem@^2.38.0';
import { privateKeyToAccount } from 'npm:viem@^2.38.0/accounts';
import { bsc } from 'npm:viem@^2.38.0/chains';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CAMLY_CONTRACT = '0x0910320181889feFDE0BB1Ca63962b0A8882e413';
const CAMLY_DECIMALS = 3;

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Token không hợp lệ' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Phiên đăng nhập hết hạn' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminId = user.id;

    // Check admin role
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', adminId)
      .eq('role', 'admin')
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'Chỉ Admin mới có quyền duyệt claim' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { claim_id, action, admin_note } = await req.json();

    if (!claim_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Thiếu claim_id hoặc action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get pending claim
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('pending_claims')
      .select('*')
      .eq('id', claim_id)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: 'Not Found', message: 'Không tìm thấy lệnh claim' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (claim.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Conflict', message: `Lệnh claim đã được xử lý (${claim.status})` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // REJECT flow
    if (action === 'reject') {
      await supabaseAdmin.from('pending_claims').update({
        status: 'rejected',
        admin_id: adminId,
        admin_note: admin_note || 'Admin từ chối',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', claim_id);

      // Notify user
      await supabaseAdmin.from('notifications').insert({
        user_id: claim.user_id,
        actor_id: adminId,
        type: 'claim_rejected',
        read: false,
      });

      await supabaseAdmin.from('audit_logs').insert({
        admin_id: adminId,
        target_user_id: claim.user_id,
        action: 'REJECT_CLAIM',
        reason: admin_note || 'Admin từ chối claim',
        details: { claim_id, amount: claim.amount, wallet_address: claim.wallet_address },
      });

      return new Response(
        JSON.stringify({ success: true, message: 'Đã từ chối lệnh claim' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // APPROVE flow - send on-chain
    if (action !== 'approve') {
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Action phải là approve hoặc reject' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as processing
    await supabaseAdmin.from('pending_claims').update({
      status: 'processing',
      admin_id: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', claim_id);

    // Get Treasury credentials
    const treasuryAddress = Deno.env.get('TREASURY_WALLET_ADDRESS')?.trim();
    const treasuryPrivateKey = Deno.env.get('TREASURY_PRIVATE_KEY')?.trim();

    if (!treasuryAddress || !treasuryPrivateKey) {
      await supabaseAdmin.from('pending_claims').update({ status: 'failed', admin_note: 'Treasury chưa được cấu hình' }).eq('id', claim_id);
      return new Response(
        JSON.stringify({ error: 'Server Error', message: 'Treasury chưa được cấu hình' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let pk = treasuryPrivateKey;
    if (!pk.startsWith('0x')) pk = '0x' + pk;
    const account = privateKeyToAccount(pk as `0x${string}`);

    const publicClient = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed1.binance.org'),
    });

    const walletClient = createWalletClient({
      account,
      chain: bsc,
      transport: http('https://bsc-dataseed1.binance.org'),
    });

    // Check Treasury balance
    const treasuryBalance = await publicClient.readContract({
      address: CAMLY_CONTRACT as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [treasuryAddress as `0x${string}`],
    });

    const effectiveAmount = Number(claim.amount);
    const requiredAmount = parseUnits(effectiveAmount.toString(), CAMLY_DECIMALS);

    if (treasuryBalance < requiredAmount) {
      await supabaseAdmin.from('pending_claims').update({ status: 'failed', admin_note: 'Treasury không đủ token' }).eq('id', claim_id);
      return new Response(
        JSON.stringify({ error: 'Service Unavailable', message: 'Treasury không đủ token' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send on-chain transfer
    console.log(`Sending ${effectiveAmount} CAMLY to ${claim.wallet_address}...`);

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [claim.wallet_address as `0x${string}`, requiredAmount],
    });

    const txHash = await walletClient.sendTransaction({
      to: CAMLY_CONTRACT as `0x${string}`,
      data,
      chain: bsc,
    });

    console.log(`Transaction sent: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    if (receipt.status !== 'success') {
      await supabaseAdmin.from('pending_claims').update({ status: 'failed', admin_note: 'Giao dịch blockchain thất bại', tx_hash: txHash }).eq('id', claim_id);
      return new Response(
        JSON.stringify({ error: 'Transaction Failed', message: 'Giao dịch blockchain thất bại' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bscscanUrl = `https://bscscan.com/tx/${txHash}`;

    // Update pending_claim to completed
    await supabaseAdmin.from('pending_claims').update({
      status: 'completed',
      tx_hash: txHash,
      bscscan_url: bscscanUrl,
      admin_note: admin_note || 'Admin đã duyệt và gửi on-chain',
      updated_at: new Date().toISOString(),
    }).eq('id', claim_id);

    // Record in reward_claims
    await supabaseAdmin.from('reward_claims').insert({
      user_id: claim.user_id,
      amount: effectiveAmount,
      wallet_address: claim.wallet_address,
    });

    // Record in transactions
    await supabaseAdmin.from('transactions').insert({
      user_id: claim.user_id,
      tx_hash: txHash,
      from_address: treasuryAddress.toLowerCase(),
      to_address: claim.wallet_address,
      amount: effectiveAmount.toString(),
      token_symbol: 'CAMLY',
      token_address: CAMLY_CONTRACT.toLowerCase(),
      chain_id: 56,
      status: 'confirmed',
    });

    // Record in donations
    const TREASURY_SENDER_ID = '9e702a6f-4035-4f30-9c04-f2e21419b37a';
    await supabaseAdmin.from('donations').insert({
      sender_id: TREASURY_SENDER_ID,
      recipient_id: claim.user_id,
      amount: effectiveAmount.toString(),
      token_symbol: 'CAMLY',
      token_address: CAMLY_CONTRACT.toLowerCase(),
      chain_id: 56,
      tx_hash: txHash,
      status: 'confirmed',
      block_number: Number(receipt.blockNumber),
      message: `Claim ${effectiveAmount.toLocaleString()} CAMLY từ phần thưởng`,
      light_score_earned: 0,
      confirmed_at: new Date().toISOString(),
      metadata: { type: 'claim_reward', pending_claim_id: claim_id },
    });

    // KHÔNG đổi reward_status sau khi claim — giữ 'approved' để user có thể claim tiếp
    // khi tích đủ ngưỡng mới (xem mem://features/wallet/claim-cta-state-matrix).

    // Notify user
    await supabaseAdmin.from('notifications').insert({
      user_id: claim.user_id,
      actor_id: adminId,
      type: 'claim_approved',
      read: false,
    });

    // Get profile for celebration post
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, full_name')
      .eq('id', claim.user_id)
      .single();

    // Create celebration post
    try {
      const claimUsername = profile?.username || profile?.full_name || 'Nguoi dung';
      await supabaseAdmin.from('posts').insert({
        user_id: claim.user_id,
        content: `🎉 @${claimUsername} da nhan thuong ${effectiveAmount.toLocaleString()} CAMLY tu FUN Profile Treasury! ❤️`,
        post_type: 'gift_celebration',
        tx_hash: txHash,
        gift_sender_id: TREASURY_SENDER_ID,
        gift_recipient_id: claim.user_id,
        gift_token: 'CAMLY',
        gift_amount: effectiveAmount.toString(),
        gift_message: `Claim ${effectiveAmount.toLocaleString()} CAMLY`,
        is_highlighted: true,
        highlight_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        visibility: 'public',
        moderation_status: 'approved',
      });
    } catch (postError) {
      console.error('Failed to create celebration post:', postError);
    }

    // Create chat message
    try {
      const { data: recipientConvs } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', claim.user_id);

      const recipientConvIds = (recipientConvs || []).map((r: any) => r.conversation_id);
      let conversationId: string | null = null;

      if (recipientConvIds.length > 0) {
        const { data: existingConv } = await supabaseAdmin
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', TREASURY_SENDER_ID)
          .in('conversation_id', recipientConvIds);

        for (const conv of existingConv || []) {
          const { data: convData } = await supabaseAdmin
            .from('conversations')
            .select('id, type')
            .eq('id', conv.conversation_id)
            .eq('type', 'direct')
            .single();
          if (convData) { conversationId = convData.id; break; }
        }
      }

      if (!conversationId) {
        const { data: newConv } = await supabaseAdmin
          .from('conversations')
          .insert({ type: 'direct' })
          .select('id')
          .single();
        if (newConv) {
          conversationId = newConv.id;
          await supabaseAdmin.from('conversation_participants').insert([
            { conversation_id: conversationId, user_id: TREASURY_SENDER_ID, role: 'member' },
            { conversation_id: conversationId, user_id: claim.user_id, role: 'member' },
          ]);
        }
      }

      if (conversationId) {
        await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          sender_id: TREASURY_SENDER_ID,
          content: `🎁 FUN Profile Treasury đã chuyển ${effectiveAmount.toLocaleString()} CAMLY về ví của bạn!\n\nTX: ${txHash.slice(0, 18)}...\nXem chi tiết: ${bscscanUrl}`,
        });
      }
    } catch (chatError) {
      console.error('Failed to create chat message:', chatError);
    }

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: adminId,
      target_user_id: claim.user_id,
      action: 'APPROVE_CLAIM',
      details: { claim_id, amount: effectiveAmount, wallet_address: claim.wallet_address, tx_hash: txHash, block_number: receipt.blockNumber?.toString() },
      reason: admin_note || `Approved claim ${effectiveAmount.toLocaleString()} CAMLY`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tx_hash: txHash,
        amount: effectiveAmount,
        wallet_address: claim.wallet_address,
        block_number: receipt.blockNumber?.toString(),
        bscscan_url: bscscanUrl,
        message: `Đã duyệt và gửi ${effectiveAmount.toLocaleString()} CAMLY thành công!`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Approve claim error:', error);

    if (error.message?.includes('insufficient funds')) {
      return new Response(
        JSON.stringify({ error: 'Service Unavailable', message: 'Treasury không đủ gas fee' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal Error', message: error.message || 'Lỗi hệ thống' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
