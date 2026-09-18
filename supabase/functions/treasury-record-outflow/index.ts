/**
 * Treasury Record Outflow — Admin ghi nhận giao dịch CHI từ ví treasury
 * Verify tx_hash on-chain (from=treasury, Transfer CAMLY), insert treasury_flows
 * và trừ vault chỉ định. Idempotent qua check tx_hash trùng.
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
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

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

    const body = await req.json().catch(() => ({}));
    const { tx_hash, vault_key, reason, recipient_label } = body as {
      tx_hash?: string; vault_key?: string; reason?: string; recipient_label?: string;
    };

    if (!tx_hash || !/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
      return json({ error: "tx_hash invalid" }, 400);
    }
    if (!vault_key) return json({ error: "vault_key required" }, 400);

    const treasuryAddress = Deno.env.get("TREASURY_WALLET_ADDRESS")?.toLowerCase();
    if (!treasuryAddress) return json({ error: "Treasury not configured" }, 500);

    // Idempotent check
    const { data: existing } = await admin.from("treasury_flows")
      .select("id").eq("flow_type", "outflow")
      .eq("metadata->>tx_hash", tx_hash).maybeSingle();
    if (existing) return json({ error: "tx_hash already recorded", flow_id: existing.id }, 409);

    // Verify on-chain
    const client = createPublicClient({ chain: bsc, transport: http() });
    const receipt = await client.getTransactionReceipt({ hash: tx_hash as `0x${string}` });
    if (!receipt || receipt.status !== "success") {
      return json({ error: "Tx not found or failed on-chain" }, 400);
    }

    // Find Transfer log from treasury → ANY, of CAMLY token
    const log = receipt.logs.find((l) =>
      l.address.toLowerCase() === CAMLY_CONTRACT.toLowerCase() &&
      l.topics[0] === TRANSFER_TOPIC &&
      "0x" + l.topics[1]!.slice(26).toLowerCase() === treasuryAddress
    );
    if (!log) return json({ error: "Không tìm thấy Transfer CAMLY từ ví treasury trong tx này" }, 400);

    const rawAmount = BigInt(log.data);
    const amount = Number(formatUnits(rawAmount, CAMLY_DECIMALS));
    const toAddr = "0x" + log.topics[2]!.slice(26);

    // Atomic: insert flow + debit vault CAMLY trong 1 transaction (RPC SECURITY DEFINER)
    const { data: result, error: rpcErr } = await admin.rpc("treasury_record_outflow_atomic", {
      _vault_key: vault_key,
      _token_symbol: TOKEN_SYMBOL,
      _amount: amount,
      _reason: reason || "Chi từ ví treasury (ghi nhận thủ công)",
      _metadata: { tx_hash, to: toAddr, recipient_label: recipient_label || null, recorded_by: user.id },
      _reference_table: "onchain_tx",
      _reference_id: null,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    return json({
      success: true,
      flow_id: (result as Record<string, unknown>)?.flow_id,
      amount,
      token_symbol: TOKEN_SYMBOL,
      to: toAddr,
      vault_key,
      balance_after: (result as Record<string, unknown>)?.balance_after,
    });
  } catch (e) {
    console.error("[treasury-record-outflow] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
