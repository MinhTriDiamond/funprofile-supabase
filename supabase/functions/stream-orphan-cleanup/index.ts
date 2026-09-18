/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * stream-orphan-cleanup
 *
 * Quét toàn bộ video trên Cloudflare Stream account và xoá những UID
 * KHÔNG còn được trỏ tới bởi bất kỳ live_replays/live_sessions nào đang hoạt động.
 *
 * Bảo vệ:
 *  - Mặc định dry_run=true. Chỉ xoá khi caller truyền dry_run=false.
 *  - Bỏ qua UID gắn với replay đang live / pending / r2_ready / replay_posted (chưa hoàn tất R2).
 *  - Chỉ xoá UID đã archived + có R2. UID không khớp DB mặc định chỉ preview,
 *    muốn xoá phải truyền delete_orphan_unknown=true.
 *  - Chỉ admin (has_role 'admin') hoặc CRON secret được gọi.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteStreamVideo, getStreamAccountId, getStreamToken } from '../_shared/cloudflareStreamService.ts';

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

function extractStreamUid(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  const direct = value.match(/^[a-f0-9-]{32,36}$/i);
  if (direct) return value;
  const urlMatch = value.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-f0-9-]{32,36})/i);
  return urlMatch?.[1] || null;
}

function addReferencedUids(out: Set<string>, value: unknown) {
  if (!value) return;
  if (typeof value === 'string') {
    const uid = extractStreamUid(value);
    if (uid) out.add(uid);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addReferencedUids(out, item);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) addReferencedUids(out, item);
  }
}

