import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CAMLY_CONTRACT = "0x0910320181889feFDE0BB1Ca63962b0A8882e413";
const CAMLY_DECIMALS = 3;
const TREASURY_SENDER_ID = "9e702a6f-4035-4f30-9c04-f2e21419b37a";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabaseAnon = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    const treasuryAddress = Deno.env.get("TREASURY_WALLET_ADDRESS")?.trim();

    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!treasuryAddress) {
      return new Response(JSON.stringify({ error: "TREASURY_WALLET_ADDRESS not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "scan";

    // Step 1: Fetch all outgoing CAMLY transfers from Treasury via Moralis
    console.log("Fetching outgoing CAMLY transfers from Treasury:", treasuryAddress);

    let allTransfers: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({
        "contract_addresses[]": CAMLY_CONTRACT,
        chain: "bsc",
        limit: "100",
        order: "DESC",
      });
      if (cursor) params.set("cursor", cursor);

      const moralisUrl = `https://deep-index.moralis.io/api/v2/${treasuryAddress}/erc20/transfers?${params.toString()}`;
      const moralisRes = await moralisFetch(moralisUrl, {
        headers: { accept: "application/json" },
      });

      if (!moralisRes.ok) {
        const errText = await moralisRes.text();
        console.error("Moralis API error:", moralisRes.status, errText);
        throw new Error(`Moralis API error: ${moralisRes.status}`);
      }

      const data = await moralisRes.json();
      const transfers = data.result || [];

      // Filter only OUTGOING transfers (from_address = treasury)
      const outgoing = transfers.filter(
        (t: any) => t.from_address?.toLowerCase() === treasuryAddress.toLowerCase()
      );
      allTransfers = allTransfers.concat(outgoing);

      cursor = data.cursor || null;
    } while (cursor);

    console.log(`Found ${allTransfers.length} outgoing CAMLY transfers on-chain`);

    // Calculate total on-chain amount
    let totalOnChain = 0;
    for (const tx of allTransfers) {
      const rawAmount = BigInt(tx.value || "0");
      totalOnChain += Number(rawAmount) / Math.pow(10, CAMLY_DECIMALS);
    }

    // Step 2: Get all tx_hashes from reward_claims and donations
    const { data: claimHashes } = await adminClient
      .from("reward_claims")
      .select("tx_hash");
    const { data: donationHashes } = await adminClient
      .from("donations")
      .select("tx_hash");

    const existingHashes = new Set<string>();
    for (const c of claimHashes || []) {
      if (c.tx_hash) existingHashes.add(c.tx_hash.toLowerCase());
    }
    for (const d of donationHashes || []) {
      if (d.tx_hash) existingHashes.add(d.tx_hash.toLowerCase());
    }

    // Step 3: Find missing transactions
    const missingTx = allTransfers.filter(
      (t: any) => t.transaction_hash && !existingHashes.has(t.transaction_hash.toLowerCase())
    );

    console.log(`Missing transactions: ${missingTx.length}`);

    // Calculate totals
    const { data: claimTotal } = await adminClient.rpc("get_app_stats").maybeSingle();

    let totalMissingAmount = 0;
    const missingDetails = [];

    // Get profiles for wallet mapping (all wallet fields)
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, username, wallet_address, public_wallet_address, external_wallet_address, avatar_url");

    const walletMap = new Map<string, { id: string; username: string; avatar_url: string | null }>();
    for (const p of profiles || []) {
      const info = { id: p.id, username: p.username, avatar_url: p.avatar_url };
      const addrs = [p.wallet_address, p.public_wallet_address, p.external_wallet_address];
      for (const addr of addrs) {
        if (addr && !walletMap.has(addr.toLowerCase())) {
          walletMap.set(addr.toLowerCase(), info);
        }
      }
    }

    // Also map reward_claims wallet addresses
    const { data: claimWallets } = await adminClient
      .from("reward_claims")
      .select("user_id, wallet_address");
    for (const rc of claimWallets || []) {
      if (rc.wallet_address && !walletMap.has(rc.wallet_address.toLowerCase())) {
        const profile = (profiles || []).find((p: any) => p.id === rc.user_id);
        if (profile) {
          walletMap.set(rc.wallet_address.toLowerCase(), {
            id: profile.id,
            username: profile.username,
            avatar_url: profile.avatar_url,
          });
        }
      }
    }

    for (const tx of missingTx) {
      const rawAmount = BigInt(tx.value || "0");
      const amount = Number(rawAmount) / Math.pow(10, CAMLY_DECIMALS);
      totalMissingAmount += amount;

      const recipient = tx.to_address ? walletMap.get(tx.to_address.toLowerCase()) : null;

      missingDetails.push({
        tx_hash: tx.transaction_hash,
        from_address: tx.from_address,
        to_address: tx.to_address,
        amount,
        block_number: tx.block_number,
        block_timestamp: tx.block_timestamp,
        recipient_id: recipient?.id || null,
        recipient_username: recipient?.username || null,
        recipient_avatar_url: recipient?.avatar_url || null,
        mappable: !!recipient,
      });
    }

    // If mode is "backfill", insert ALL missing transactions (mappable + unmappable)
    if (mode === "backfill") {
      const toInsert = missingDetails.map((d) => ({
        sender_id: TREASURY_SENDER_ID,
        recipient_id: d.recipient_id || null,
        amount: String(d.amount),
        token_symbol: "CAMLY",
        token_address: CAMLY_CONTRACT,
        chain_id: 56,
        tx_hash: d.tx_hash,
        status: "confirmed",
        confirmed_at: d.block_timestamp,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          source: d.mappable ? "backfill_from_onchain" : "backfill_unmapped",
          block_number: d.block_number,
          to_address: d.to_address,
          is_unmapped: !d.mappable,
        },
      }));

      let inserted = 0;
      let skipped = 0;

      for (const record of toInsert) {
        const { error: insertError } = await adminClient
          .from("donations")
          .insert(record);
        if (insertError) {
          console.warn(`Skip duplicate or error for ${record.tx_hash}:`, insertError.message);
          skipped++;
        } else {
          inserted++;
        }
      }

      const mappableCount = missingDetails.filter((d) => d.mappable).length;
      return new Response(
        JSON.stringify({
          mode: "backfill",
          total_onchain: totalOnChain,
          total_missing: totalMissingAmount,
          missing_count: missingTx.length,
          mappable_count: mappableCount,
          unmappable_count: missingTx.length - mappableCount,
          inserted,
          skipped,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: scan mode - return summary
    const mappableCount = missingDetails.filter((d) => d.mappable).length;
    const unmappableCount = missingDetails.length - mappableCount;

    return new Response(
      JSON.stringify({
        mode: "scan",
        treasury_address: treasuryAddress,
        total_onchain_transfers: allTransfers.length,
        total_onchain_amount: totalOnChain,
        total_db_recorded: existingHashes.size,
        missing_count: missingTx.length,
        missing_amount: totalMissingAmount,
        mappable_count: mappableCount,
        unmappable_count: unmappableCount,
        missing_transactions: missingDetails,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("scan-treasury-outgoing error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
