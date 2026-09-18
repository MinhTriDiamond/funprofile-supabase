/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStreamVideo } from '../_shared/cloudflareStreamService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request) {
  // Fallback: cron/ops secret
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  if (cronSecret && provided && provided === cronSecret) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    return { ok: true as const, admin, user: null as any };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin, user };
}

interface ResolveResult {
  replay_id: string;
  user_id: string;
  stream_uid: string | null;
  action: 'unrecoverable' | 'retry_reset' | 'already_archived' | 'skipped' | 'error';
  cf_state?: string;
  cf_ready?: boolean;
  stream_deleted?: boolean;
  message?: string;
  error?: string;
}

async function resolveOne(admin: any, replay: any, dryRun: boolean): Promise<ResolveResult> {
  const replayId = replay.id;
  const uid = replay.stream_uid || replay.cloudflare_video_uid;

  if (replay.archive_status === 'archived' && replay.r2_video_url) {
    return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'already_archived' };
  }

  if (!uid) {
    if (!dryRun) {
      await admin.from('live_replays').update({
        archive_status: 'unrecoverable',
        archive_error: 'Không có Stream UID — không thể recover.',
        archive_next_retry_at: null,
      }).eq('id', replayId);
    }
    return { replay_id: replayId, user_id: replay.user_id, stream_uid: null, action: 'unrecoverable', message: 'no_stream_uid' };
  }

  // Check Cloudflare Stream
  let cfVideo: Record<string, unknown> | null = null;
  let cfError: string | undefined;
  try {
    cfVideo = await getStreamVideo(uid);
  } catch (err) {
    cfError = err instanceof Error ? err.message : String(err);
  }

  const status = (cfVideo?.status as Record<string, unknown> | undefined) || undefined;
  const cfState = (status?.state as string | undefined) || 'unknown';
  const cfReady = cfVideo?.readyToStream === true;

  // Case 1: video không tồn tại → unrecoverable
  if (!cfVideo) {
    if (!dryRun) {
      let streamDeletedAt: string | null = null;
      try {
        // Keep the Stream source for manual recovery; do not delete here.
        streamDeletedAt = null;
      } catch (_) { /* ignore */ }
      await admin.from('live_replays').update({
        archive_status: 'unrecoverable',
        archive_error: `Stream UID ${uid} không tồn tại trên Cloudflare. ${cfError || ''}`.trim().slice(0, 1000),
        archive_next_retry_at: null,
        ...(streamDeletedAt ? { stream_deleted_at: streamDeletedAt } : {}),
      }).eq('id', replayId);
      if (streamDeletedAt) {
        await admin.from('live_sessions').update({ stream_deleted_at: streamDeletedAt }).eq('id', replay.live_session_id);
      }
      // Notify
      await notifyFailed(admin, replay);
      return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'unrecoverable', cf_state: cfState, cf_ready: false, stream_deleted: !!streamDeletedAt, message: cfError || 'video_not_found' };
    }
    return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'unrecoverable', cf_state: cfState, cf_ready: false, message: cfError || 'video_not_found' };
  }

  // Case 2: video ready → reset attempts để cron pick lại
  if (cfReady) {
    if (!dryRun) {
      await admin.from('live_replays').update({
        archive_attempts: 0,
        archive_status: 'pending',
        archive_error: null,
        archive_next_retry_at: new Date().toISOString(),
      }).eq('id', replayId);
    }
    return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'retry_reset', cf_state: cfState, cf_ready: true };
  }

  // Case 3: video tồn tại nhưng chưa ready (state=inprogress/queued/error...) — đánh giá
  // - Nếu created_at > 24h và vẫn chưa ready → unrecoverable.
  // - Nếu < 24h → skip, để cron xử lý sau.
  const createdAt = new Date(replay.created_at).getTime();
  const ageHours = (Date.now() - createdAt) / 3_600_000;
  if (ageHours >= 24) {
    if (!dryRun) {
      let streamDeletedAt: string | null = null;
      try {
        // Keep the Stream source for manual recovery; do not delete here.
        streamDeletedAt = null;
      } catch (_) { /* ignore */ }
      await admin.from('live_replays').update({
        archive_status: 'unrecoverable',
        archive_error: `Cloudflare không ra MP4 sau ${ageHours.toFixed(1)}h (state=${cfState}). Hết khả năng cứu.`.slice(0, 1000),
        archive_next_retry_at: null,
        ...(streamDeletedAt ? { stream_deleted_at: streamDeletedAt } : {}),
      }).eq('id', replayId);
      if (streamDeletedAt) {
        await admin.from('live_sessions').update({ stream_deleted_at: streamDeletedAt }).eq('id', replay.live_session_id);
      }
      await notifyFailed(admin, replay);
      return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'unrecoverable', cf_state: cfState, cf_ready: false, stream_deleted: !!streamDeletedAt, message: `aged_${ageHours.toFixed(1)}h` };
    }
    return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'unrecoverable', cf_state: cfState, cf_ready: false, message: `aged_${ageHours.toFixed(1)}h` };
  }

  return { replay_id: replayId, user_id: replay.user_id, stream_uid: uid, action: 'skipped', cf_state: cfState, cf_ready: false, message: `age=${ageHours.toFixed(1)}h, still recoverable` };
}

async function notifyFailed(admin: any, replay: any): Promise<void> {
  try {
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', replay.user_id)
      .eq('type', 'live_replay_failed')
      .eq('metadata->>replay_id', replay.id)
      .maybeSingle();
    if (existing) return;
    await admin.from('notifications').insert({
      user_id: replay.user_id,
      type: 'live_replay_failed',
      title: 'Bản ghi livestream không lưu được',
      body: 'Phiên livestream của bạn không thể lưu lại do nguồn video bị gián đoạn. Lần sau hãy đảm bảo OBS chạy đủ ít nhất 1 phút trước khi kết thúc nhé.',
      metadata: { replay_id: replay.id, live_session_id: replay.live_session_id, reason: 'admin_resolve_stuck' },
    });
  } catch (err) {
    console.warn('[resolve-stuck] notify failed', String(err));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;
  const replayId: string | undefined = body.replay_id;

  try {
    let replays: any[] = [];
    if (replayId) {
      const { data, error } = await admin.from('live_replays').select('*').eq('id', replayId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Replay not found' }, 404);
      replays = [data];
    } else {
      // Scan toàn bộ replay kẹt: failed + attempts >= 8 + chưa có R2
      const { data, error } = await admin
        .from('live_replays')
        .select('*')
        .in('archive_status', ['failed', 'archiving'])
        .gte('archive_attempts', 8)
        .is('r2_video_url', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      replays = data || [];
    }

    const results: ResolveResult[] = [];
    for (const replay of replays) {
      try {
        const r = await resolveOne(admin, replay, dryRun);
        results.push(r);
      } catch (err) {
        results.push({
          replay_id: replay.id,
          user_id: replay.user_id,
          stream_uid: replay.stream_uid || null,
          action: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] || 0) + 1;
      return acc;
    }, {});

    return json({ ok: true, dry_run: dryRun, scanned: results.length, summary, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[resolve-stuck] fatal', message);
    return json({ error: message }, 500);
  }
});
