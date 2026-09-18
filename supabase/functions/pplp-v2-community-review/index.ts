import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_REVIEW_TYPES = ['endorse', 'confirm_attended', 'confirm_helped', 'flag_suspicious', 'attest_authenticity'];
const MIN_REVIEWS_TO_UPDATE = 3; // minimum reviews before updating community_score

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body; // 'submit_review' | 'get_reviews'

    if (action === 'submit_review') {
      const { action_id, review_type, endorse_score, flag_score, comment,
        pillar_serving_life, pillar_transparent_truth, pillar_healing_love,
        pillar_long_term_value, pillar_unity_over_separation } = body;

      if (!action_id || !review_type) {
        return new Response(JSON.stringify({ error: 'action_id và review_type là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!VALID_REVIEW_TYPES.includes(review_type)) {
        return new Response(JSON.stringify({ error: `review_type phải là: ${VALID_REVIEW_TYPES.join(', ')}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check action exists and NOT owned by reviewer
      const { data: targetAction } = await supabase.from('pplp_v2_user_actions')
        .select('id, user_id').eq('id', action_id).single();

      if (!targetAction) {
        return new Response(JSON.stringify({ error: 'Hành động không tồn tại' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (targetAction.user_id === user.id) {
        return new Response(JSON.stringify({ error: 'Không thể tự review hành động của mình' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Default scores based on review_type
      let finalEndorse = Number(endorse_score) || 0;
      let finalFlag = Number(flag_score) || 0;
      if (['endorse', 'confirm_attended', 'confirm_helped', 'attest_authenticity'].includes(review_type)) {
        finalEndorse = Math.max(finalEndorse, 7);
      }
      if (review_type === 'flag_suspicious') {
        finalFlag = Math.max(finalFlag, 7);
      }

      const clamp = (v: number) => Math.min(10, Math.max(0, Number(v) || 0));

      const { data: review, error: insertError } = await supabase.from('pplp_v2_community_reviews').insert({
        action_id,
        reviewer_user_id: user.id,
        review_type,
        endorse_score: Math.min(10, Math.max(0, finalEndorse)),
        flag_score: Math.min(10, Math.max(0, finalFlag)),
        comment: comment?.trim() || null,
        // Per-pillar community scores (PRD §7)
        pillar_serving_life: clamp(pillar_serving_life),
        pillar_transparent_truth: clamp(pillar_transparent_truth),
        pillar_healing_love: clamp(pillar_healing_love),
        pillar_long_term_value: clamp(pillar_long_term_value),
        pillar_unity_over_separation: clamp(pillar_unity_over_separation),
      }).select('id').single();

      if (insertError) {
        if (insertError.code === '23505') {
          return new Response(JSON.stringify({ error: 'Bạn đã review hành động này rồi' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.error('[Review] Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Không thể gửi review' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if enough reviews to update community_score
      const { data: allReviews } = await supabase.from('pplp_v2_community_reviews')
        .select('endorse_score, flag_score').eq('action_id', action_id);

      if (allReviews && allReviews.length >= MIN_REVIEWS_TO_UPDATE) {
        const avgEndorse = allReviews.reduce((s, r) => s + Number(r.endorse_score), 0) / allReviews.length;
        const avgFlag = allReviews.reduce((s, r) => s + Number(r.flag_score), 0) / allReviews.length;
        const communityScore = Math.max(0, Math.min(10, avgEndorse - avgFlag));

        // Update validation record
        await supabase.from('pplp_v2_validations')
          .update({ community_score: communityScore })
          .eq('action_id', action_id);
      }

      return new Response(JSON.stringify({
        success: true,
        review_id: review.id,
        total_reviews: allReviews?.length || 1,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_reviews') {
      const { action_id } = body;
      if (!action_id) {
        return new Response(JSON.stringify({ error: 'action_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('pplp_v2_community_reviews')
        .select('id, reviewer_user_id, review_type, endorse_score, flag_score, comment, created_at')
        .eq('action_id', action_id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể tải reviews' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ reviews: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'action không hợp lệ. Hỗ trợ: submit_review, get_reviews' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[Review] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
