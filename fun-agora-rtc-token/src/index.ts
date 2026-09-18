import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { handleCors, addCorsHeaders } from './cors';
import { validateInput } from './validate';

interface Env {
  AGORA_APP_ID: string;
  AGORA_APP_CERTIFICATE: string;
  API_KEY: string;
  ALLOWED_ORIGINS: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    const corsResponse = handleCors(request, env.ALLOWED_ORIGINS);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    let response: Response;

    try {
      if (path === '/' && request.method === 'POST') {
        response = await handleTokenGeneration(request, env);
      } else {
        response = json({ error: 'Not found' }, 404);
      }
    } catch (err: any) {
      console.error('Worker error:', err);
      response = json({ error: err.message || 'Internal error' }, 500);
    }

    return addCorsHeaders(response, request, env.ALLOWED_ORIGINS);
  },
};

// ─── Agora RTC Token Generation ────────────────────────────────
async function handleTokenGeneration(request: Request, env: Env): Promise<Response> {
  // Authenticate via X-API-Key
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== env.API_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = (await request.json()) as {
    channelName?: string;
    uid?: string | number;
    role?: string;
  };
  const validation = validateInput(body);
  if (!validation.valid) {
    return json({ error: validation.error }, 400);
  }

  const { channelName, uid, role } = body;
  const agoraRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  const expirationInSeconds = 86400;
  const uidNum = typeof uid === 'number' ? uid : 0;
  const userAccount = typeof uid === 'string' ? uid : '';

  let token: string;
  if (userAccount) {
    token = RtcTokenBuilder.buildTokenWithUserAccount(
      env.AGORA_APP_ID,
      env.AGORA_APP_CERTIFICATE,
      channelName!,
      userAccount,
      agoraRole,
      expirationInSeconds,
      expirationInSeconds
    );
  } else {
    token = RtcTokenBuilder.buildTokenWithUid(
      env.AGORA_APP_ID,
      env.AGORA_APP_CERTIFICATE,
      channelName!,
      uidNum,
      agoraRole,
      expirationInSeconds,
      expirationInSeconds
    );
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  return json({
    token,
    app_id: env.AGORA_APP_ID,
    uid: userAccount || uidNum,
    channel: channelName,
    expires_at: currentTimestamp + expirationInSeconds,
  });
}
