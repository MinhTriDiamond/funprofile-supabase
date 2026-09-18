import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } =
      await userClient.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.user.id;

    // Check admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode, transactionIds } = await req.json();

    if (mode === "scan") {
      // Find transactions that don't have matching donations
      const { data: allTx, error: txError } = await adminClient
        .from("transactions")
        .select("id, user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, status, created_at")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (txError) {
        throw new Error(`Failed to fetch transactions: ${txError.message}`);
      }

      if (!allTx || allTx.length === 0) {
        return new Response(
          JSON.stringify({ missing: [], unmappable: [], totalScanned: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get existing donation tx_hashes
      const txHashes = allTx.map((t) => t.tx_hash).filter(Boolean);
      const { data: existingDonations } = await adminClient
        .from("donations")
        .select("tx_hash")
        .in("tx_hash", txHashes);

      const existingSet = new Set(
        (existingDonations || []).map((d) => d.tx_hash)
      );

      // Filter missing
      const missingTx = allTx.filter((t) => t.tx_hash && !existingSet.has(t.tx_hash));

      if (missingTx.length === 0) {
        return new Response(
          JSON.stringify({ missing: [], unmappable: [], totalScanned: allTx.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get all unique to_addresses for mapping
      const toAddresses = [
        ...new Set(missingTx.map((t) => t.to_address?.toLowerCase()).filter(Boolean)),
      ];

      // Fetch profiles by wallet_address
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, username, avatar_url, wallet_address, public_wallet_address, external_wallet_address");

      // Build wallet -> profile map (case-insensitive)
      const walletMap = new Map<string, { id: string; username: string; avatar_url: string | null }>();
      for (const p of profiles || []) {
        const profileData = { id: p.id, username: p.username, avatar_url: p.avatar_url };
        if (p.wallet_address) walletMap.set(p.wallet_address.toLowerCase(), profileData);
        if (p.public_wallet_address) walletMap.set(p.public_wallet_address.toLowerCase(), profileData);
        if (p.external_wallet_address) walletMap.set(p.external_wallet_address.toLowerCase(), profileData);
      }

      // Also build user_id -> profile map for sender info
      const userMap = new Map<string, { username: string; avatar_url: string | null }>();
      for (const p of profiles || []) {
        userMap.set(p.id, { username: p.username, avatar_url: p.avatar_url });
      }

      const mappable: any[] = [];
      const unmappable: any[] = [];

      for (const tx of missingTx) {
        const recipientProfile = tx.to_address
          ? walletMap.get(tx.to_address.toLowerCase())
          : null;
        const senderInfo = userMap.get(tx.user_id);

        const entry = {
          id: tx.id,
          tx_hash: tx.tx_hash,
          from_address: tx.from_address,
          to_address: tx.to_address,
          amount: tx.amount,
          token_symbol: tx.token_symbol,
          token_address: tx.token_address,
          chain_id: tx.chain_id,
          created_at: tx.created_at,
          sender_id: tx.user_id,
          sender_username: senderInfo?.username || "Unknown",
          sender_avatar_url: senderInfo?.avatar_url,
        };

        if (recipientProfile) {
          mappable.push({
            ...entry,
            recipient_id: recipientProfile.id,
            recipient_username: recipientProfile.username,
            recipient_avatar_url: recipientProfile.avatar_url,
          });
        } else {
          unmappable.push(entry);
        }
      }

      return new Response(
        JSON.stringify({
          missing: mappable,
          unmappable,
          totalScanned: allTx.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "backfill") {
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "transactionIds required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the transactions to backfill
      const { data: txList, error: txErr } = await adminClient
        .from("transactions")
        .select("*")
        .in("id", transactionIds);

      if (txErr || !txList) {
        throw new Error(`Failed to fetch transactions: ${txErr?.message}`);
      }

      // Get profiles for mapping
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, wallet_address, public_wallet_address, external_wallet_address");

      const walletMap = new Map<string, string>();
      for (const p of profiles || []) {
        if (p.wallet_address) walletMap.set(p.wallet_address.toLowerCase(), p.id);
        if (p.public_wallet_address) walletMap.set(p.public_wallet_address.toLowerCase(), p.id);
        if (p.external_wallet_address) walletMap.set(p.external_wallet_address.toLowerCase(), p.id);
      }

      // Check existing donations to avoid duplicates
      const hashes = txList.map((t) => t.tx_hash).filter(Boolean);
      const { data: existing } = await adminClient
        .from("donations")
        .select("tx_hash")
        .in("tx_hash", hashes);
      const existingSet = new Set((existing || []).map((d) => d.tx_hash));

      const toInsert: any[] = [];
      const skipped: string[] = [];

      for (const tx of txList) {
        if (existingSet.has(tx.tx_hash)) {
          skipped.push(tx.id);
          continue;
        }

        const recipientId = tx.to_address
          ? walletMap.get(tx.to_address.toLowerCase())
          : null;

        if (!recipientId) {
          skipped.push(tx.id);
          continue;
        }

        toInsert.push({
          sender_id: tx.user_id,
          recipient_id: recipientId,
          amount: tx.amount,
          token_symbol: tx.token_symbol,
          token_address: tx.token_address || null,
          chain_id: tx.chain_id || 56,
          tx_hash: tx.tx_hash,
          status: "confirmed",
          confirmed_at: tx.created_at,
          card_theme: "celebration",
          card_sound: "rich-1",
          message: null,
          light_score_earned: 0,
        });
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await adminClient
          .from("donations")
          .insert(toInsert);

        if (insertError) {
          throw new Error(`Failed to insert donations: ${insertError.message}`);
        }
      }

      return new Response(
        JSON.stringify({
          inserted: toInsert.length,
          skipped: skipped.length,
          total: txList.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use 'scan' or 'backfill'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("backfill-donations error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
