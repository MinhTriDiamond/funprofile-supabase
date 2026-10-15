import { createAdminClient } from '../_shared/httpAuth.ts';
import {
  parseAgoraRecordingNotification,
  classifyAgoraRecordingSessionLookup,
  isDuplicateAgoraRecordingReceipt,
  shouldWakeRecordingProcessor,
  verifyAgoraRecordingSignature,
} from '../_shared/agoraRecordingWebhookPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, agora-signature, agora-signature-v2',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function wakeRecordingProcessor(sessionId: string, eventKey: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[agora-cloud-recording-webhook] processor wake unavailable', { event_key: eventKey });
    return Promise.resolve();
  }

  return fetch(`${supabaseUrl}/functions/v1/live-webcam-recording-processor`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId, limit: 1 }),
  }).then((response) => {
    if (!response.ok) {
      console.warn('[agora-cloud-recording-webhook] processor wake returned non-2xx', {
        event_key: eventKey,
        status: response.status,
      });
    }
  }).catch(() => {
    // The durable receipt is already stored. The existing bounded processor
    // cron remains responsible for recovering a missed wake-up.
    console.warn('[agora-cloud-recording-webhook] processor wake failed', { event_key: eventKey });
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text().catch(() => '');
  if (!rawBody || rawBody.length > 256_000) return json({ error: 'Invalid notification body' }, 400);

  const secret = Deno.env.get('AGORA_CLOUD_RECORDING_WEBHOOK_SECRET') || '';
  const signatureValid = await verifyAgoraRecordingSignature(rawBody, {
    signature: req.headers.get('Agora-Signature'),
    signatureV2: req.headers.get('Agora-Signature-V2'),
  }, secret);
  if (!signatureValid) return json({ error: 'Invalid signature' }, 401);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid notification JSON' }, 400);
  }
  const event = parseAgoraRecordingNotification(body);
  if (!event) return json({ error: 'Unsupported or incomplete notification' }, 400);

  try {
    const admin = createAdminClient() as any;
    const { data: session, error: sessionError } = await admin
      .from('live_sessions')
      .select('id, mode, recording_sid')
      .eq('mode', 'agora_webcam')
      .eq('recording_sid', event.recordingSid)
      .maybeSingle();
    const lookupOutcome = classifyAgoraRecordingSessionLookup(sessionError !== null, session?.id);
    if (lookupOutcome === 'retry') return json({ error: 'Could not match recording session' }, 503);
    if (lookupOutcome === 'unmatched') {
      // Session creation may lag a valid callback. Acknowledge it to Agora and
      // let the authoritative bounded recording processor reconcile the session.
      return json({ ok: true, accepted: false, reason: 'unmatched_session' });
    }

    const payload = {
      agora_event_key: event.eventKey,
      notice_id: event.noticeId,
      event_type: event.eventType,
      sequence: event.sequence,
      notify_ms: event.notifyMs,
      recording_sid: event.recordingSid,
      channel_name: event.channelName,
      uid: event.uid,
      received_at: new Date().toISOString(),
    };
    const { error: insertError } = await admin.from('live_session_events').insert({
      live_session_id: session.id,
      source: 'agora-cloud-recording-webhook',
      reason: `agora_recording_event_${event.eventType}`,
      payload,
    });

    if (isDuplicateAgoraRecordingReceipt(insertError?.code)) return json({ ok: true, duplicate: true });
    if (insertError) return json({ error: 'Could not persist notification' }, 503);

    if (shouldWakeRecordingProcessor(event.eventType)) {
      const wake = wakeRecordingProcessor(session.id, event.eventKey);
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime && typeof runtime.waitUntil === 'function') runtime.waitUntil(wake);
      else void wake;
    }

    return json({ ok: true, accepted: true });
  } catch {
    return json({ error: 'Notification processing unavailable' }, 503);
  }
});