async function listAllStreamVideos(): Promise<Array<{ uid: string; created: string; status?: any; meta?: any }>> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const out: Array<{ uid: string; created: string; status?: any; meta?: any }> = [];
  // Cloudflare paginates by 1000 max, dùng `after` (timestamp) để paginate.
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`);
    url.searchParams.set('limit', '1000');
    if (after) url.searchParams.set('after', after);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`CF list stream failed: ${r.status} ${await r.text()}`);
    const data = await r.json();
    const items = (data?.result || []) as any[];
    if (!items.length) break;
    for (const v of items) {
      if (v?.uid) out.push({ uid: String(v.uid), created: String(v.created || ''), status: v.status, meta: v.meta });
    }
    if (items.length < 1000) break;
    // dùng `created` của item cuối cùng làm cursor
    after = items[items.length - 1]?.created;
    if (!after) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');

  const authHeader = req.headers.get('Authorization') || '';
  const xCron = req.headers.get('X-Cron-Secret');
  const isCron = (cronSecret && xCron === cronSecret) || authHeader === `Bearer ${serviceRoleKey}`;

  // Admin check qua JWT user (nếu không phải cron)
  let isAdmin = false;
  if (!isCron) {
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: hasRole } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    isAdmin = !!hasRole;
    if (!isAdmin) return json({ error: 'Forbidden — admin only' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const dry_run: boolean = body.dry_run !== false; // default TRUE
  const max_delete: number = Math.max(1, Math.min(Number(body.max_delete) || 200, 1000));
  const min_age_hours: number = Math.max(0, Math.min(Number(body.min_age_hours) || 24, 24 * 30));
  const delete_orphan_unknown: boolean = body.delete_orphan_unknown === true;
  const minCreatedAt = Date.now() - min_age_hours * 60 * 60 * 1000;

  // 1. Lấy toàn bộ UID đang còn trên Cloudflare Stream
  let cfVideos: Array<{ uid: string; created: string; status?: any; meta?: any }>;
  try {
    cfVideos = await listAllStreamVideos();
  } catch (err) {
    return json({ error: 'cf_list_failed', detail: String(err) }, 502);
  }

  // 2. Lấy whitelist UID từ DB
  const { data: replays } = await (admin as any)
    .from('live_replays')
    .select('stream_uid, cloudflare_video_uid, archive_status, r2_video_url, replay_post_id, live_session_id');
  const { data: sessions } = await (admin as any)
    .from('live_sessions')
    .select('cloudflare_video_uid, status, mode');
  const { data: postRefs } = await (admin as any)
    .from('posts')
    .select('video_url, media_urls, metadata')
    .or('video_url.not.is.null,media_urls.not.is.null,metadata.not.is.null');
  const { data: commentRefs } = await (admin as any)
    .from('comments')
    .select('video_url')
    .not('video_url', 'is', null);
  const { data: profileRefs } = await (admin as any)
    .from('profiles')
    .select('cover_url')
    .not('cover_url', 'is', null);

  // UID đang được "giữ" — KHÔNG xoá
  const protectStatuses = new Set([
    'pending', 'r2_ready', 'replay_posted', 'archiving', 'processing_stream',
    'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'failed',
    'stream_delete_pending',
  ]);
  const liveSessionStatuses = new Set([
    'source_connected', 'ready_to_go_live', 'live', 'disconnect_grace',
    'replay_temp_ready', 'ended', 'processing', 'processing_stream',
  ]);

  const protectedUids = new Set<string>();
  const archivedUids = new Set<string>();
  for (const r of (replays || []) as any[]) {
    const uids = [r.stream_uid, r.cloudflare_video_uid].filter(Boolean);
    for (const u of uids) {
      if (protectStatuses.has(r.archive_status)) protectedUids.add(String(u));
      else if (r.archive_status === 'archived' && r.r2_video_url) archivedUids.add(String(u));
    }
  }
  for (const s of (sessions || []) as any[]) {
    if (s.cloudflare_video_uid && liveSessionStatuses.has(s.status)) {
      protectedUids.add(String(s.cloudflare_video_uid));
    }
  }
  for (const p of (postRefs || []) as any[]) {
    addReferencedUids(protectedUids, p.video_url);
    addReferencedUids(protectedUids, p.media_urls);
    addReferencedUids(protectedUids, p.metadata);
  }
  for (const c of (commentRefs || []) as any[]) {
    addReferencedUids(protectedUids, c.video_url);
  }
  for (const p of (profileRefs || []) as any[]) {
    addReferencedUids(protectedUids, p.cover_url);
  }

  // 3. Phân loại UID Cloudflare
  const toDelete: string[] = [];
  const keepProtected: string[] = [];
  const orphanUnknown: string[] = [];
  const tooRecent: string[] = [];

  for (const v of cfVideos) {
    const createdMs = Date.parse(v.created || '') || 0;
    if (createdMs > minCreatedAt) {
      tooRecent.push(v.uid);
      continue;
    }
    const state = String(v.status?.state || v.status?.current?.state || '').toLowerCase();
    if (
      state &&
      state !== 'ready' &&
      state !== 'error'
    ) {
      keepProtected.push(v.uid);
      continue;
    }
    if (protectedUids.has(v.uid)) {
      keepProtected.push(v.uid);
      continue;
    }
    if (archivedUids.has(v.uid)) {
      toDelete.push(v.uid);
      continue;
    }
    // Không khớp DB → orphan thực sự
    orphanUnknown.push(v.uid);
  }

  // Safety: unknown orphans are preview-only by default. They may be replays
  // whose webhook/DB row has not materialized yet.
  const candidates = [...toDelete, ...(delete_orphan_unknown ? orphanUnknown : [])].slice(0, max_delete);

  const deletedNow: string[] = [];
  const failed: Array<{ uid: string; error: string }> = [];

  if (!dry_run) {
    for (const uid of candidates) {
      try {
        await deleteStreamVideo(uid);
        deletedNow.push(uid);
      } catch (err) {
        failed.push({ uid, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const deletedUids = dry_run ? candidates : deletedNow;
  const errorMessages = failed.map((item) => `${item.uid}: ${item.error}`);

  return json({
    ok: true,
    dry_run,
    dryRun: dry_run,
    cf_total: cfVideos.length,
    db_protected_uids: protectedUids.size,
    db_archived_uids: archivedUids.size,
    totalVideosOnStream: cfVideos.length,
    totalVideosInDb: protectedUids.size + archivedUids.size,
    orphanVideosFound: candidates.length,
    orphanVideosDeleted: dry_run ? candidates.length : deletedNow.length,
    errors: errorMessages,
    deletedUids: deletedUids.slice(0, 50),
    classified: {
      delete_archived: toDelete.length,
      delete_orphan_unknown: delete_orphan_unknown ? orphanUnknown.length : 0,
      preview_orphan_unknown: delete_orphan_unknown ? 0 : orphanUnknown.length,
      keep_protected: keepProtected.length,
      keep_too_recent: tooRecent.length,
    },
    delete_orphan_unknown,
    min_age_hours,
    candidates_total: candidates.length,
    deleted_count: deletedNow.length,
    failed_count: failed.length,
    deleted_now: deletedNow.slice(0, 50),
    failed: failed.slice(0, 50),
    sample_orphan: orphanUnknown.slice(0, 20),
  });
});
