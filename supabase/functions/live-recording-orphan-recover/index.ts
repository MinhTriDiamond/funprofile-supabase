/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * live-recording-orphan-recover
 *
 * Cron recovery for ended Agora webcam sessions whose replay pipeline did not
 * move forward. New failures notify the host; historical backfill is handled
 * silently in migration SQL.
 */
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';

const IDLE_AGE_MS = 2 * 60 * 1000;
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const PROCESSING_GIVE_UP_MS = 60 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

function nowIso() {
  return new Date().toISOString();
}

async function requireCronOrAdmin(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  const admin = createAdminClient() as any;
  if (cronSecret && provided === cronSecret) return { ok: true as const, admin };

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) || '';
  const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) || '';
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const token = authHeader.slice('Bearer '.length).trim();
  if (token && (token === anonKey || token === serviceKey)) return { ok: true as const, admin };
  return { ok: false as const, status: 401, error: 'Unauthorized' };
}

function hostUserIdOf(session: any): string | null {
  return session.host_user_id || session.owner_id || session.user_id || null;
}

async function notifyHost(
  admin: any,
  session: any,
  type: 'live_recording_missed' | 'live_recording_failed',
  reason: string,
) {
  const userId = hostUserIdOf(session);
  if (!userId) return;
  const title = type === 'live_recording_missed'
    ? 'Phien live khong luu duoc video'
    : 'Video phien live xu ly that bai';
  const message = type === 'live_recording_missed'
    ? 'Phien live cua ban da ket thuc nhung he thong khong khoi dong duoc ban ghi cloud.'
    : 'He thong da thu nhieu lan nhung khong xu ly duoc video replay cho phien live cua ban.';

  await admin.from('notifications').insert({
    user_id: userId,
    actor_id: userId,
    type,
    metadata: {
      live_session_id: session.id,
      ended_at: session.ended_at,
      reason,
      title,
      message,
    },
  }).then(undefined, (err: unknown) => {
    console.warn('[orphan-recover] notify failed', err);
  });
}

/**
 * Đồng bộ post + live_replays về trạng thái `failed_no_recording` để feed
 * không còn kẹt ở placeholder "Đang xử lý...". Mirror logic của
 * `failFinalNoRecording` trong live-webcam-recording-processor để giữ duy
 * nhất một SoT (state truth) cho replay.
 */
async function propagateFailedNoRecording(admin: any, session: any, reason: string) {
  const ts = nowIso();
  const userId = hostUserIdOf(session);
  const message = reason === 'recording_never_started'
    ? 'Phiên live không có bản ghi (chưa khởi động được cloud recording).'
    : 'Hệ thống không xử lý được video replay cho phiên live này.';

  if (userId) {
    await admin.from('live_replays').upsert({
      user_id: userId,
      live_session_id: session.id,
      chunked_recording_id: session.id,
      status: 'failed',
      replay_status: 'failed_no_recording',
      playback_type: 'processing',
      playback_hls: null,
      playback_mp4: null,
      temp_hls_url: null,
      archive_status: 'failed',
      cleanup_status: 'pending',
      error_message: reason,
      updated_at: ts,
    }, { onConflict: 'chunked_recording_id' }).then(undefined, (err: unknown) => {
      console.warn('[orphan-recover] live_replays upsert failed', session.id, err);
    });
  }

  // Best-effort: lấy post_id nếu chưa có trong session select.
  let postId: string | null = (session as any).post_id || (session as any).live_post_id || null;
  if (!postId) {
    const { data: row } = await admin
      .from('live_sessions')
      .select('post_id, live_post_id')
      .eq('id', session.id)
      .maybeSingle();
    postId = row?.post_id || row?.live_post_id || null;
  }

  if (postId) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {}),
      live_status: 'ended',
      live_session_id: session.id,
      replay_status: 'failed_no_recording',
      replay_ready: false,
      playback_type: 'processing',
      playback_url: null,
      playback_hls: null,
      temp_hls_url: null,
      r2_video_url: null,
      archive_mp4_url: null,
      processing_message: message,
      recording_failed: true,
      recovery_reason: reason,
    };
    await admin.from('posts').update({
      post_type: 'live_replay',
      video_url: null,
      replay_status: 'failed_no_recording',
      replay_ready: false,
      processing_message: message,
      metadata,
      updated_at: ts,
    }).eq('id', postId).then(undefined, (err: unknown) => {
      console.warn('[orphan-recover] posts update failed', postId, err);
    });
  }
}

async function logEvent(admin: any, session: any, reason: string, payload: Record<string, unknown>) {
  await admin.from('live_session_events').insert({
    live_session_id: session.id,
    from_status: session.status || null,
    to_status: null,
    source: 'live-recording-orphan-recover',
    reason,
    payload: { live_session_id: session.id, timestamp: nowIso(), ...payload },
  }).then(undefined, () => undefined);
}

