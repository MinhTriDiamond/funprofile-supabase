import { RtcRole, RtcTokenBuilder } from 'npm:agora-token';
import { createAuthedClient, json, requireUser } from '../_shared/httpAuth.ts';
import { evaluateAgoraCallTokenAccess } from '../_shared/agoraCallTokenPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ POST.' }, 405);

  try { await requireUser(req); }
  catch { return json({ code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập để thực hiện cuộc gọi.' }, 401); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ code: 'INVALID_JSON', message: 'Dữ liệu yêu cầu không hợp lệ.' }, 400); }
  if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).call_session_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((body as Record<string, unknown>).call_session_id as string)) {
    return json({ code: 'INVALID_CALL_SESSION', message: 'Mã cuộc gọi không hợp lệ.' }, 400);
  }

  const client = createAuthedClient(req);
  const { data, error } = await client.rpc('get_agora_call_token_context', { p_call_session_id: (body as { call_session_id: string }).call_session_id });
  if (error) {
    // Database/provider details may contain request or auth metadata; never return/log them.
    if (error.code === '42501') return json({ code: 'CALL_BLOCKED', message: 'Không thể tham gia cuộc gọi này.' }, 403);
    return json({ code: 'CALL_CONTEXT_UNAVAILABLE', message: 'Không thể xác minh cuộc gọi lúc này. Vui lòng thử lại.' }, 503);
  }
  const context = Array.isArray(data) ? data[0] : data;
  if (!context || typeof context !== 'object') return json({ code: 'CALL_FORBIDDEN', message: 'Bạn không có quyền tham gia cuộc gọi này.' }, 403);
  const row = context as { channel_name?: unknown; agora_uid?: unknown; call_status?: unknown };
  const decision = evaluateAgoraCallTokenAccess({ authenticated: true, isActiveMember: true, blocked: false, callStatus: String(row.call_status ?? '') });
  if (!decision.allowed) return json({ code: decision.code, message: decision.message }, decision.status);
  if (typeof row.channel_name !== 'string' || !Number.isSafeInteger(row.agora_uid) || Number(row.agora_uid) <= 0) {
    return json({ code: 'CALL_CONTEXT_INVALID', message: 'Thông tin cuộc gọi chưa sẵn sàng.' }, 503);
  }

  const appId = Deno.env.get('AGORA_APP_ID');
  const certificate = Deno.env.get('AGORA_APP_CERTIFICATE');
  if (!appId || !certificate) return json({ code: 'CALL_PROVIDER_NOT_CONFIGURED', message: 'Dịch vụ cuộc gọi hiện chưa sẵn sàng.' }, 503);
  try {
    const expiresIn = 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(appId, certificate, row.channel_name, Number(row.agora_uid), RtcRole.PUBLISHER, expiresIn, expiresIn);
    return json({ app_id: appId, token, uid: Number(row.agora_uid), channel: row.channel_name, expires_at: Math.floor(Date.now() / 1000) + expiresIn }, 200);
  } catch {
    return json({ code: 'CALL_TOKEN_FAILED', message: 'Không thể cấp quyền cuộc gọi lúc này.' }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
