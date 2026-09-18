import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { replay_id } = await req.json();
    if (!replay_id) return json({ error: 'Missing replay_id' }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: replay, error: replayErr } = await supabaseAdmin
      .from('live_replays')
      .select('id, user_id, status, live_session_id')
      .eq('id', replay_id)
      .maybeSingle();
    if (replayErr || !replay) return json({ error: 'Replay not found' }, 404);
    if (replay.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    await supabaseAdmin
      .from('live_replays')
      .update({
        status: 'queued',
        cloudflare_vod_enabled: true,
        ingest_attempts: 0,
        last_ingest_at: null,
        error_message: null,
        last_error_at: null,
      })
      .eq('id', replay_id);

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', replay.live_session_id);

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-mark-uploaded error:', error);
    return json({ error: message }, 500);
  }
});
