// Phase 6 - Pet Cosmetic Shop: verify on-chain CAMLY tx and finalize order.
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

function padAddrToTopic(addr: string): string {
  return "0x" + "0".repeat(24) + addr.toLowerCase().replace(/^0x/, "");
}

function topicToAddr(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: uerr,
    } = await userClient.auth.getUser();
    if (uerr || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orderId: string | undefined = body?.order_id;
    const txHash: string | undefined = body?.tx_hash;
    if (!orderId || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return new Response(
        JSON.stringify({ error: "BAD_INPUT" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createAdminClient();

    // Load order
    const { data: order, error: orderErr } = await admin
      .from("pet_shop_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "ORDER_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "ORDER_NOT_PENDING", status: order.status }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (new Date(order.expires_at).getTime() < Date.now()) {
      await admin.rpc("pet_shop_fail_order", {
        _order_id: orderId,
        _reason: "EXPIRED",
      });
      return new Response(JSON.stringify({ error: "EXPIRED" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load config
    const { data: cfg } = await admin
      .from("pet_shop_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!cfg) {
      return new Response(JSON.stringify({ error: "CONFIG_MISSING" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch receipt
    const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return new Response(JSON.stringify({ error: "TX_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (receipt.status !== "0x1") {
      await admin.rpc("pet_shop_fail_order", {
        _order_id: orderId,
        _reason: "TX_REVERTED",
      });
      return new Response(JSON.stringify({ error: "TX_REVERTED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify confirmations
    const latestHex = await rpcCall("eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const txBlock = parseInt(receipt.blockNumber, 16);
    if (latest - txBlock + 1 < (cfg.min_confirmations ?? 1)) {
      return new Response(
        JSON.stringify({ error: "NOT_ENOUGH_CONFIRMATIONS" }),
        {
          status: 425,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Find matching CAMLY Transfer log to treasury, with amount >= price_camly * 10^decimals
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
      await admin.rpc("pet_shop_fail_order", {
        _order_id: orderId,
        _reason: "TRANSFER_NOT_MATCHED",
      });
      return new Response(
        JSON.stringify({ error: "TRANSFER_NOT_MATCHED" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Finalize
    const { data: fin, error: finErr } = await admin.rpc(
      "pet_shop_finalize_order",
      {
        _order_id: orderId,
        _tx_hash: txHash,
        _from_address: fromAddr,
      },
    );
    if (finErr) {
      return new Response(
        JSON.stringify({ error: "FINALIZE_FAILED", detail: finErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Best-effort: gửi notification "pet_shop_purchased" để user nhận được
    // chuông báo kể cả khi đã đóng dialog mua hàng.
    try {
      const { data: cosmetic } = await admin
        .from("pet_cosmetics_catalog")
        .select("name_vi, slug, rarity")
        .eq("id", order.cosmetic_id)
        .single();
      const itemName = (cosmetic as any)?.name_vi ?? "trang phục Lumi";
      await (admin as any).from("notifications").insert({
        user_id: order.user_id,
        type: "pet_shop_purchased",
        title: "Đã nhận trang phục Lumi",
        message: `Bạn vừa nhận được "${itemName}". Mở Tủ đồ để trang bị cho Lumi nhé!`,
        data: {
          order_id: orderId,
          cosmetic_id: order.cosmetic_id,
          cosmetic_slug: (cosmetic as any)?.slug ?? null,
          rarity: (cosmetic as any)?.rarity ?? null,
          tx_hash: txHash,
          price_camly: order.price_camly,
        },
      });
    } catch (_e) {
      // Không chặn flow nếu insert notification thất bại
    }

    return new Response(JSON.stringify({ ok: true, result: fin }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "INTERNAL", detail: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
