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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let page = 1, limit = 50, status_filter = "", token_filter = "";
    try {
      const body = await req.json();
      page = body.page || 1;
      limit = Math.min(body.limit || 50, 100);
      status_filter = body.status_filter || "";
      token_filter = body.token_filter || "";
    } catch { /* request body parse — safe to ignore, use defaults */ }

    const offset = (page - 1) * limit;

    // Build query
    let query = adminClient
      .from("transactions")
      .select("id, user_id, tx_hash, from_address, to_address, amount, amount_normalized, token_symbol, status, created_at, chain_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status_filter) query = query.eq("status", status_filter);
    if (token_filter) query = query.eq("token_symbol", token_filter);

    const { data: transactions, count, error: txError } = await query;
    if (txError) throw new Error(`Failed to fetch: ${txError.message}`);

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({ transactions: [], total_count: 0, page, limit }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which have donations and posts
    const txHashes = transactions.map(t => t.tx_hash).filter(Boolean);

    const [donationsResult, postsResult] = await Promise.all([
      adminClient
        .from("donations")
        .select("tx_hash")
        .in("tx_hash", txHashes.length > 0 ? txHashes : ["__none__"]),
      adminClient
        .from("posts")
        .select("tx_hash")
        .eq("post_type", "gift_celebration")
        .in("tx_hash", txHashes.length > 0 ? txHashes : ["__none__"]),
    ]);

    const donationSet = new Set((donationsResult.data || []).map(d => d.tx_hash));
    const postSet = new Set((postsResult.data || []).map(p => p.tx_hash));

    // Get profiles for user_ids
    const userIds = [...new Set(transactions.map(t => t.user_id).filter(Boolean))];
    const profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
      for (const p of profiles || []) {
        profileMap[p.id] = p.username;
      }
    }

    const enriched = transactions.map(tx => ({
      ...tx,
      sender_username: profileMap[tx.user_id] || null,
      has_donation: donationSet.has(tx.tx_hash),
      has_post: postSet.has(tx.tx_hash),
    }));

    return new Response(
      JSON.stringify({ transactions: enriched, total_count: count || 0, page, limit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("list-all-transactions error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
