// Mystery Box Trigger - manual/admin/system entry point cho 3 nguồn còn lại:
// - invite_t1: gọi từ identity-did-auto-promote khi invitee đạt T1
//   (yêu cầu body: { target_user_id, source:'invite_t1', source_ref_id:<inviter_id|invitee_did> })
//   Hiện tại project chưa có bảng referral, nên endpoint chỉ chấp nhận khi caller là admin
//   hoặc service-role (X-Cron-Secret) tránh tự cấp gian lận.
// - premium_purchase: gọi sau khi user hold ≥ 10.000.000 CAMLY trong ví (DB trigger lo phần auto).
//   Body bắt buộc thêm: amount_camly:number (BigInt-safe string cũng được).
// - event_manual: admin tặng box thủ công (giải, sự kiện); ghi audit log.
//
// Auth:
//   - admin JWT: cho phép mọi source
//   - service-role qua header `x-cron-secret`: cho phép invite_t1 + premium_purchase
//   - user JWT thường: KHÔNG cho phép (tránh tự cấp)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ALLOWED = new Set(['invite_t1', 'premium_purchase', 'event_manual']);
const PREMIUM_PURCHASE_THRESHOLD = 10_000_000; // 10M CAMLY

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const cronSecret = req.headers.get('x-cron-secret');
    const isSystemCall = !!cronSecret && cronSecret === Deno.env.get('CRON_SHARED_SECRET');

    let isAdmin = false;
    let callerId: string | null = null;
    if (!isSystemCall) {
      const auth = req.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
      const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
      if (!user) return json({ error: 'unauthorized' }, 401);
      callerId = user.id;
      const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      isAdmin = !!data;
      if (!isAdmin) return json({ error: 'forbidden_user_cannot_trigger' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      target_user_id,
      source,
      source_ref_id = null,
      box_code = null,
      amount_camly = null,
      reason = null,
    } = body ?? {};

    if (!target_user_id || !ALLOWED.has(source)) {
      return json({ error: 'invalid_payload', hint: `source ∈ {${[...ALLOWED].join(',')}}` }, 400);
    }

    // Premium gate: ≥ 1M CAMLY
    if (source === 'premium_purchase') {
      const amt = Number(amount_camly ?? 0);
      if (!Number.isFinite(amt) || amt < PREMIUM_PURCHASE_THRESHOLD) {
        return json({
          error: 'premium_threshold_not_met',
          hint: `Cần ≥ ${PREMIUM_PURCHASE_THRESHOLD.toLocaleString('vi-VN')} CAMLY trong 1 giao dịch`,
        }, 400);
      }
    }

    // Default box_code mapping nếu không truyền
    const boxCode = box_code ?? defaultBoxCode(source);

    const { data: invId, error } = await supabase.rpc('mystery_box_grant', {
      _user_id: target_user_id,
      _box_code: boxCode,
      _source_event: source,
      _source_ref: source_ref_id,
    });
    if (error) return json({ error: error.message }, 400);

    // Ghi audit log
    await supabase.from('mystery_box_grant_audit').insert({
      inventory_id: invId,
      granted_by: callerId,
      target_user_id,
      source,
      box_code: boxCode,
      reason: reason ?? (isSystemCall ? `[system] ${source}` : `[admin] ${source}`),
    });

    return json({ success: true, inventory_id: invId, box_code: boxCode });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});

function defaultBoxCode(source: string): string {
  switch (source) {
    case 'invite_t1':        return 'epic_box';
    case 'premium_purchase': return 'legendary_box';
    case 'event_manual':     return 'cosmic_box';
    default:                 return 'common_box';
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
