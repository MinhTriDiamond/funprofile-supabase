import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TREASURY_ID = "9e702a6f-4035-4f30-9c04-f2e21419b37a";
const BATCH_SIZE = 50;

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
    const { data: claims, error: claimsError } = await userClient.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
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

    // 1. Fetch ALL confirmed donations from Treasury (paginated) - INCLUDING unmapped (recipient_id IS NULL)
    const allDonations: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: batch, error } = await adminClient
        .from("donations")
        .select("id, recipient_id, amount, token_symbol, tx_hash, confirmed_at, created_at, metadata")
        .eq("sender_id", TREASURY_ID)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new Error(`Failed to fetch donations: ${error.message}`);
      if (!batch || batch.length === 0) break;
      allDonations.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (allDonations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No Treasury donations found", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get wallet addresses for all recipients (only mapped ones)
    const recipientIds = [...new Set(allDonations.filter((d) => d.recipient_id).map((d) => d.recipient_id))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, wallet_address, public_wallet_address, external_wallet_address")
      .in("id", recipientIds);

    const walletMap = new Map<string, string>();
    for (const p of profiles || []) {
      const addr = p.wallet_address || p.public_wallet_address || p.external_wallet_address || "unknown";
      walletMap.set(p.id, addr);
    }

    // 3. Delete existing reward_claims to avoid duplicates
    const { error: deleteError } = await adminClient
      .from("reward_claims")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) {
      console.error("Delete error:", deleteError.message);
    }

    // 4. Build and insert reward_claims records (including unmapped with user_id = null)
    const records = allDonations.map((d) => {
      const meta = d.metadata as Record<string, any> | null;
      const toAddress = meta?.to_address || meta?.toAddress || null;
      return {
        user_id: d.recipient_id || null,
        amount: Math.round(Number(d.amount)),
        wallet_address: d.recipient_id
          ? (walletMap.get(d.recipient_id) || "unknown")
          : (toAddress || "unknown"),
        created_at: d.confirmed_at || d.created_at,
      };
    });

    let insertedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await adminClient
        .from("reward_claims")
        .insert(batch);

      if (insertError) {
        console.error(`Batch insert error (offset ${i}):`, insertError.message);
        errorCount += batch.length;
      } else {
        insertedCount += batch.length;
      }
    }

    // 5. Calculate summary
    const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
    const uniqueUsers = new Set(records.map((r) => r.user_id)).size;

    console.log(`[backfill-reward-claims] Inserted: ${insertedCount}, Errors: ${errorCount}, Users: ${uniqueUsers}, Total: ${totalAmount} CAMLY`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        errors: errorCount,
        unique_users: uniqueUsers,
        total_amount: totalAmount,
        total_donations: allDonations.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("backfill-reward-claims error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
