// Mystery Box Shop: verify on-chain CAMLY tx and finalize purchase.
// Mirrors pet-shop-confirm pattern (BSC RPC, Transfer log match, finalize RPC).
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPC_ENDPOINTS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
];

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  for (const ep of RPC_ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (j?.error) continue;
      return j.result;
    } catch {
      /* try next */
    }
  }
  return null;
}

function topicToAddr(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResp({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResp({ error: "UNAUTHENTICATED" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return jsonResp({ error: "UNAUTHENTICATED" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId: string | undefined = body?.order_id;
    const txHash: string | undefined = body?.tx_hash;
    if (!orderId || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return jsonResp({ error: "BAD_INPUT" }, 400);
    }

    const admin = createAdminClient();

    // Load order
    const { data: order, error: orderErr } = await admin
      .from("mystery_box_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) return jsonResp({ error: "ORDER_NOT_FOUND" }, 404);
    if (order.user_id !== user.id) return jsonResp({ error: "FORBIDDEN" }, 403);
    if (order.status !== "pending") {
      return jsonResp({ error: "ORDER_NOT_PENDING", status: order.status }, 409);
    }
    if (new Date(order.expires_at).getTime() < Date.now()) {
      await admin.rpc("mystery_box_fail_order", { _order_id: orderId, _reason: "EXPIRED" });
      return jsonResp({ error: "EXPIRED" }, 410);
    }

    // Load config
    const { data: cfg } = await admin
      .from("mystery_box_shop_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!cfg) return jsonResp({ error: "CONFIG_MISSING" }, 500);

    // Fetch receipt
    const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
    if (!receipt) return jsonResp({ error: "TX_NOT_FOUND" }, 404);
    if (receipt.status !== "0x1") {
      await admin.rpc("mystery_box_fail_order", { _order_id: orderId, _reason: "TX_REVERTED" });
      return jsonResp({ error: "TX_REVERTED" }, 400);
    }

    // Confirmations
    const latestHex = await rpcCall("eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const txBlock = parseInt(receipt.blockNumber, 16);
    if (latest - txBlock + 1 < (cfg.min_confirmations ?? 1)) {
      return jsonResp({ error: "NOT_ENOUGH_CONFIRMATIONS" }, 425);
    }

    // Find matching CAMLY Transfer to treasury
    const treasury = (cfg.treasury_address as string).toLowerCase();
    const camlyToken = (cfg.camly_token as string).toLowerCase();
    const decimals = cfg.camly_decimals ?? 3;
    const requiredWei = BigInt(order.price_camly) * (10n ** BigInt(decimals));

    let fromAddr = "";
    let matched = false;
    for (const log of receipt.logs || []) {
      if ((log.address as string).toLowerCase() !== camlyToken) continue;
      if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue;
      const to = topicToAddr(log.topics[2]);
      if (to !== treasury) continue;
      const value = BigInt(log.data ?? "0x0");
      if (value < requiredWei) continue;
      fromAddr = topicToAddr(log.topics[1]);
      matched = true;
      break;
    }

    if (!matched) {
      await admin.rpc("mystery_box_fail_order", { _order_id: orderId, _reason: "TRANSFER_NOT_MATCHED" });
      return jsonResp({ error: "TRANSFER_NOT_MATCHED" }, 400);
    }

    // Finalize
    const { data: fin, error: finErr } = await admin.rpc("mystery_box_finalize_order", {
      _order_id: orderId,
      _tx_hash: txHash,
      _from_address: fromAddr,
    });
    if (finErr) {
      return jsonResp({ error: "FINALIZE_FAILED", detail: finErr.message }, 500);
    }
    return jsonResp({ ok: true, result: fin }, 200);
  } catch (e) {
    return jsonResp({ error: "INTERNAL", detail: String(e) }, 500);
  }
});
