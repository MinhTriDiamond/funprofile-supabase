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

    const { tx_hash } = await req.json();
    if (!tx_hash || typeof tx_hash !== "string") {
      return new Response(
        JSON.stringify({ error: "tx_hash is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedHash = tx_hash.trim().toLowerCase();

    // Query all 3 tables in parallel
    const [txResult, donationResult, postResult] = await Promise.all([
      adminClient
        .from("transactions")
        .select("id, user_id, tx_hash, from_address, to_address, amount, token_symbol, status, created_at, chain_id")
        .ilike("tx_hash", normalizedHash)
        .maybeSingle(),
      adminClient
        .from("donations")
        .select("id, sender_id, recipient_id, amount, token_symbol, status, tx_hash, message, created_at, post_id")
        .ilike("tx_hash", normalizedHash)
        .maybeSingle(),
      adminClient
        .from("posts")
        .select("id, user_id, content, post_type, tx_hash, created_at, gift_sender_id, gift_recipient_id, gift_amount, gift_token")
        .eq("post_type", "gift_celebration")
        .ilike("tx_hash", normalizedHash)
        .maybeSingle(),
    ]);

    // Get profile info for relevant user IDs
    const userIds = new Set<string>();
    if (txResult.data?.user_id) userIds.add(txResult.data.user_id);
    if (donationResult.data?.sender_id) userIds.add(donationResult.data.sender_id);
    if (donationResult.data?.recipient_id) userIds.add(donationResult.data.recipient_id);
    if (postResult.data?.gift_sender_id) userIds.add(postResult.data.gift_sender_id);
    if (postResult.data?.gift_recipient_id) userIds.add(postResult.data.gift_recipient_id);

    const profileMap: Record<string, { username: string; display_name: string | null }> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, username, display_name")
        .in("id", Array.from(userIds));
      for (const p of profiles || []) {
        profileMap[p.id] = { username: p.username, display_name: p.display_name };
      }
    }

    // Also try to find recipient by wallet address if transaction exists
    let walletRecipient = null;
    if (txResult.data?.to_address) {
      const addr = txResult.data.to_address.toLowerCase();
      const { data: walletProfile } = await adminClient
        .from("profiles")
        .select("id, username, display_name, wallet_address, public_wallet_address")
        .or(`wallet_address.ilike.${addr},public_wallet_address.ilike.${addr},external_wallet_address.ilike.${addr}`)
        .maybeSingle();
      if (walletProfile) {
        walletRecipient = { id: walletProfile.id, username: walletProfile.username, display_name: walletProfile.display_name };
      }
    }

    return new Response(
      JSON.stringify({
        tx_hash: normalizedHash,
        in_transactions: !!txResult.data,
        in_donations: !!donationResult.data,
        in_posts: !!postResult.data,
        transaction: txResult.data ? {
          ...txResult.data,
          sender_profile: profileMap[txResult.data.user_id] || null,
          recipient_profile: walletRecipient,
        } : null,
        donation: donationResult.data ? {
          ...donationResult.data,
          sender_profile: profileMap[donationResult.data.sender_id] || null,
          recipient_profile: profileMap[donationResult.data.recipient_id] || null,
        } : null,
        post: postResult.data ? {
          ...postResult.data,
          sender_profile: profileMap[postResult.data.gift_sender_id] || null,
          recipient_profile: profileMap[postResult.data.gift_recipient_id] || null,
        } : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-transaction error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
