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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { user_ids, reason = "Farm account - banned permanently" } = await req.json();

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids array required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const results: { banned: string[]; wallets_blacklisted: number; mint_rejected: number; errors: string[] } = {
      banned: [],
      wallets_blacklisted: 0,
      mint_rejected: 0,
      errors: [],
    };

    for (const uid of user_ids) {
      try {
        // 1. Ban user - set is_banned, reward_status, reset rewards
        const { error: banErr } = await supabaseAdmin
          .from("profiles")
          .update({
            is_banned: true,
            banned_at: new Date().toISOString(),
            ban_reason: reason,
            reward_status: "banned",
          })
          .eq("id", uid);

        if (banErr) {
          results.errors.push(`Ban ${uid}: ${banErr.message}`);
          continue;
        }

        results.banned.push(uid);

        // 2. Collect all wallets to blacklist
        const walletsToBlacklist = new Set<string>();

        // From profile wallet_address
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("wallet_address, public_wallet_address")
          .eq("id", uid)
          .single();

        if (profile?.wallet_address) walletsToBlacklist.add(profile.wallet_address.toLowerCase());
        if (profile?.public_wallet_address) walletsToBlacklist.add(profile.public_wallet_address.toLowerCase());


        // From reward_claims
        const { data: claims } = await supabaseAdmin
          .from("reward_claims")
          .select("wallet_address")
          .eq("user_id", uid);

        claims?.forEach((c) => {
          if (c.wallet_address) walletsToBlacklist.add(c.wallet_address.toLowerCase());
        });

        // Blacklist all wallets
        for (const wallet of walletsToBlacklist) {
          const { error: blErr } = await supabaseAdmin
            .from("blacklisted_wallets")
            .upsert(
              {
                wallet_address: wallet,
                reason,
                is_permanent: true,
                user_id: uid,
                created_by: user.id,
              },
              { onConflict: "wallet_address" }
            );
          if (!blErr) results.wallets_blacklisted++;
        }

        // 3. Reject pending mint requests
        const { data: mintReqs } = await supabaseAdmin
          .from("pplp_mint_requests")
          .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
          .eq("user_id", uid)
          .in("status", ["pending", "pending_sig", "signing"])
          .select("id");

        if (mintReqs) results.mint_rejected += mintReqs.length;

        // 4. Audit log
        await supabaseAdmin.from("audit_logs").insert({
          admin_id: user.id,
          target_user_id: uid,
          action: "BATCH_BAN_FARM",
          reason,
          details: {
            wallets_blacklisted: Array.from(walletsToBlacklist),
            mint_requests_rejected: mintReqs?.length || 0,
          },
        });
      } catch (e) {
        results.errors.push(`${uid}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
