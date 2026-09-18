/**
 * Treasury Health Cron — Daily 04:00 UTC
 * Kiểm tra BNB/CAMLY của ví treasury, độ lệch sổ sách, notify admin nếu bất thường.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, formatUnits, parseAbi, formatEther } from "npm:viem@2";
import { bsc } from "npm:viem@2/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CAMLY_CONTRACT = "0x0910320181889feFDE0BB1Ca63962b0A8882e413";
const CAMLY_DECIMALS = 3;
const BNB_THRESHOLD = 0.01;
const CAMLY_THRESHOLD = 100_000;
const DRIFT_PCT_THRESHOLD = 5;

const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const treasury = Deno.env.get("TREASURY_WALLET_ADDRESS");
    if (!treasury) return json({ error: "Treasury not configured" }, 500);

    const client = createPublicClient({ chain: bsc, transport: http() });
    const [bnbRaw, camlyRaw] = await Promise.all([
      client.getBalance({ address: treasury as `0x${string}` }),
      client.readContract({
        address: CAMLY_CONTRACT as `0x${string}`,
        abi: ERC20_ABI, functionName: "balanceOf",
        args: [treasury as `0x${string}`],
      }) as Promise<bigint>,
    ]);

    const bnb = Number(formatEther(bnbRaw));
    const camly = Number(formatUnits(camlyRaw, CAMLY_DECIMALS));

    // Compute ledger drift
    const [{ data: petAll }, { data: mbAll }, { data: outflows }] = await Promise.all([
      admin.from("pet_shop_orders").select("price_camly").eq("status", "confirmed"),
      admin.from("mystery_box_orders").select("price_camly").eq("status", "confirmed"),
      admin.from("treasury_flows").select("amount").eq("flow_type", "outflow"),
    ]);
    const inflow = [...(petAll || []), ...(mbAll || [])]
      .reduce((a: number, r: any) => a + Number(r.price_camly || 0), 0);
    const outflow = (outflows || []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    const expected = inflow - outflow;
    const driftPct = expected > 0 ? Math.abs((camly - expected) / expected) * 100 : 0;

    // Notify admins
    const { data: admins } = await admin.from("user_roles")
      .select("user_id").eq("role", "admin");

    const alerts: string[] = [];
    if (bnb < BNB_THRESHOLD) alerts.push("treasury_low_gas");
    if (camly < CAMLY_THRESHOLD) alerts.push("treasury_low_camly");
    if (driftPct > DRIFT_PCT_THRESHOLD) alerts.push("treasury_ledger_drift");

    for (const adminUser of admins || []) {
      for (const alertType of alerts) {
        const data: Record<string, unknown> = { bnb, camly, expected, drift_pct: driftPct };
        let title = "";
        let message = "";
        if (alertType === "treasury_low_gas") {
          title = "⚠️ Ví Treasury sắp hết BNB";
          message = `Số dư BNB chỉ còn ${bnb.toFixed(4)} (ngưỡng ${BNB_THRESHOLD}). Cha nạp thêm gas để hệ thống tiếp tục hoạt động.`;
        } else if (alertType === "treasury_low_camly") {
          title = "⚠️ Ví Treasury sắp hết CAMLY";
          message = `Số dư CAMLY chỉ còn ${camly.toLocaleString("vi-VN")} (ngưỡng ${CAMLY_THRESHOLD.toLocaleString("vi-VN")}).`;
        } else {
          title = "⚠️ Sổ sách Treasury lệch";
          message = `On-chain ${camly.toLocaleString("vi-VN")} CAMLY vs dự kiến ${expected.toLocaleString("vi-VN")} (lệch ${driftPct.toFixed(2)}%).`;
        }
        await admin.from("notifications").insert({
          user_id: adminUser.user_id,
          type: alertType,
          title, message,
          metadata: data,
        });
      }
    }

    return json({ bnb, camly, expected, drift_pct: driftPct, alerts, notified: (admins || []).length });
  } catch (e) {
    console.error("[treasury-health-cron] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
