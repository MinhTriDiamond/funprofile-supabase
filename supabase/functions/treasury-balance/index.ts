import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, formatUnits, parseAbi } from "npm:viem@2";
import { bsc } from "npm:viem@2/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// CAMLY Token on BSC - 3 decimals
const CAMLY_CONTRACT = "0x0910320181889feFDE0BB1Ca63962b0A8882e413";
const CAMLY_DECIMALS = 3;

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Check admin role using service role client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const { data: hasRole, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (roleError || !hasRole) {
      console.error("Role check failed:", roleError);
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Treasury wallet address
    const treasuryAddress = Deno.env.get("TREASURY_WALLET_ADDRESS");
    if (!treasuryAddress) {
      return new Response(
        JSON.stringify({ error: "Treasury wallet not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching balances for Treasury:", treasuryAddress);

    // Create public client for BSC (read-only, no private key needed)
    const publicClient = createPublicClient({
      chain: bsc,
      transport: http("https://bsc-dataseed.binance.org/"),
    });

    // Fetch BNB and CAMLY balances in parallel
    const [bnbBalanceWei, camlyBalanceRaw] = await Promise.all([
      publicClient.getBalance({ address: treasuryAddress as `0x${string}` }),
      publicClient.readContract({
        address: CAMLY_CONTRACT as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [treasuryAddress as `0x${string}`],
      }),
    ]);

    // Format balances
    const bnbBalance = formatUnits(bnbBalanceWei, 18);
    const camlyBalance = formatUnits(camlyBalanceRaw as bigint, CAMLY_DECIMALS);

    console.log("Balances fetched - BNB:", bnbBalance, "CAMLY:", camlyBalance);

    // Return balances
    return new Response(
      JSON.stringify({
        treasury_address: treasuryAddress,
        bnb_balance: bnbBalance,
        camly_balance: camlyBalance,
        updated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching treasury balance:", error);
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch treasury balance",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
