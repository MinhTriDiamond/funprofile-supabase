/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { deleteR2ObjectInBucket, listR2Objects } from '../_shared/r2MultiBucketService.ts';

const MAX_CLEANUP_ATTEMPTS = 3;

async function requireCronOrAdmin(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  const admin = createAdminClient() as any;
  if (cronSecret && provided === cronSecret) return { ok: true as const, admin };

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) || '';
  if (!authHeader && !cronSecret) return { ok: true as const, admin };
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const token = authHeader.slice('Bearer '.length).trim();
  if (token && token === anonKey) return { ok: true as const, admin };

  const client = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin };
}

async function logEvent(admin: any, replay: any, event: string, payload: Record<string, unknown> = {}) {
  await admin.from('live_session_events').insert({
    live_session_id: replay.live_session_id,
    reason: event,
    source: 'live-webcam-temp-cleanup',
    payload: {
      live_session_id: replay.live_session_id,
      replay_id: replay.id,
      user_id: replay.user_id,
      temp_bucket: replay.temp_bucket,
      temp_prefix: replay.temp_prefix,
      archive_bucket: replay.archive_bucket || replay.r2_bucket,
      archive_key: replay.archive_mp4_key || replay.r2_object_key,
      ...payload,
      timestamp: new Date().toISOString(),
    },
  }).then(undefined, () => undefined);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));
    const now = new Date().toISOString();

    const { data: rows, error } = await admin
      .from('live_replays')
      .select('id, live_session_id, user_id, temp_bucket, temp_prefix, archive_bucket, archive_mp4_key, archive_mp4_url, r2_bucket, r2_object_key, r2_video_url, replay_status, cleanup_status, cleanup_attempts, cleanup_next_retry_at')
      .eq('replay_status', 'ready_mp4')
      .eq('cleanup_status', 'cleanup_pending')
      .not('archive_mp4_url', 'is', null)
      .not('temp_prefix', 'is', null)
      .lt('cleanup_attempts', MAX_CLEANUP_ATTEMPTS)
      .or(`cleanup_next_retry_at.is.null,cleanup_next_retry_at.lte.${now}`)
      .order('cleanup_next_retry_at', { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const replay of rows || []) {
      const tempBucket = replay.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || 'r2livetemp';
      const tempPrefix = String(replay.temp_prefix || '').replace(/\/+$/, '');
      if (!tempPrefix) continue;

      const cleanupStartedAt = new Date().toISOString();
      const attempt = Number(replay.cleanup_attempts || 0) + 1;
      await admin.from('live_replays').update({
        cleanup_started_at: cleanupStartedAt,
        cleanup_attempts: attempt,
        updated_at: cleanupStartedAt,
      }).eq('id', replay.id).then(undefined, () => undefined);
      await logEvent(admin, replay, 'temp_cleanup_started', { temp_bucket: tempBucket, temp_prefix: tempPrefix, cleanup_attempt: attempt });

      try {
        const objects = await listR2Objects(tempBucket, tempPrefix, 5000);
        let deleted = 0;
        const failures: Array<{ key: string; error: string }> = [];
        for (const obj of objects) {
          try {
            await deleteR2ObjectInBucket(tempBucket, obj.key);
            deleted++;
          } catch (err) {
            failures.push({ key: obj.key, error: err instanceof Error ? err.message : String(err) });
          }
        }

        if (failures.length > 0) {
          throw new Error(JSON.stringify(failures.slice(0, 5)));
        }

        const completedAt = new Date().toISOString();
        await admin.from('live_replays').update({
          cleanup_status: 'cleaned',
          cleanup_completed_at: completedAt,
          cleanup_next_retry_at: null,
          updated_at: completedAt,
        }).eq('id', replay.id);
        await logEvent(admin, replay, 'temp_cleanup_completed', {
          temp_bucket: tempBucket,
          temp_prefix: tempPrefix,
          deleted,
          seen: objects.length,
        });
        results.push({ id: replay.id, live_session_id: replay.live_session_id, status: 'cleaned', deleted, seen: objects.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const exhausted = attempt >= MAX_CLEANUP_ATTEMPTS;
        const nextRetryAt = exhausted ? null : new Date(Date.now() + Math.min(60 * 60_000, attempt * 15 * 60_000)).toISOString();
        await admin.from('live_replays').update({
          cleanup_status: exhausted ? 'failed' : 'cleanup_pending',
          cleanup_next_retry_at: nextRetryAt,
          error_message: message,
          updated_at: new Date().toISOString(),
        }).eq('id', replay.id).then(undefined, () => undefined);
        await logEvent(admin, replay, 'temp_cleanup_failed', {
          temp_bucket: tempBucket,
          temp_prefix: tempPrefix,
          cleanup_attempt: attempt,
          reason: message,
          error: message,
        });
        results.push({ id: replay.id, live_session_id: replay.live_session_id, status: exhausted ? 'failed' : 'retry_scheduled', error: message });
      }
    }

    return json({ ok: true, scanned: rows?.length || 0, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-webcam-temp-cleanup] fatal', message);
    return json({ error: message }, 500);
  }
});
