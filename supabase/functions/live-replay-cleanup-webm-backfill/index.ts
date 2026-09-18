/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanupR2Source } from '../_shared/archiveReplayService.ts';
import { headR2Object } from '../_shared/r2StorageService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Function chỉ được pg_cron / admin gọi qua URL nội bộ, verify_jwt=false đồng nhất
  // với pattern các cron live-replay-* khác (live-replay-archive-cron, poll-status…).

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  const { data: replays, error } = await (admin as any)
    .from('live_replays')
    .select('id, user_id, source_webm_key, chunked_recording_id, r2_object_key, r2_video_url, replay_post_id, webm_source_deleted_at, chunks_deleted_at, archived_at')
    .eq('archive_status', 'archived')
    .not('r2_video_url', 'is', null)
    .not('replay_post_id', 'is', null)
    .or('webm_source_deleted_at.is.null,chunks_deleted_at.is.null')
    .order('archived_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[CLEANUP_BACKFILL] query failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  let safetySkipped = 0;
  let failed = 0;

  for (const replay of replays || []) {
    try {
      // Safety: chỉ cleanup khi MP4 vẫn còn trên R2 + size>0
      if (!replay.r2_object_key) {
        safetySkipped++;
        continue;
      }
      const head = await headR2Object(replay.r2_object_key).catch(() => ({ exists: false, size: 0 }));
      if (!head.exists || head.size <= 0) {
        console.warn('[CLEANUP_BACKFILL] skip — MP4 missing on R2', { replay_id: replay.id, key: replay.r2_object_key });
        safetySkipped++;
        continue;
      }
      await cleanupR2Source(admin, replay);
      processed++;
    } catch (err) {
      console.error('[CLEANUP_BACKFILL] replay failed', { replay_id: replay.id, err: String(err) });
      failed++;
    }
  }

  const result = {
    ok: true,
    batch_size: replays?.length ?? 0,
    processed,
    safety_skipped: safetySkipped,
    failed,
  };
  console.log('[CLEANUP_BACKFILL] done', result);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
