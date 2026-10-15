/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStreamVideo } from '../_shared/cloudflareStreamService.ts';
import { classifyLivestreamOrphan } from '../_shared/livestreamRecoveryPolicy.ts';

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

const SAFE_LIVE_STATUSES = new Set([
  'live', 'source_connected', 'ready_to_go_live', 'disconnect_grace', 'starting',
]);

interface CleanupResult {
  session_id: string;
  user_id: string | null;
  cf_uid: string | null;
  action: string;
  detail?: any;
}

async function rearchiveRecoverable(admin: any, dryRun: boolean, limit: number): Promise<CleanupResult[]> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('id, host_user_id, owner_id, user_id, status, archive_status, archive_error, cloudflare_video_uid, ended_at')
    .eq('mode', 'rtmp_obs')
    .not('cloudflare_video_uid', 'is', null)
    .is('stream_deleted_at', null)
    .in('archive_status', ['pending', 'failed'])
    .lt('ended_at', since)
    .order('ended_at', { ascending: true })
    .limit(limit);

  const results: CleanupResult[] = [];
  for (const s of sessions || []) {
    if (SAFE_LIVE_STATUSES.has(s.status)) continue;
    const video = await getStreamVideo(s.cloudflare_video_uid).catch(() => null);
    const ready = !!(video as any)?.readyToStream && (video as any)?.status?.state === 'ready';
    if (!ready) {
      results.push({ session_id: s.id, user_id: s.host_user_id || s.owner_id || s.user_id, cf_uid: s.cloudflare_video_uid, action: 'skip_not_ready', detail: { state: (video as any)?.status?.state || 'missing' } });
      continue;
    }
    if (dryRun) {
      results.push({ session_id: s.id, user_id: s.host_user_id || s.owner_id || s.user_id, cf_uid: s.cloudflare_video_uid, action: 'would_rearchive' });
      continue;
    }
    await admin.from('live_sessions').update({
      archive_status: 'pending',
      archive_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', s.id);
    await admin.from('live_replays').update({
      archive_status: 'pending',
      archive_error: null,
      archive_attempts: 0,
      archive_next_retry_at: null,
      updated_at: new Date().toISOString(),
    }).eq('live_session_id', s.id);
    results.push({ session_id: s.id, user_id: s.host_user_id || s.owner_id || s.user_id, cf_uid: s.cloudflare_video_uid, action: 'rearchive_queued' });
  }
  return results;
}

async function cleanupDeadLetter(admin: any, limit: number): Promise<CleanupResult[]> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions } = await admin
    .from('live_sessions')
    .select('id, host_user_id, owner_id, user_id, status, archive_status, archive_attempts, archive_error, cloudflare_video_uid, ended_at')
    .eq('mode', 'rtmp_obs')
    .is('stream_deleted_at', null)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: true })
    .limit(200);

  const candidates = (sessions || []).filter((s: any) => {
    if (SAFE_LIVE_STATUSES.has(s.status)) return false;
    if (s.archive_status === 'unrecoverable') return true;
    if (s.archive_status === 'failed' && (s.archive_attempts || 0) >= 16 && s.ended_at < sixHoursAgo) return true;
    if (!s.cloudflare_video_uid && s.ended_at < oneDayAgo) return true;
    if (s.archive_status === 'failed' && /not.*found|404/i.test(s.archive_error || '') && s.ended_at < sixHoursAgo) return true;
    return false;
  }).slice(0, limit);

  const results: CleanupResult[] = [];
  for (const s of candidates) {
    const userId = s.host_user_id || s.owner_id || s.user_id;
    // Age/retry count is not proof that a source or recording is unrecoverable.
    // Keep the Cloudflare source and report candidates for reviewed recovery.
    const classification = classifyLivestreamOrphan({
      providerHandle: !!s.cloudflare_video_uid,
      providerQuery: 'unknown',
      providerQuerySucceeded: false,
    });
    results.push({ session_id: s.id, user_id: userId, cf_uid: s.cloudflare_video_uid, action: `${classification}_review_required` });
  }
  return results;
}

async function cleanupWaitingForObs(admin: any, limit: number): Promise<CleanupResult[]> {
  // Session RTMP kẹt ở 'waiting_for_obs' > 24h → chưa từng có OBS kết nối
  // → end cứng. Chỉ xoá Cloudflare Live Input khi input đó KHÔNG dùng chung
  // (không phải luồng cố định và không được rtmp_stream_configs tham chiếu).
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('id, host_user_id, owner_id, user_id, status, mode, started_at, created_at, cloudflare_live_input_id, cloudflare_input_id, is_input_armed, is_persistent_stream, ended_at')
    .eq('mode', 'rtmp_obs')
    .eq('status', 'waiting_for_obs')
    .is('ended_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  const results: CleanupResult[] = [];
  for (const s of sessions || []) {
    const userId = s.host_user_id || s.owner_id || s.user_id;
    const inputId: string | null = s.cloudflare_live_input_id || s.cloudflare_input_id || null;

    // Guard: input dùng chung cho luồng cố định → TUYỆT ĐỐI không xoá.
    let sharedInput = !!s.is_persistent_stream;
    if (inputId && !sharedInput) {
      const { data: cfg } = await admin
        .from('rtmp_stream_configs')
        .select('id')
        .eq('cloudflare_live_input_id', inputId)
        .is('deleted_at', null)
        .limit(1);
      sharedInput = !!(cfg && cfg.length > 0);
    }

    const classification = classifyLivestreamOrphan({
      providerHandle: !!inputId,
      providerQuery: 'unknown',
      providerQuerySucceeded: false,
    });
    results.push({
      session_id: s.id,
      user_id: userId,
      cf_uid: inputId,
      action: `${classification}_review_required`,
      detail: { shared_input: sharedInput, input_id_present: !!inputId, basis: 'age alone is insufficient' },
    });
  }
  return results;
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
  const dryRun = body?.dry_run === true;
  const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);

  const rearchive = await rearchiveRecoverable(admin, dryRun, limit);
  const cleanup = await cleanupDeadLetter(admin, limit);
  const neverConnected = await cleanupWaitingForObs(admin, limit);

  return json({
    ok: true,
    dry_run: dryRun,
    rearchived: rearchive.filter((r) => r.action === 'rearchive_queued').length,
    deleted_from_stream: cleanup.filter((r) => r.action === 'cleaned').length,
    ended_never_connected: neverConnected.filter((r) => r.action === 'ended_never_connected').length,
    skipped_not_ready: rearchive.filter((r) => r.action === 'skip_not_ready').length,
    rearchive_results: rearchive,
    cleanup_results: cleanup,
    never_connected_results: neverConnected,
  });
});
