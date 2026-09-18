// PPLP v2.5 — Impact Multiplier (IM) Calculator
// IM = helped_users + retention_lift + knowledge_value + referral_quality, clamp 0..3.0
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const body = await req.json().catch(() => ({}));
    const target_user_id: string | undefined = body.user_id;

    let userIds: string[] = [];
    if (target_user_id) {
      userIds = [target_user_id];
    } else {
      const { data } = await supabase
        .from('light_actions')
        .select('user_id')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id))).filter(Boolean);
    }

    let processed = 0;

    for (const user_id of userIds) {
      // Helped users count: từ donations recipient
      const { count: donationsGiven } = await supabase
        .from('donations')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', user_id)
        .eq('status', 'confirmed');
      const helped_users_count = donationsGiven ?? 0;

      // Retention lift: posts có nhiều engagement
      const { count: postsCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id);
      const retention_lift = Math.min(1.0, (postsCount ?? 0) / 100);

      // Knowledge value: comments có giá trị
      const { count: commentsCount } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id);
      const knowledge_value = Math.min(1.0, (commentsCount ?? 0) / 200);

      // Referral quality: friendship accepted
      const { count: friendsCount } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('status', 'accepted');
      const referral_quality = Math.min(1.0, (friendsCount ?? 0) / 50);

      // IM aggregate
      const helped_factor = Math.min(1.0, helped_users_count / 20);
      let im_value = 1.0 + (helped_factor + retention_lift + knowledge_value + referral_quality) * 0.5;
      im_value = Math.max(0, Math.min(3.0, im_value));

      await supabase.from('pplp_v25_impact_metrics').insert({
        user_id,
        helped_users_count,
        retention_lift,
        knowledge_value,
        referral_quality,
        im_value,
      });

      processed++;
    }

    return new Response(JSON.stringify({ success: true, processed, total: userIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
