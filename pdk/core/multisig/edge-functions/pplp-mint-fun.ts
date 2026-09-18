// =============================================
// Edge Function Template: pplp-mint-fun
// Tạo mint request từ light actions đã được duyệt
// Platform: [THAY_BẰNG_TÊN_PLATFORM]
// =============================================
//
// HƯỚNG DẪN SỬ DỤNG:
// 1. Copy file này vào supabase/functions/pplp-mint-fun/index.ts
// 2. Thay thế [THAY_BẰNG_TÊN_PLATFORM] bằng platform_id thực tế
// 3. Cấu hình CORS headers phù hợp
// 4. Deploy: supabase functions deploy pplp-mint-fun
//
// BIẾN MÔI TRƯỜNG CẦN THIẾT:
// - SUPABASE_URL (tự động có)
// - SUPABASE_SERVICE_ROLE_KEY (tự động có)
//
// =============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const PLATFORM_ID = 'fun_profile'; // ← THAY ĐỔI: 'fun_play' hoặc 'angel_ai'
const MIN_MINT_AMOUNT = 200;
const MAX_REQUESTS_PER_DAY = 2;

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Xác thực user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client với quyền user (để kiểm tra auth)
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client với quyền service (để đọc/ghi dữ liệu)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Parse request body
    const { action_ids, recipient_address } = await req.json();
    if (!action_ids?.length || !recipient_address) {
      return new Response(
        JSON.stringify({ error: 'Missing action_ids or recipient_address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Kiểm tra user không bị cấm
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned, wallet_address')
      .eq('id', user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ error: 'Tài khoản đã bị cấm' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Kiểm tra daily cap (tối đa MAX_REQUESTS_PER_DAY request/ngày)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('pplp_mint_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString())
      .not('status', 'in', '(expired,rejected)');

    if ((todayCount || 0) >= MAX_REQUESTS_PER_DAY) {
      return new Response(
        JSON.stringify({ error: `Tối đa ${MAX_REQUESTS_PER_DAY} yêu cầu/ngày` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Lấy các light actions hợp lệ
    const { data: actions, error: actionsError } = await supabase
      .from('light_actions')
      .select('*')
      .in('id', action_ids)
      .eq('user_id', user.id)
      .eq('mint_status', 'approved')
      .eq('is_eligible', true);

    if (actionsError || !actions?.length) {
      return new Response(
        JSON.stringify({ error: 'Không tìm thấy light actions hợp lệ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Tính tổng amount
    const totalAmount = actions.reduce((sum, a) => sum + (a.mint_amount || a.light_score || 0), 0);
    if (totalAmount < MIN_MINT_AMOUNT) {
      return new Response(
        JSON.stringify({
          error: `Tối thiểu ${MIN_MINT_AMOUNT} FUN. Hiện tại: ${totalAmount} FUN`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Tạo evidence hash
    const evidenceData = JSON.stringify({
      action_ids: action_ids.sort(),
      user_id: user.id,
      amount: totalAmount,
      platform: PLATFORM_ID,
      timestamp: new Date().toISOString(),
    });
    const evidenceBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(evidenceData)
    );
    const evidenceHash =
      '0x' +
      Array.from(new Uint8Array(evidenceBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    // 8. Tạo action hash (keccak256 của action type - sẽ được tính lại trên frontend)
    const actionType = actions[0].action_type || 'POST_CREATE';

    // 9. Chuyển amount sang Wei (18 decimals)
    const amountWei = BigInt(Math.floor(totalAmount * 1e18)).toString();

    // 10. Insert mint request
    const { data: mintRequest, error: insertError } = await supabase
      .from('pplp_mint_requests')
      .insert({
        user_id: user.id,
        recipient_address,
        action_ids,
        action_type: actionType,
        amount: totalAmount,
        amount_wei: amountWei,
        evidence_hash: evidenceHash,
        status: 'pending_sig',
        platform_id: PLATFORM_ID,
        multisig_signatures: {},
        multisig_completed_groups: [],
        multisig_required_groups: ['will', 'wisdom', 'love'],
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Không thể tạo yêu cầu mint' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Cập nhật trạng thái các light actions
    await supabase
      .from('light_actions')
      .update({ mint_status: 'pending', mint_request_id: mintRequest.id })
      .in('id', action_ids);

    return new Response(
      JSON.stringify({
        success: true,
        mint_request: mintRequest,
        message: `Đã tạo yêu cầu mint ${totalAmount} FUN. Chờ 3 chữ ký GOV.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('pplp-mint-fun error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
