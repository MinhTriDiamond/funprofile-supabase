/**
 * Treasury Overview — Tổng quan thu/chi ví treasury cho admin
 * Trả số dư on-chain (gọi treasury-balance), tổng inflow từ Pet Shop + Mystery Box,
 * tổng outflow sổ sách, độ lệch, top spenders, breakdown theo nguồn.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, formatUnits, parseAbi } from "npm:viem@2";
import { bsc } from "npm:viem@2/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CAMLY_CONTRACT = "0x0910320181889feFDE0BB1Ca63962b0A8882e413";
const CAMLY_DECIMALS = 3;
const TOKEN_SYMBOL = "CAMLY";
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );
    const { data: hasRole } = await admin.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!hasRole) return json({ error: "Admin access required" }, 403);

    const treasuryAddress = Deno.env.get("TREASURY_WALLET_ADDRESS");
    if (!treasuryAddress) return json({ error: "Treasury wallet not configured" }, 500);

    // 1) On-chain CAMLY balance
    let onchainCamly = 0;
    try {
      const client = createPublicClient({ chain: bsc, transport: http() });
      const bal = await client.readContract({
        address: CAMLY_CONTRACT as `0x${string}`,
        abi: ERC20_ABI, functionName: "balanceOf",
        args: [treasuryAddress as `0x${string}`],
      });
      onchainCamly = Number(formatUnits(bal as bigint, CAMLY_DECIMALS));
    } catch (e) {
      console.error("[treasury-overview] balance fetch failed", e);
    }

    // 2) Tổng hợp inflow/outflow/top spenders — tính SQL-side, không chạm max-rows
    const { data: ov, error: ovErr } = await admin.rpc("get_treasury_camly_overview");
    if (ovErr) {
      console.error("[treasury-overview] rpc failed", ovErr);
      return json({ error: ovErr.message }, 500);
    }
    const overview = (ov ?? {}) as any;
    const inflows = overview.inflows ?? {};
    const petShop = inflows.pet_shop ?? {};
    const mysteryBox = inflows.mystery_box ?? {};
    const num = (v: unknown) => Number(v ?? 0);
    const bucket = (b: any) => ({ sum: num(b?.sum), count: num(b?.count) });

    const totalOutflow = num(overview.outflow_total);
    const totalInflow = num(inflows.total_all_time);
    const expectedOnchain = totalInflow - totalOutflow;
    const drift = onchainCamly - expectedOnchain;
    const driftPct = expectedOnchain > 0 ? (drift / expectedOnchain) * 100 : 0;
    const topSpenders = ((overview.top_spenders ?? []) as any[]).map((r) => ({
      ...r,
      total_camly: num(r?.total_camly),
    }));

    // 6) Vaults CAMLY (ledger nội bộ)
    const { data: camlyVaults } = await admin.from("treasury_vaults")
      .select("vault_key, vault_name, token_symbol, balance, total_inflow, total_outflow, allocation_pct, is_active")
      .eq("token_symbol", TOKEN_SYMBOL);

    return json({
      treasury_address: treasuryAddress,
      onchain_camly: onchainCamly,
      inflows: {
        pet_shop: {
          d7: bucket(petShop.d7), d30: bucket(petShop.d30),
          d90: bucket(petShop.d90), all: bucket(petShop.all),
        },
        mystery_box: {
          d7: bucket(mysteryBox.d7), d30: bucket(mysteryBox.d30),
          d90: bucket(mysteryBox.d90), all: bucket(mysteryBox.all),
        },
        total_all_time: totalInflow,
      },
      outflows: { total_all_time: totalOutflow },
      ledger: {
        expected_onchain: expectedOnchain,
        actual_onchain: onchainCamly,
        drift,
        drift_pct: driftPct,
        is_healthy: Math.abs(driftPct) < 1,
      },
      token_symbol: TOKEN_SYMBOL,
      vaults: camlyVaults || [],
      top_spenders: topSpenders,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[treasury-overview] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
