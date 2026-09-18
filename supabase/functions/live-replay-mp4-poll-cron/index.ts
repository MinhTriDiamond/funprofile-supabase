/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { pollMp4ForReplay } from '../_shared/archiveReplayService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  return authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    !!(cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const { replay_id, limit = 20 } = body as { replay_id?: string; limit?: number };

  let replays: any[] = [];
  if (replay_id) {
    const { data } = await (admin as any).from('live_replays').select('id').eq('id', replay_id).limit(1);
    replays = data || [];
  } else {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('id')
      .eq('archive_phase', 'mp4_wait')
      .order('updated_at', { ascending: true })
      .limit(Math.min(Number(limit) || 20, 50));
    replays = data || [];
  }

  const results: any[] = [];
  for (const r of replays) {
    try {
      results.push(await pollMp4ForReplay(admin as any, r.id));
    } catch (err) {
      results.push({ ok: false, replay_id: r.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return json({ ok: true, processed: results.length, results });
});
