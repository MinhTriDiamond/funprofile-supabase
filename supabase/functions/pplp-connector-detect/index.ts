// Connector – First On-chain Giver detector
// Phase 1: off-chain DB. Hook gọi từ scanner sau khi insert wallet_transfers thành công.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectInput {
  tx_hash: string;
  chain: string; // 'BSC' | 'BTC' | other
  token_symbol: string;
  amount: number | string;
  amount_usd?: number | null;
  from_address: string;
  to_address: string;
  block_number?: number;
  tx_index?: number;
  log_index?: number;
}

function norm(addr: string | null | undefined): string {
  if (!addr) return "";
  return addr.trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { persistSession: false } }
    );

    const body = (await req.json()) as DetectInput;

    if (!body?.tx_hash || !body?.from_address || !body?.to_address || !body?.token_symbol) {
      return json({ ok: false, reason: "missing_fields" }, 400);
    }

    // === Load config ===
    const { data: cfgRows } = await supabase
      .from("connector_config")
      .select("key,value");
    const cfg = Object.fromEntries((cfgRows ?? []).map((r: any) => [r.key, r.value]));
    if (cfg.enabled === false) return json({ ok: false, reason: "disabled" });

    const minAmounts = cfg.min_amounts ?? {};
    const whitelist: string[] = cfg.whitelist_tokens ?? [];
    const minTC: number = Number(cfg.min_tc ?? 0.15);
    const baseScore: number = Number(cfg.base_score ?? 10);

    const symbol = String(body.token_symbol).toUpperCase();
    if (whitelist.length && !whitelist.includes(symbol)) {
      return json({ ok: false, reason: "token_not_whitelisted" });
    }

    const amt = Number(body.amount);
    const minAmt = Number(minAmounts[symbol] ?? Infinity);
    if (!isFinite(amt) || amt < minAmt) {
      return json({ ok: false, reason: "amount_below_min", min: minAmt });
    }

    const toAddr = norm(body.to_address);
    const fromAddr = norm(body.from_address);

    // === Resolve to_address -> new_user ===
    const newUser = await resolveUserByAddress(supabase, toAddr);
    if (!newUser) return json({ ok: false, reason: "to_not_funrich_user" });

    // === Window check ===
    const { data: win } = await supabase
      .from("connector_windows")
      .select("id,status,expires_at")
      .eq("user_id", newUser)
      .maybeSingle();
    if (!win) return json({ ok: false, reason: "no_window" });
    if (win.status !== "open") return json({ ok: false, reason: `window_${win.status}` });
    if (new Date(win.expires_at).getTime() < Date.now()) {
      return json({ ok: false, reason: "window_expired" });
    }

    // === Resolve from_address -> connector user (must be FUN.Rich user) ===
    const connectorUser = await resolveUserByAddress(supabase, fromAddr);
    if (!connectorUser) return json({ ok: false, reason: "from_external_wallet" });
    if (connectorUser === newUser) return json({ ok: false, reason: "self_gift" });

    // === Trust Confidence gate (best-effort, không block nếu chưa có) ===
    const { data: trust } = await supabase
      .from("identity_trust_scores")
      .select("trust_confidence,sybil_flag")
      .eq("user_id", connectorUser)
      .maybeSingle();
    if (trust) {
      if (trust.sybil_flag) return json({ ok: false, reason: "connector_sybil_flagged" });
      if (Number(trust.trust_confidence ?? 0) < minTC) {
        return json({ ok: false, reason: "connector_low_tc", tc: trust.trust_confidence });
      }
    }

    // === Insert link (idempotent qua unique tx_hash+log_index, unique new_user_id) ===
    const { data: ins, error: insErr } = await supabase
      .from("connector_links")
      .insert({
        new_user_id: newUser,
        connector_user_id: connectorUser,
        tx_hash: body.tx_hash,
        chain: body.chain ?? "BSC",
        token_symbol: symbol,
        amount: amt,
        amount_usd: body.amount_usd ?? null,
        block_number: body.block_number ?? 0,
        tx_index: body.tx_index ?? 0,
        log_index: body.log_index ?? 0,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      // Race / duplicate
      if (String(insErr.message).includes("duplicate") || String(insErr.code) === "23505") {
        return json({ ok: false, reason: "already_matched" });
      }
      return json({ ok: false, reason: "insert_error", error: insErr.message }, 500);
    }
    if (!ins) return json({ ok: false, reason: "insert_no_row" }, 500);

    // === Update window ===
    await supabase
      .from("connector_windows")
      .update({ status: "matched", matched_link_id: ins.id })
      .eq("user_id", newUser);

    // === Award Light Score base ===
    await supabase.from("light_actions").insert({
      user_id: connectorUser,
      action_type: "FIRST_GIVER_CONNECTOR",
      points: baseScore,
      metadata: {
        link_id: ins.id,
        new_user_id: newUser,
        tx_hash: body.tx_hash,
        token: symbol,
        amount: amt,
      },
    });

    // === Notifications ===
    await supabase.from("notifications").insert([
      {
        user_id: newUser,
        type: "connector_matched_as_new_user",
        title: "🌟 Connector of Light được ghi nhận",
        message: "Người Dẫn Sáng đầu tiên của bạn đã được ghi nhận trên hệ thống.",
        metadata: { link_id: ins.id, connector_user_id: connectorUser },
      },
      {
        user_id: connectorUser,
        type: "connector_matched_as_giver",
        title: "💫 Bạn là First Giver",
        message: `Bạn vừa trở thành Connector chính thức và nhận +${baseScore} Light Score.`,
        metadata: { link_id: ins.id, new_user_id: newUser, base_score: baseScore },
      },
    ]);

    return json({ ok: true, link_id: ins.id, connector_user_id: connectorUser });
  } catch (e) {
    return json({ ok: false, reason: "exception", error: String(e) }, 500);
  }
});

async function resolveUserByAddress(supabase: any, addr: string): Promise<string | null> {
  if (!addr) return null;
  // 1. profiles.custodial_wallet_address / wallet_address / external_wallet_address / public_wallet_address
  const { data: p } = await supabase
    .from("profiles")
    .select("id")
    .or(
      `custodial_wallet_address.eq.${addr},wallet_address.eq.${addr},external_wallet_address.eq.${addr},public_wallet_address.eq.${addr}`
    )
    .limit(1)
    .maybeSingle();
  if (p?.id) return p.id;

  // 2. custodial_wallets table
  const { data: cw } = await supabase
    .from("custodial_wallets")
    .select("user_id")
    .eq("wallet_address", addr)
    .limit(1)
    .maybeSingle();
  if (cw?.user_id) return cw.user_id;

  return null;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
