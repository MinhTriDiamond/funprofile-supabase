import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_EVENT_TYPES = ['zoom', 'livestream', 'love_house', 'in_person', 'ZOOM_GROUP_MEDITATION', 'COMMUNITY_EVENT'];
const VALID_STATUSES = ['scheduled', 'active', 'completed', 'cancelled'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Auth
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
    const { action } = body; // 'create_event' | 'update_event' | 'create_group' | 'update_group' | 'list_events' | 'get_event'

    if (action === 'create_event') {
      const { title, event_type, platform_links, start_at, end_at, raw_metadata, livestream_links, expected_duration_minutes } = body;
      if (!title || !start_at) {
        return new Response(JSON.stringify({ error: 'title và start_at là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (event_type && !VALID_EVENT_TYPES.includes(event_type)) {
        return new Response(JSON.stringify({ error: `event_type phải là: ${VALID_EVENT_TYPES.join(', ')}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('pplp_v2_events').insert({
        host_user_id: user.id,
        title: title.trim(),
        event_type: event_type || 'zoom',
        platform_links: platform_links || {},
        start_at,
        end_at: end_at || null,
        raw_metadata: raw_metadata || {},
        livestream_urls: Array.isArray(livestream_links) && livestream_links.length > 0 ? livestream_links : [],
        expected_duration_minutes: expected_duration_minutes || 60,
        status: 'scheduled',
      }).select('id, title, status, start_at').single();

      if (error) {
        console.error('[Event] Create error:', error);
        return new Response(JSON.stringify({ error: 'Không thể tạo sự kiện' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, event: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_event') {
      const { event_id, ...updates } = body;
      if (!event_id) {
        return new Response(JSON.stringify({ error: 'event_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify ownership
      const { data: existing } = await supabase.from('pplp_v2_events')
        .select('host_user_id').eq('id', event_id).single();
      if (!existing || existing.host_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Không có quyền cập nhật sự kiện này' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allowedFields: Record<string, unknown> = {};
      if (updates.title) allowedFields.title = updates.title;
      if (updates.status && VALID_STATUSES.includes(updates.status)) allowedFields.status = updates.status;
      if (updates.platform_links) allowedFields.platform_links = updates.platform_links;
      if (updates.end_at) allowedFields.end_at = updates.end_at;
      if (updates.recording_url) allowedFields.recording_url = updates.recording_url;
      if (updates.recording_hash) allowedFields.recording_hash = updates.recording_hash;

      const { data, error } = await supabase.from('pplp_v2_events')
        .update(allowedFields).eq('id', event_id).select('*').single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể cập nhật sự kiện' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, event: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create_group') {
      const { event_id, name, location, love_house_id, expected_count } = body;
      if (!event_id || !name) {
        return new Response(JSON.stringify({ error: 'event_id và name là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('pplp_v2_groups').insert({
        event_id,
        leader_user_id: user.id,
        name: name.trim(),
        location: location || null,
        love_house_id: love_house_id || null,
        expected_count: expected_count || 0,
      }).select('id, name, event_id').single();

      if (error) {
        console.error('[Event] Create group error:', error);
        return new Response(JSON.stringify({ error: 'Không thể tạo nhóm' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, group: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_group') {
      const { group_id, leader_confirmed_at, ...updates } = body;
      if (!group_id) {
        return new Response(JSON.stringify({ error: 'group_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: existing } = await supabase.from('pplp_v2_groups')
        .select('leader_user_id').eq('id', group_id).single();
      if (!existing || existing.leader_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Không có quyền cập nhật nhóm này' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allowedFields: Record<string, unknown> = {};
      if (updates.name) allowedFields.name = updates.name;
      if (updates.location !== undefined) allowedFields.location = updates.location;
      if (updates.expected_count !== undefined) allowedFields.expected_count = updates.expected_count;
      if (leader_confirmed_at) allowedFields.leader_confirmed_at = new Date().toISOString();

      const { data, error } = await supabase.from('pplp_v2_groups')
        .update(allowedFields).eq('id', group_id).select('*').single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể cập nhật nhóm' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, group: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_events') {
      const { status: filterStatus, limit: queryLimit } = body;
      let query = supabase.from('pplp_v2_events').select('*, pplp_v2_groups(id, name, leader_user_id, expected_count, leader_confirmed_at)')
        .order('start_at', { ascending: false })
        .limit(queryLimit || 20);
      if (filterStatus) query = query.eq('status', filterStatus);

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể tải danh sách sự kiện' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ events: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_event') {
      const { event_id } = body;
      if (!event_id) {
        return new Response(JSON.stringify({ error: 'event_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('pplp_v2_events')
        .select('*, pplp_v2_groups(*, pplp_v2_attendance(*))')
        .eq('id', event_id).single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Không tìm thấy sự kiện' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ event: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate event (Pseudocode §8)
    if (action === 'validate_event') {
      const { event_id } = body;
      if (!event_id) {
        return new Response(JSON.stringify({ error: 'event_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: event } = await supabase.from('pplp_v2_events')
        .select('*, pplp_v2_groups(*, pplp_v2_attendance(*))')
        .eq('id', event_id).single();

      if (!event) {
        return new Response(JSON.stringify({ error: 'Sự kiện không tồn tại' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // validateMeditationEvent logic (Pseudocode §8)
      let eventScore = 0;
      const eventFlags: string[] = [];

      // Check zoom/livestream link
      const hasLink = event.platform_links?.zoom || event.platform_links?.meet ||
        (event.livestream_urls && event.livestream_urls.length > 0);
      if (hasLink) eventScore += 3;
      else eventFlags.push('NO_EVENT_LINK');

      // Check host exists
      if (event.host_user_id) eventScore += 2;

      // Check recording
      if (event.recording_url) eventScore += 2;

      // Check groups with leader confirmation
      const groups = event.pplp_v2_groups || [];
      const confirmedGroups = groups.filter((g: any) => g.leader_confirmed_at);
      if (confirmedGroups.length > 0) eventScore += 2;
      else eventFlags.push('NO_LEADER_CONFIRMATION');

      // Check attendance count
      const totalAttendees = groups.reduce((sum: number, g: any) =>
        sum + (g.pplp_v2_attendance?.length || 0), 0);
      if (totalAttendees >= 3) eventScore += 1;

      eventScore = Math.min(10, eventScore);

      // Update event_score
      await supabase.from('pplp_v2_events').update({
        event_score: eventScore,
      }).eq('id', event_id);

      return new Response(JSON.stringify({
        success: true,
        event_id,
        event_score: eventScore,
        flags: eventFlags,
        total_groups: groups.length,
        confirmed_groups: confirmedGroups.length,
        total_attendees: totalAttendees,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'action không hợp lệ. Hỗ trợ: create_event, update_event, create_group, update_group, list_events, get_event, validate_event' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[Event] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
