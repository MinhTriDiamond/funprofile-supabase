import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const TREASURY_PROFILE_ID = "9e702a6f-4035-4f30-9c04-f2e21419b37a";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const treasuryAddr = Deno.env.get("TREASURY_WALLET_ADDRESS")?.toLowerCase().trim();
    if (!treasuryAddr) {
      return new Response(JSON.stringify({ error: "TREASURY_WALLET_ADDRESS not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createAdminClient();

    // Check current state
    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, username, public_wallet_address, wallet_address, external_wallet_address")
      .eq("id", TREASURY_PROFILE_ID)
      .single();

    if (fetchErr || !profile) {
      return new Response(JSON.stringify({ error: "Treasury profile not found", detail: fetchErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Current treasury profile:`, JSON.stringify(profile));

    // Update public_wallet_address if null/empty
    if (!profile.public_wallet_address) {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ public_wallet_address: treasuryAddr })
        .eq("id", TREASURY_PROFILE_ID);

      if (updateErr) {
        return new Response(JSON.stringify({ error: "Failed to update", detail: updateErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`✅ Updated treasury public_wallet_address to ${treasuryAddr}`);
      return new Response(JSON.stringify({
        success: true,
        message: "Treasury profile updated with wallet address",
        wallet_address: treasuryAddr,
        profile_id: TREASURY_PROFILE_ID,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Treasury already has public_wallet_address",
      current: profile.public_wallet_address,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("sync-treasury error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
