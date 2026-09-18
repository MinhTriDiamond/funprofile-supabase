import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REMINDER_TYPE = 'link_wallet_reminder';
const COOLDOWN_HOURS = 24;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid token' }, 401);

    // Admin check
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return json({ error: 'Admin only' }, 403);

    const body = await req.json().catch(() => ({} as any));
    const dryRun: boolean = !!body?.dryRun;

    // 1) Find all users with pending allocations who have NO wallet (custodial + profile)
    const { data: pendingAllocs, error: allocErr } = await supabase
      .from('mint_allocations')
      .select('user_id, allocation_amount_capped')
      .eq('status', 'pending');
    if (allocErr) throw allocErr;

    const userIds = Array.from(new Set((pendingAllocs ?? []).map((a: any) => a.user_id)));
    if (userIds.length === 0) {
      return json({ ok: true, candidates: 0, sent: 0, skipped_cooldown: 0, dryRun });
    }

    // Sum FUN per user (string-safe but counts in number for display only)
    const sumByUser = new Map<string, number>();
    for (const a of pendingAllocs as any[]) {
      const cur = sumByUser.get(a.user_id) ?? 0;
      sumByUser.set(a.user_id, cur + Number(a.allocation_amount_capped ?? 0) / 1e18);
    }

    // 2) Filter users with NO wallet at all
    const [{ data: custodial }, { data: profiles }] = await Promise.all([
      supabase.from('custodial_wallets').select('user_id, wallet_address').in('user_id', userIds),
      supabase.from('profiles').select('id, wallet_address, is_banned').in('id', userIds),
    ]);
    const hasCustodial = new Set((custodial ?? []).filter((w: any) => w.wallet_address).map((w: any) => w.user_id));
    const profileMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p));

    const noWalletUsers = userIds.filter((uid) => {
      const p = profileMap.get(uid);
      if (!p || p.is_banned) return false;
      if (p.wallet_address) return false;
      if (hasCustodial.has(uid)) return false;
      return true;
    });

    if (noWalletUsers.length === 0) {
      return json({ ok: true, candidates: 0, sent: 0, skipped_cooldown: 0, dryRun });
    }

    // 3) Cooldown 24h: skip users already notified recently
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('user_id, created_at')
      .eq('type', REMINDER_TYPE)
      .gte('created_at', cooldownSince)
      .in('user_id', noWalletUsers);
    const recentSet = new Set((recent ?? []).map((r: any) => r.user_id));

    const toNotify = noWalletUsers.filter((uid) => !recentSet.has(uid));
    const skippedCooldown = noWalletUsers.length - toNotify.length;

    if (dryRun) {
      return json({ ok: true, candidates: noWalletUsers.length, would_send: toNotify.length, skipped_cooldown: skippedCooldown, dryRun: true });
    }

    if (toNotify.length === 0) {
      return json({ ok: true, candidates: noWalletUsers.length, sent: 0, skipped_cooldown: skippedCooldown });
    }

    const rows = toNotify.map((uid) => ({
      user_id: uid,
      type: REMINDER_TYPE,
      read: false,
      metadata: {
        title: 'Liên kết ví để nhận FUN',
        message: `Bạn đang có ${(sumByUser.get(uid) ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} FUN chờ mint nhưng chưa liên kết ví on-chain. Hãy vào Ví → Liên kết ví để nhận phần thưởng đợt tới nhé.`,
        cta_label: 'Liên kết ví',
        cta_url: '/wallet',
        pending_fun: Math.round(sumByUser.get(uid) ?? 0),
        sent_by: user.id,
      },
    }));

    // Insert in chunks of 200
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: insErr, count } = await supabase
        .from('notifications').insert(chunk, { count: 'exact' });
      if (insErr) throw insErr;
      inserted += count ?? chunk.length;
    }

    return json({
      ok: true,
      candidates: noWalletUsers.length,
      sent: inserted,
      skipped_cooldown: skippedCooldown,
    });
  } catch (e: any) {
    console.error('[notify-link-wallet-reminder]', e);
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
