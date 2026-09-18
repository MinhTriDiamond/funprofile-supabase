// Connector Backfill 7d — quét wallet_transfers 7 ngày, đối chiếu với connector_windows + config
// dry_run = true: chỉ trả thống kê, không insert
// dry_run = false: insert link, đóng window, cộng Light Score IM LẶNG (no per-tx noti),
//                  cuối cùng gửi 1 noti tổng kết cho mỗi new_user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const norm = (a: string | null | undefined) => (a ? a.trim().toLowerCase() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, reason: "missing_auth" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { persistSession: false } }
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: userRes } = await userClient.auth.getUser();
    const adminId = userRes?.user?.id;
    if (!adminId) return json({ ok: false, reason: "invalid_token" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: adminId, _role: "admin" });
    if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // default true
    const days: number = Math.min(Math.max(Number(body?.days ?? 7), 1), 30);
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();

    // Load config
    const { data: cfgRows } = await admin.from("connector_config").select("key,value");
    const cfg = Object.fromEntries((cfgRows ?? []).map((r: any) => [r.key, r.value]));
    if (cfg.enabled === false) return json({ ok: false, reason: "disabled" });
    const minAmounts = cfg.min_amounts ?? {};
    const whitelist: string[] = cfg.whitelist_tokens ?? [];
    const minTC = Number(cfg.min_tc ?? 0.15);
    const baseScore = Number(cfg.base_score ?? 10);

    // Pull recent transfers (cap 5000 for safety)
    const { data: transfers, error: txErr } = await admin
      .from("wallet_transfers")
      .select("id,tx_hash,chain,token_symbol,amount,amount_usd,from_address,to_address,block_number,tx_index,log_index,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (txErr) return json({ ok: false, reason: "tx_query_error", error: txErr.message }, 500);

    const stats = {
      scanned: transfers?.length ?? 0,
      eligible: 0,
      created: 0,
      skipped_token: 0,
      skipped_amount: 0,
      skipped_no_window: 0,
      skipped_window_closed: 0,
      skipped_no_user: 0,
      skipped_external_giver: 0,
      skipped_self: 0,
      skipped_low_tc: 0,
      skipped_already_matched: 0,
      errors: 0,
    };
    const summaryByNewUser = new Map<string, { count: number; firstLinkId: string | null }>();

    for (const t of transfers ?? []) {
      const symbol = String(t.token_symbol || "").toUpperCase();
      if (whitelist.length && !whitelist.includes(symbol)) { stats.skipped_token++; continue; }
      const amt = Number(t.amount);
      const minAmt = Number(minAmounts[symbol] ?? Infinity);
      if (!isFinite(amt) || amt < minAmt) { stats.skipped_amount++; continue; }

      const toAddr = norm(t.to_address);
      const fromAddr = norm(t.from_address);
      const newUser = await resolveUser(admin, toAddr);
      if (!newUser) { stats.skipped_no_user++; continue; }

      const { data: win } = await admin.from("connector_windows")
        .select("id,status,expires_at,opened_at")
        .eq("user_id", newUser).maybeSingle();
      if (!win) { stats.skipped_no_window++; continue; }

      // Backfill semantics: chỉ chấp nhận tx xảy ra trong khoảng [opened_at, expires_at]
      const txTime = new Date(t.created_at).getTime();
      const opened = new Date(win.opened_at).getTime();
      const expires = new Date(win.expires_at).getTime();
      if (txTime < opened || txTime > expires) { stats.skipped_window_closed++; continue; }

      // Nếu window đã matched bởi tx khác trước đó → bỏ
      if (win.status === "matched") { stats.skipped_already_matched++; continue; }

      const giverId = await resolveUser(admin, fromAddr);
      if (!giverId) { stats.skipped_external_giver++; continue; }
      if (giverId === newUser) { stats.skipped_self++; continue; }

      const { data: trust } = await admin.from("identity_trust_scores")
        .select("trust_confidence,sybil_flag").eq("user_id", giverId).maybeSingle();
      if (trust?.sybil_flag) { stats.skipped_low_tc++; continue; }
      if (trust && Number(trust.trust_confidence ?? 0) < minTC) { stats.skipped_low_tc++; continue; }

      stats.eligible++;
      if (dryRun) continue;

      // Insert link
      const { data: ins, error: insErr } = await admin.from("connector_links").insert({
        new_user_id: newUser,
        connector_user_id: giverId,
        tx_hash: t.tx_hash,
        chain: t.chain ?? "BSC",
        token_symbol: symbol,
        amount: amt,
        amount_usd: t.amount_usd ?? null,
        block_number: t.block_number ?? 0,
        tx_index: t.tx_index ?? 0,
        log_index: t.log_index ?? 0,
      }).select("id").maybeSingle();

      if (insErr) {
        if (String(insErr.code) === "23505") { stats.skipped_already_matched++; continue; }
        stats.errors++; continue;
      }
      if (!ins) { stats.errors++; continue; }

      await admin.from("connector_windows")
        .update({ status: "matched", matched_link_id: ins.id })
        .eq("user_id", newUser);

      await admin.from("light_actions").insert({
        user_id: giverId,
        action_type: "FIRST_GIVER_CONNECTOR",
        points: baseScore,
        metadata: { link_id: ins.id, new_user_id: newUser, tx_hash: t.tx_hash, token: symbol, amount: amt, backfilled: true },
      });

      stats.created++;
      const prev = summaryByNewUser.get(newUser);
      if (!prev) summaryByNewUser.set(newUser, { count: 1, firstLinkId: ins.id });
      else summaryByNewUser.set(newUser, { count: prev.count + 1, firstLinkId: prev.firstLinkId });
    }

    // 1 noti tổng kết cho mỗi new_user (chỉ khi không dry-run + có link tạo)
    if (!dryRun && summaryByNewUser.size > 0) {
      const notiRows = [...summaryByNewUser.entries()].map(([userId, info]) => ({
        user_id: userId,
        type: "connector_backfilled",
        title: "🌟 Connector của bạn vừa được ghi nhận",
        message: "Hệ thống vừa hoàn tất việc ghi nhận lại Connector chính thức cho bạn từ giao dịch trong vòng 7 ngày qua.",
        metadata: { link_id: info.firstLinkId, backfilled: true },
      }));
      // chunk 100
      for (let i = 0; i < notiRows.length; i += 100) {
        await admin.from("notifications").insert(notiRows.slice(i, i + 100));
      }
    }

    // Audit
    await admin.from("connector_admin_audit").insert({
      admin_id: adminId,
      action: "backfill_run",
      reason: dryRun ? "dry_run" : "execute",
      metadata: { since: sinceIso, days, stats, notified_users: dryRun ? 0 : summaryByNewUser.size },
    });

    return json({ ok: true, dry_run: dryRun, since: sinceIso, days, stats, notified_users: dryRun ? 0 : summaryByNewUser.size });
  } catch (e) {
    return json({ ok: false, reason: "exception", error: String(e) }, 500);
  }
});

async function resolveUser(admin: any, addr: string): Promise<string | null> {
  if (!addr) return null;
  const { data: p } = await admin.from("profiles").select("id")
    .or(`custodial_wallet_address.eq.${addr},wallet_address.eq.${addr},external_wallet_address.eq.${addr},public_wallet_address.eq.${addr}`)
    .limit(1).maybeSingle();
  if (p?.id) return p.id;
  const { data: cw } = await admin.from("custodial_wallets").select("user_id")
    .eq("wallet_address", addr).limit(1).maybeSingle();
  return cw?.user_id ?? null;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
