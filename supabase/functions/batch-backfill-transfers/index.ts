import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 50;
    const offset = body.offset || 0;

    // Get all profiles with at least one wallet address
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, public_wallet_address, wallet_address, external_wallet_address")
      .or("public_wallet_address.neq.,wallet_address.neq.,external_wallet_address.neq.")
      .range(offset, offset + limit - 1);

    if (profileError) throw profileError;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: "No more profiles to process", offset, processed: 0 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Processing ${profiles.length} profiles (offset ${offset})`);

    const results: any[] = [];
    const baseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) || "";

    for (const profile of profiles) {
      const hasWallet = [
        profile.public_wallet_address, 
        profile.wallet_address, 
        profile.external_wallet_address
      ].some(a => a && a.startsWith("0x") && a.length === 42);

      if (!hasWallet) {
        results.push({ user_id: profile.id, username: profile.username, status: "skipped", reason: "no valid wallet" });
        continue;
      }

      try {
        console.log(`Backfilling user ${profile.username || profile.id}...`);
        
        const res = await fetch(`${baseUrl}/functions/v1/backfill-wallet-transfers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ user_id: profile.id }),
        });

        const data = await res.json();
        results.push({
          user_id: profile.id,
          username: profile.username,
          status: res.ok ? "success" : "error",
          inserted: data.inserted || 0,
          total_erc20: data.total_erc20 || 0,
          error: data.error || undefined,
        });

        // Delay between users to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        results.push({
          user_id: profile.id,
          username: profile.username,
          status: "error",
          error: String(err),
        });
      }
    }

    const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    console.log(`Batch done: ${successCount} success, ${errorCount} errors, ${totalInserted} total inserted`);

    return new Response(JSON.stringify({
      success: true,
      offset,
      processed: profiles.length,
      next_offset: offset + profiles.length,
      has_more: profiles.length === limit,
      total_inserted: totalInserted,
      summary: { success: successCount, errors: errorCount, skipped: results.filter(r => r.status === "skipped").length },
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("batch-backfill error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
