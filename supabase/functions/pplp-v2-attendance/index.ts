import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Pseudocode-compliant participation factor weights
function calculateParticipationFactor(attendance: {
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  confirmed_by_leader: boolean;
  reflection_text: string | null;
  expected_duration_minutes?: number | null;
  optional_presence_signal?: boolean;
}): number {
  let factor = 0;

  // appCheckIn: +0.25
  if (attendance.check_in_at) factor += 0.25;

  // appCheckOut: +0.20
  if (attendance.check_out_at) factor += 0.20;

  // hostConfirmed: +0.25
  if (attendance.confirmed_by_leader) factor += 0.25;

  // responseSubmitted (reflection): +0.15
  if (attendance.reflection_text && attendance.reflection_text.trim().length > 10) factor += 0.15;

  // duration >= 80% of expected: +0.10
  if (attendance.duration_minutes && attendance.check_out_at) {
    const expectedDuration = attendance.expected_duration_minutes || 60; // default 60 min
    if (attendance.duration_minutes >= expectedDuration * 0.8) {
      factor += 0.10;
    }
  }

  // optionalPresenceSignal: +0.05
  if (attendance.optional_presence_signal) factor += 0.05;

  return Math.min(1, Math.round(factor * 100) / 100);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

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
    const { action } = body;

    const VALID_ATTENDANCE_MODES = ['direct_checkin', 'system_log', 'group_leader_confirmed', 'hybrid'];

    // Helper: calculate attendance_confidence from participation_factor + optional_signals
    function calculateAttendanceConfidence(participationFactor: number, optionalSignals?: Record<string, unknown>): number {
      let confidence = participationFactor;
      if (optionalSignals) {
        if (optionalSignals.post_session_reflection_submitted) confidence += 0.05;
        if (typeof optionalSignals.presence_snapshot_count === 'number' && optionalSignals.presence_snapshot_count > 0) confidence += 0.03;
      }
      return Math.min(1, Math.round(confidence * 100) / 100);
    }

    if (action === 'check_in') {
      const { group_id, optional_signals } = body;
      if (!group_id) {
        return new Response(JSON.stringify({ error: 'group_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: group } = await supabase.from('pplp_v2_groups')
        .select('id, event_id').eq('id', group_id).single();
      if (!group) {
        return new Response(JSON.stringify({ error: 'Nhóm không tồn tại' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const attendanceMode = body.attendance_mode || 'direct_checkin';
      if (!VALID_ATTENDANCE_MODES.includes(attendanceMode)) {
        return new Response(JSON.stringify({ error: `attendance_mode phải là: ${VALID_ATTENDANCE_MODES.join(', ')}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const initialPF = 0.25;
      const attendanceConfidence = calculateAttendanceConfidence(initialPF, optional_signals);

      const { data, error } = await supabase.from('pplp_v2_attendance').insert({
        group_id,
        user_id: user.id,
        check_in_at: new Date().toISOString(),
        confirmation_status: 'pending',
        participation_factor: initialPF,
        attendance_mode: attendanceMode,
        attendance_confidence: attendanceConfidence,
        // Track 6 signals (PRD §9.5)
        app_check_in_signal: true,
        app_check_out_signal: false,
        host_confirmed_signal: false,
        response_submitted_signal: false,
        duration_met_signal: false,
        optional_presence_signal_value: !!(optional_signals?.optional_presence),
      }).select('id, check_in_at, attendance_mode, group_id').single();

      if (error) {
        if (error.code === '23505') {
          return new Response(JSON.stringify({ error: 'Bạn đã check-in nhóm này rồi' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.error('[Attendance] Check-in error:', error);
        return new Response(JSON.stringify({ error: 'Không thể check-in' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        attendance_id: data.id,
        event_id: group.event_id,
        group_id: data.group_id,
        user_id: user.id,
        attendance_confidence: attendanceConfidence,
        created_at: data.check_in_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_out') {
      const { group_id, reflection_text } = body;
      if (!group_id) {
        return new Response(JSON.stringify({ error: 'group_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: att } = await supabase.from('pplp_v2_attendance')
        .select('*').eq('group_id', group_id).eq('user_id', user.id).single();

      if (!att) {
        return new Response(JSON.stringify({ error: 'Bạn chưa check-in nhóm này' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const checkOutAt = new Date().toISOString();
      const durationMs = new Date(checkOutAt).getTime() - new Date(att.check_in_at!).getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Fetch event expected duration if available
      const { data: group } = await supabase.from('pplp_v2_groups')
        .select('name, event_id, pplp_v2_events(title, expected_duration_minutes)').eq('id', group_id).single();
      const expectedDuration = (group as any)?.pplp_v2_events?.expected_duration_minutes || 60;

      const updatedAtt = {
        ...att,
        check_out_at: checkOutAt,
        duration_minutes: durationMinutes,
        reflection_text: reflection_text?.trim() || att.reflection_text,
        confirmed_by_leader: att.confirmed_by_leader,
        expected_duration_minutes: expectedDuration,
      };
      const participationFactor = calculateParticipationFactor(updatedAtt);

      const checkoutConfidence = calculateAttendanceConfidence(participationFactor, body.optional_signals);

      const durationMet = durationMinutes >= expectedDuration * 0.8;
      const responseSubmitted = !!(reflection_text?.trim() && reflection_text.trim().length > 10);

      const { data, error } = await supabase.from('pplp_v2_attendance').update({
        check_out_at: checkOutAt,
        duration_minutes: durationMinutes,
        reflection_text: reflection_text?.trim() || null,
        participation_factor: participationFactor,
        attendance_confidence: checkoutConfidence,
        // Update 6 signals (PRD §9.5)
        app_check_out_signal: true,
        response_submitted_signal: responseSubmitted,
        duration_met_signal: durationMet,
        optional_presence_signal_value: !!(body.optional_signals?.optional_presence),
      }).eq('id', att.id).select('*').single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể check-out' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto-create INNER_WORK action linked to this attendance
      try {
        const eventTitle = (group as any)?.pplp_v2_events?.title || 'Sự kiện';
        await supabase.from('pplp_v2_user_actions').insert({
          user_id: user.id,
          action_type_code: 'INNER_WORK',
          title: `Tham gia: ${eventTitle}`,
          description: `Tham gia nhóm "${group?.name}" trong ${durationMinutes} phút.${reflection_text ? ' Chia sẻ: ' + reflection_text.trim().slice(0, 200) : ''}`,
          source_url: null,
          raw_metadata: { attendance_id: att.id, group_id, event_id: group?.event_id, duration_minutes: durationMinutes },
          status: 'proof_pending',
        });
      } catch (e) {
        console.warn('[Attendance] Auto-create action failed:', e);
      }

      return new Response(JSON.stringify({
        success: true,
        attendance: data,
        participation_factor: participationFactor,
        attendance_confidence: checkoutConfidence,
        duration_minutes: durationMinutes,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'add_reflection') {
      const { group_id, reflection_text } = body;
      if (!group_id || !reflection_text?.trim()) {
        return new Response(JSON.stringify({ error: 'group_id và reflection_text là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: att } = await supabase.from('pplp_v2_attendance')
        .select('*').eq('group_id', group_id).eq('user_id', user.id).single();
      if (!att) {
        return new Response(JSON.stringify({ error: 'Không tìm thấy điểm danh' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updatedAtt = { ...att, reflection_text: reflection_text.trim() };
      const participationFactor = calculateParticipationFactor(updatedAtt);

      const { data, error } = await supabase.from('pplp_v2_attendance').update({
        reflection_text: reflection_text.trim(),
        participation_factor: participationFactor,
      }).eq('id', att.id).select('*').single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể lưu reflection' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, attendance: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'leader_confirm') {
      const { group_id, user_ids } = body;
      if (!group_id) {
        return new Response(JSON.stringify({ error: 'group_id là bắt buộc' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: group } = await supabase.from('pplp_v2_groups')
        .select('leader_user_id').eq('id', group_id).single();
      if (!group || group.leader_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Chỉ leader mới xác nhận được' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('pplp_v2_groups').update({
        leader_confirmed_at: new Date().toISOString(),
      }).eq('id', group_id);

      let query = supabase.from('pplp_v2_attendance')
        .select('*').eq('group_id', group_id);
      if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
        query = query.in('user_id', user_ids);
      }
      const { data: attendances } = await query;

      let confirmed = 0;
      for (const att of (attendances || [])) {
        const updatedAtt = { ...att, confirmed_by_leader: true };
        const pf = calculateParticipationFactor(updatedAtt);
        await supabase.from('pplp_v2_attendance').update({
          confirmed_by_leader: true,
          confirmation_status: 'confirmed',
          participation_factor: pf,
          host_confirmed_signal: true,
        }).eq('id', att.id);
        confirmed++;
      }

      return new Response(JSON.stringify({ success: true, confirmed_count: confirmed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'my_attendance') {
      const { limit: queryLimit } = body;
      const { data, error } = await supabase.from('pplp_v2_attendance')
        .select('*, pplp_v2_groups(name, event_id, pplp_v2_events(title, event_type, start_at))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(queryLimit || 20);

      if (error) {
        return new Response(JSON.stringify({ error: 'Không thể tải lịch sử điểm danh' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ attendance: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'action không hợp lệ. Hỗ trợ: check_in, check_out, add_reflection, leader_confirm, my_attendance' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[Attendance] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