async function handleIdle(admin: any, session: any): Promise<Record<string, unknown>> {
  const hasRecordingIds = Boolean(session.recording_sid && session.recording_resource_id);
  const ts = nowIso();
  const attempts = Number(session.recovery_attempts) || 0;

  if (hasRecordingIds) {
    await admin.from('live_sessions').update({
      recording_status: 'stopped',
      archive_status: 'pending',
      archive_retry_count: 0,
      archive_next_retry_at: ts,
      archive_error: null,
      recovery_attempts: attempts + 1,
      last_recovery_at: ts,
      updated_at: ts,
    }).eq('id', session.id);
    await logEvent(admin, session, 'orphan_recover_idle_with_ids_enqueue', { had_recording_ids: true });
    return { id: session.id, action: 'enqueued_archive' };
  }

  await admin.from('live_sessions').update({
    recording_status: 'missed',
    recording_error: session.recording_error || 'recording_never_started',
    archive_status: 'unrecoverable',
    archive_next_retry_at: null,
    archive_error: 'recording_never_started',
    recovery_attempts: attempts + 1,
    last_recovery_at: ts,
    updated_at: ts,
  }).eq('id', session.id);
  await propagateFailedNoRecording(admin, session, 'recording_never_started');
  await notifyHost(admin, session, 'live_recording_missed', 'recording_never_started');
  await logEvent(admin, session, 'orphan_recover_marked_missed', { had_recording_ids: false });
  return { id: session.id, action: 'marked_missed' };
}

async function handleProcessing(admin: any, session: any, ageMs: number): Promise<Record<string, unknown>> {
  const attempts = Number(session.recovery_attempts) || 0;
  const ts = nowIso();
  const tooOld = ageMs > PROCESSING_GIVE_UP_MS;
  const exhausted = attempts >= MAX_RECOVERY_ATTEMPTS;

  if (tooOld && exhausted) {
    await admin.from('live_sessions').update({
      recording_status: 'failed',
      archive_status: 'unrecoverable',
      archive_next_retry_at: null,
      recovery_attempts: attempts + 1,
      last_recovery_at: ts,
      recording_error: session.recording_error || 'processing_stuck_giveup',
      archive_error: 'processing_stuck_giveup',
      updated_at: ts,
    }).eq('id', session.id);
    await propagateFailedNoRecording(admin, session, 'processing_stuck_giveup');
    await notifyHost(admin, session, 'live_recording_failed', 'processing_stuck_giveup');
    await logEvent(admin, session, 'orphan_recover_processing_giveup', { age_ms: ageMs, attempts });
    return { id: session.id, action: 'gave_up' };
  }

  await admin.from('live_sessions').update({
    recording_status: 'stopped',
    archive_status: 'pending',
    archive_next_retry_at: ts,
    archive_error: null,
    recovery_attempts: attempts + 1,
    last_recovery_at: ts,
    updated_at: ts,
  }).eq('id', session.id);
  await logEvent(admin, session, 'orphan_recover_processing_nudge', { age_ms: ageMs, attempts });
  return { id: session.id, action: 'nudged' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const nowMs = Date.now();
    const idleCutoff = new Date(nowMs - IDLE_AGE_MS).toISOString();
    const processingCutoff = new Date(nowMs - PROCESSING_STALE_MS).toISOString();

    const selectCols = 'id, host_user_id, owner_id, user_id, status, recording_status, recording_provider, recording_sid, recording_resource_id, recording_error, recovery_attempts, ended_at';

    const { data: idleRows, error: idleError } = await admin
      .from('live_sessions')
      .select(selectCols)
      .eq('status', 'ended')
      .eq('mode', 'agora_webcam')
      .eq('recording_provider', 'agora')
      .eq('recording_status', 'idle')
      .lt('ended_at', idleCutoff)
      .lt('recovery_attempts', MAX_RECOVERY_ATTEMPTS + 1)
      .order('ended_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (idleError) throw idleError;

    const { data: procRows, error: procError } = await admin
      .from('live_sessions')
      .select(selectCols)
      .eq('status', 'ended')
      .eq('mode', 'agora_webcam')
      .eq('recording_provider', 'agora')
      .eq('recording_status', 'processing')
      .lt('ended_at', processingCutoff)
      .order('ended_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (procError) throw procError;

    const results: Array<Record<string, unknown>> = [];

    for (const session of (idleRows || [])) {
      try {
        results.push(await handleIdle(admin, session));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[orphan-recover] idle session error', session.id, message);
        results.push({ id: session.id, error: message });
      }
    }

    for (const session of (procRows || [])) {
      try {
        const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : nowMs;
        results.push(await handleProcessing(admin, session, nowMs - endedAt));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[orphan-recover] processing session error', session.id, message);
        results.push({ id: session.id, error: message });
      }
    }

    return json({
      ok: true,
      scanned_idle: idleRows?.length || 0,
      scanned_processing: procRows?.length || 0,
      results,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-recording-orphan-recover] fatal', message);
    return json({ error: message }, 500);
  }
});
