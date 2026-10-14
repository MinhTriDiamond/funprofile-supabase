// pet-event-hook: nhận event từ các edge function khác, gọi RPC apply_pet_event
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const VALID_EVENTS = new Set([
  'quest_completed','daily_streak_extended','streak_break',
  'donation_sent','reaction_added','inactive_24h','midnight_utc',
  'level_up','evolution','login',
]);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Bao mat (2026-10-14): hook noi bo — chi chap nhan loi goi mang khoa dich vu,
  // dung mau Authorization ma quest-evaluate / quest-streak-cron / record-donation dang dung.
  const svcKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!svcKey || req.headers.get("Authorization") !== `Bearer ${svcKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, event } = body as { user_id?: string; event?: string };

    if (!user_id || typeof user_id !== 'string' || !event || !VALID_EVENTS.has(event)) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createAdminClient();
    const { data, error } = await sb.rpc('apply_pet_event', {
      _user_id: user_id,
      _event: event,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, state: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
