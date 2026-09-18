// Mystery Box Expire Cron — daily 03:00 UTC
// - Notify hộp sắp hết hạn (T-7d): 1 noti per inventory
// - Hết hạn: set source_event=expired? Không — chỉ notify + soft mark qua opened_at giả? KHÔNG.
//   Cách đúng: set risk_flag=false, giữ row + notify, FE filter expires_at < now() AND opened_at IS NULL → ẩn.
//   Để đơn giản: thêm noti `mystery_box_expired` 1 lần và locked=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: chấp nhận 1 trong các pattern:
  // (1) cron call: có header apikey = ANON key (do pg_net gửi) — không cần JWT user
  // (2) admin JWT
  // (3) x-cron-secret khớp env CRON_SHARED_SECRET (system call thủ công)
  const cronSecret = req.headers.get('x-cron-secret');
  const apikey = req.headers.get('apikey');
  const isSystem =
    (cronSecret && cronSecret === Deno.env.get('CRON_SHARED_SECRET')) ||
    (!!apikey && apikey === (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  if (!isSystem) {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
  }

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. T-7d: notify "expiring" cho box còn 6-7d, chưa noti
  const { data: expiring = [] } = await (supabase as any)
    .from('mystery_box_inventory')
    .select('id, user_id, box_def_id, expires_at, definition:mystery_box_definitions(name_vi, tier)')
    .is('opened_at', null)
    .gt('expires_at', now.toISOString())
    .lte('expires_at', in7d)
    .limit(500);

  let notifiedExpiring = 0;
  for (const inv of (expiring ?? [])) {
    // idempotent: kiểm noti đã gửi chưa qua payload->>inventory_id
    const { data: exist } = await (supabase as any)
      .from('notifications')
      .select('id')
      .eq('user_id', inv.user_id)
      .eq('type', 'mystery_box_expiring')
      .filter('payload->>inventory_id', 'eq', inv.id)
      .maybeSingle();
    if (exist) continue;
    await (supabase as any).from('notifications').insert({
      user_id: inv.user_id,
      type: 'mystery_box_expiring',
      payload: { inventory_id: inv.id, expires_at: inv.expires_at, name_vi: inv.definition?.name_vi, tier: inv.definition?.tier },
    });
    notifiedExpiring++;
  }

  // 2. Đã hết hạn: notify + lock + audit
  const { data: expired = [] } = await (supabase as any)
    .from('mystery_box_inventory')
    .select('id, user_id, definition:mystery_box_definitions(name_vi, tier)')
    .is('opened_at', null)
    .lt('expires_at', now.toISOString())
    .eq('locked', false)
    .limit(500);

  let lockedExpired = 0;
  for (const inv of (expired ?? [])) {
    await (supabase as any).from('mystery_box_inventory').update({ locked: true }).eq('id', inv.id);
    await (supabase as any).from('notifications').insert({
      user_id: inv.user_id,
      type: 'mystery_box_expired',
      payload: { inventory_id: inv.id, name_vi: inv.definition?.name_vi, tier: inv.definition?.tier },
    });
    lockedExpired++;
  }

  return json({ success: true, notifiedExpiring, lockedExpired });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
