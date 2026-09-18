/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin/CRON utility: quét mọi luồng RTMP cố định (rtmp_stream_configs) và
 * đối chiếu cloudflare_live_input_id với Cloudflare Stream.
 * Config nào bị 404 (Live Input đã bị xoá) → tạo Live Input mới + cập nhật
 * Stream Key mã hoá, để user chỉ cần copy lại key vào OBS.
 *
 * Body: { dry_run?: boolean, limit?: number }
 */
import { checkStreamLiveInputExists, createStreamLiveInput } from '../_shared/cloudflareStreamService.ts';
import { encryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

interface RepairResult {
  config_id: string;
  user_id: string;
  old_live_input_id: string | null;
  action: 'ok' | 'unknown' | 'would_repair' | 'repaired' | 'repair_failed';
  detail?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createAdminClient();
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && cronSecret === (Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET'));

  try {
    if (!isCron) {
      const user = await requireUser(req);
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 500);

    const { data: configs, error } = await admin
      .from('rtmp_stream_configs')
      .select('id, user_id, cloudflare_live_input_id')
      .eq('is_persistent', true)
      .is('deleted_at', null)
      .limit(limit);
    if (error) throw error;

    const results: RepairResult[] = [];
    for (const cfg of configs || []) {
      const inputId: string | null = cfg.cloudflare_live_input_id || null;
      if (!inputId) {
        results.push({ config_id: cfg.id, user_id: cfg.user_id, old_live_input_id: null, action: 'unknown', detail: 'no_input_id' });
        continue;
      }
      const probe = await checkStreamLiveInputExists(inputId);
      if (probe.exists === true) {
        results.push({ config_id: cfg.id, user_id: cfg.user_id, old_live_input_id: inputId, action: 'ok' });
        continue;
      }
      if (probe.exists === null) {
        results.push({ config_id: cfg.id, user_id: cfg.user_id, old_live_input_id: inputId, action: 'unknown', detail: probe.error });
        continue;
      }
      if (dryRun) {
        results.push({ config_id: cfg.id, user_id: cfg.user_id, old_live_input_id: inputId, action: 'would_repair' });
        continue;
      }
      try {
        const liveInput = await createStreamLiveInput({
          name: 'Fun Profile Persistent OBS Live',
          userId: cfg.user_id,
          liveSessionId: cfg.id,
        });
        if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) throw new Error('Cloudflare did not return RTMPS credentials');
        const nowIso = new Date().toISOString();
        await admin.from('rtmp_stream_configs').update({
          cloudflare_live_input_id: liveInput.uid,
          rtmps_url: liveInput.rtmpsUrl,
          stream_key_encrypted: await encryptStreamKey(liveInput.rtmpsStreamKey),
          stream_key_last_reset_at: nowIso,
          updated_at: nowIso,
        }).eq('id', cfg.id);
        console.log('[RTMP_KEY_RESCUE]', { scope: 'missing_live_input_batch', rtmpConfigId: cfg.id, oldLiveInputId: inputId, newLiveInputId: liveInput.uid });
        results.push({ config_id: cfg.id, user_id: cfg.user_id, old_live_input_id: inputId, action: 'repaired', detail: { new_live_input_id: liveInput.uid } });
      } catch (err) {
        results.push({
          config_id: cfg.id,
          user_id: cfg.user_id,
          old_live_input_id: inputId,
          action: 'repair_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return json({
      ok: true,
      dry_run: dryRun,
      scanned: (configs || []).length,
      repaired: results.filter((r) => r.action === 'repaired').length,
      missing: results.filter((r) => r.action === 'repaired' || r.action === 'would_repair').length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : 500;
    return json({ error: message }, status);
  }
});
