import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { conversation_id, prompt } = await req.json();
    if (!conversation_id || !prompt) {
      return new Response(JSON.stringify({ error: "conversation_id and prompt required" }), { status: 400, headers: corsHeaders });
    }

    // Rate limit: 1 request per 5 seconds per user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Check banned status
    const { data: banCheck } = await supabaseAdmin
      .from('profiles').select('is_banned').eq('id', userId).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), { status: 403, headers: corsHeaders });
    }

    const rateCheck = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: `angel_inline:${userId}`,
      p_limit: 1,
      p_window_ms: 5000,
    });

    if (rateCheck.data && !rateCheck.data.allowed) {
      return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: corsHeaders });
    }

    // Verify user is participant
    const { data: participant } = await supabaseAdmin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle();

    if (!participant) {
      return new Response(JSON.stringify({ error: "Not a participant" }), { status: 403, headers: corsHeaders });
    }

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Bạn là Angel, trợ lý AI thân thiện trong nhóm chat. Trả lời ngắn gọn, hữu ích, bằng tiếng Việt. Tối đa 200 từ.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limited" }), { status: 429, headers: corsHeaders });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
      }
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "Angel không thể trả lời lúc này.";

    // Get Angel bot user ID
    const ANGEL_BOT_USER_ID = Deno.env.get("ANGEL_BOT_USER_ID");
    if (!ANGEL_BOT_USER_ID) {
      return new Response(JSON.stringify({ reply, error: "Bot user not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert reply into messages
    const { error: insertErr } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      sender_id: ANGEL_BOT_USER_ID,
      content: reply,
      message_type: "text",
      metadata: { source: "angel_inline", prompt },
    });

    if (insertErr) console.error("Insert reply error:", insertErr);

    // Update conversation preview
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: reply.slice(0, 100) })
      .eq("id", conversation_id);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("angel-inline error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
