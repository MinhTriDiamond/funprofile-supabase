import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Token contract addresses on BSC Mainnet (lowercase)
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18 },
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3 },
};

// FUN token on BSC Testnet
const FUN_TOKEN_ADDRESS = "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6";

interface MoralisTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  token_decimals: string;
  token_symbol: string;
  token_name: string;
  address: string; // contract address
  block_timestamp: string;
  block_number: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");

    // Authenticate - require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const senderAddress: string = body.sender_address;
    const senderName: string = body.sender_name || "Unknown External Wallet";

    if (!senderAddress || !senderAddress.startsWith("0x")) {
      return new Response(JSON.stringify({ error: "sender_address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all profiles with public_wallet_address to map recipients
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, username, public_wallet_address, created_at")
      .not("public_wallet_address", "is", null);

    const walletToRecipient = new Map<string, { id: string; username: string; created_at: string }>();
    for (const p of profiles || []) {
      if (p.public_wallet_address) {
        walletToRecipient.set(p.public_wallet_address.toLowerCase(), { id: p.id, username: p.username, created_at: p.created_at });
      }
    }

    if (walletToRecipient.size === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, message: "No Fun Profile wallets found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ERC20 transfers FROM the sender address
    const moralisBaseUrl = "https://deep-index.moralis.io/api/v2.2";
    const headers = { "Accept": "application/json" };

    // Fetch BSC mainnet transfers
    const mainnetUrl = `${moralisBaseUrl}/${senderAddress}/erc20/transfers?chain=bsc&limit=100&order=DESC`;
    const mainnetRes = await moralisFetch(mainnetUrl, { headers });

    if (!mainnetRes.ok) {
      const errText = await mainnetRes.text();
      console.error("Moralis mainnet error:", mainnetRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Moralis API error: ${mainnetRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mainnetData = await mainnetRes.json();
    const mainnetTransfers: MoralisTransfer[] = mainnetData.result || [];

    // Fetch BSC testnet transfers (FUN token)
    const testnetUrl = `${moralisBaseUrl}/${senderAddress}/erc20/transfers?chain=bsc+testnet&limit=100&order=DESC`;
    const testnetRes = await moralisFetch(testnetUrl, { headers });

    let testnetTransfers: MoralisTransfer[] = [];
    if (testnetRes.ok) {
      const testnetData = await testnetRes.json();
      testnetTransfers = testnetData.result || [];
    } else {
      console.warn("Moralis testnet fetch failed:", testnetRes.status);
    }

    // Filter: only OUTGOING from sender AND incoming to a Fun Profile wallet
    const senderLower = senderAddress.toLowerCase();
    const allTransfers = [...mainnetTransfers, ...testnetTransfers].filter((t) => {
      const from = t.from_address?.toLowerCase();
      const to = t.to_address?.toLowerCase();
      return from === senderLower && walletToRecipient.has(to);
    });

    if (allTransfers.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, message: "No transfers from this wallet to Fun Profile users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing tx_hashes to avoid duplicates
    const txHashes = allTransfers.map((t) => t.transaction_hash).filter(Boolean);
    const { data: existingDonations } = await adminClient
      .from("donations")
      .select("tx_hash")
      .in("tx_hash", txHashes);

    const existingSet = new Set((existingDonations || []).map((d) => d.tx_hash));

    const newTransfers = allTransfers.filter(
      (t) => t.transaction_hash && !existingSet.has(t.transaction_hash)
    );

    if (newTransfers.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, message: "All transfers already recorded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build donation records
    const donationsToInsert: any[] = [];

    for (const transfer of newTransfers) {
      const contractAddr = transfer.address?.toLowerCase() || "";
      const tokenInfo = KNOWN_TOKENS[contractAddr];
      const isFun = contractAddr === FUN_TOKEN_ADDRESS;

      let tokenSymbol = transfer.token_symbol || "UNKNOWN";
      let tokenDecimals = parseInt(transfer.token_decimals) || 18;

      if (tokenInfo) {
        tokenSymbol = tokenInfo.symbol;
        tokenDecimals = tokenInfo.decimals;
      } else if (isFun) {
        tokenSymbol = "FUN";
        tokenDecimals = 18;
      }

      // Only process known tokens
      if (!tokenInfo && !isFun) continue;

      const rawValue = BigInt(transfer.value || "0");
      const divisor = BigInt(10 ** tokenDecimals);
      const intPart = rawValue / divisor;
      const fracPart = rawValue % divisor;
      const amount = `${intPart}.${fracPart.toString().padStart(tokenDecimals, "0")}`.replace(/\.?0+$/, "") || "0";

      const recipientWallet = transfer.to_address.toLowerCase();
      const recipient = walletToRecipient.get(recipientWallet);
      if (!recipient) continue;

      // Skip transfers before recipient registration
      const txTime = new Date(transfer.block_timestamp).getTime();
      const regTime = new Date(recipient.created_at).getTime();
      if (txTime < regTime) continue;

      donationsToInsert.push({
        sender_id: null,
        sender_address: senderLower,
        recipient_id: recipient.id,
        amount,
        token_symbol: tokenSymbol,
        token_address: contractAddr,
        chain_id: isFun ? 97 : 56,
        tx_hash: transfer.transaction_hash,
        status: "confirmed",
        confirmed_at: transfer.block_timestamp,
        created_at: transfer.block_timestamp, // sync with onchain time
        is_external: true,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: { sender_name: senderName },
      });
    }

    if (donationsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, message: "No known token transfers to record" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert donations
    const { error: insertError } = await adminClient
      .from("donations")
      .insert(donationsToInsert);

    if (insertError) {
      console.error("Insert donations error:", insertError);
      throw new Error(`Failed to insert donations: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        newTransfers: donationsToInsert.length,
        message: `Recorded ${donationsToInsert.length} transfer(s) from ${senderName}`,
        details: donationsToInsert.map(d => ({
          recipient: walletToRecipient.get(d.sender_address)?.username || d.recipient_id,
          amount: d.amount,
          token: d.token_symbol,
          tx: d.tx_hash,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("detect-incoming-transfers error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
