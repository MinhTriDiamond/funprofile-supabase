/* eslint-disable @typescript-eslint/no-explicit-any */
import { RtcRole, RtcTokenBuilder } from 'npm:agora-token';
import { uuidToAgoraNumericUid } from './agoraService.ts';

type JsonRecord = Record<string, any>;

export interface AgoraRecordingStartInput {
  resourceId: string;
  channel: string;
  uid: number | string;
  token: string;
  userId: string;
  sessionId: string;
  tempBucket?: string;
  quality?: string;
  recordingLayout?: 'landscape_16_9' | 'portrait_9_16';
}

export const LIVESTREAM_RTC_TOKEN_EXPIRE_SECONDS = 24 * 60 * 60;

function requireEnv(name: string, fallbacks: string[] = []): string {
  const names = [name, ...fallbacks];
  for (const key of names) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing required env ${name}`);
}

function agoraAppId(): string {
  return requireEnv('AGORA_APP_ID');
}

function agoraAuthHeader(): string {
  const customerId = requireEnv('AGORA_CUSTOMER_ID', ['AGORA_REST_KEY']);
  const customerSecret = requireEnv('AGORA_CUSTOMER_SECRET', ['AGORA_REST_SECRET']);
  return `Basic ${btoa(`${customerId}:${customerSecret}`)}`;
}

function recordingBaseUrl(): string {
  return `https://api.agora.io/v1/apps/${agoraAppId()}/cloud_recording`;
}

function parseAgoraError(status: number, text: string): Error {
  let message = text || `Agora Cloud Recording request failed (${status})`;
  try {
    const json = JSON.parse(text);
    message = json.reason || json.message || json.error || message;
  } catch {
    // keep raw text
  }
  const error = new Error(message) as Error & { status?: number; raw?: string };
  error.status = status;
  error.raw = text;
  return error;
}

async function agoraFetch(path: string, init: RequestInit): Promise<JsonRecord> {
  const res = await fetch(`${recordingBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: agoraAuthHeader(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw parseAgoraError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export function buildRtcToken(
  channel: string,
  uid: number,
  role: 'publisher' | 'subscriber' = 'publisher',
  expireSeconds = LIVESTREAM_RTC_TOKEN_EXPIRE_SECONDS,
): { token: string; expiresAt: number; issuedAt: number; expiresIn: number; appId: string } {
  const appId = agoraAppId();
  const certificate = requireEnv('AGORA_APP_CERTIFICATE');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expireSeconds;
  const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const token = RtcTokenBuilder.buildTokenWithUid(appId, certificate, channel, uid, agoraRole, expiresAt);
  return { token, expiresAt, issuedAt: now, expiresIn: expireSeconds, appId };
}

export function buildRecordingUid(sessionId: string, hostUid?: number | null): number {
  let uid = uuidToAgoraNumericUid(`recording:${sessionId}`);
  if (hostUid && uid === hostUid) uid += 1;
  return uid || 900001;
}

export function resolveRecordingLayout(
  recordingLayout?: string | null,
  quality?: string | null,
): {
  layout: 'landscape_16_9' | 'portrait_9_16';
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  aspectRatio: string;
} {
  const layout = recordingLayout === 'portrait_9_16' ? 'portrait_9_16' : 'landscape_16_9';
  const q = quality === '1080p' || quality === '720p' || quality === '480p' ? quality : '720p';

  if (layout === 'portrait_9_16') {
    if (q === '480p') return { layout, width: 540, height: 960, fps: 18, bitrate: 900, aspectRatio: '9:16' };
    return { layout, width: 720, height: 1280, fps: 20, bitrate: 1400, aspectRatio: '9:16' };
  }

  if (q === '1080p') return { layout, width: 1920, height: 1080, fps: 30, bitrate: 2600, aspectRatio: '16:9' };
  if (q === '480p') return { layout, width: 854, height: 480, fps: 24, bitrate: 900, aspectRatio: '16:9' };
  return { layout, width: 1280, height: 720, fps: 24, bitrate: 1600, aspectRatio: '16:9' };
}

function buildTranscodingConfig(recordingLayout?: string | null, quality?: string | null): JsonRecord {
  const resolved = resolveRecordingLayout(recordingLayout, quality);
  return {
    width: resolved.width,
    height: resolved.height,
    fps: resolved.fps,
    bitrate: resolved.bitrate,
    mixedVideoLayout: 1,
    backgroundColor: '#000000',
  };
}

export async function acquireRecording(channel: string, uid: number | string): Promise<JsonRecord> {
  const body = {
    cname: channel,
    uid: String(uid),
    clientRequest: {
      scene: 0,
      resourceExpiredHour: 24,
    },
  };
  return await agoraFetch('/acquire', { method: 'POST', body: JSON.stringify(body) });
}

export async function startRecording(input: AgoraRecordingStartInput): Promise<JsonRecord> {
  const vendor = Number(Deno.env.get('AGORA_RECORDING_STORAGE_VENDOR') || 11);
  const region = Number(Deno.env.get('AGORA_RECORDING_STORAGE_REGION') || 0);
  const maxIdleTime = Number(Deno.env.get('AGORA_RECORDING_MAX_IDLE_TIME') || 30);
  const tempBucket = input.tempBucket || requireEnv('R2_TEMP_BUCKET');
  // Agora docs require endpoint as a bare hostname (e.g. "xxxxx.r2.cloudflarestorage.com").
  // Strip scheme/trailing slash so misconfigured secrets still work.
  let endpoint = Deno.env.get('AGORA_RECORDING_STORAGE_ENDPOINT')?.trim() || '';
  const originalEndpoint = endpoint;
  endpoint = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (endpoint !== originalEndpoint) {
    console.warn('[agoraCloudRecording] normalized endpoint from', originalEndpoint, 'to', endpoint);
  }

  // vendor=11 ("S3 compatible storage") is the only Agora vendor that honors
  // extensionParams.endpoint — required for Cloudflare R2 / MinIO / etc.
  // vendor=1 = real AWS S3 (ignores endpoint); see https://docs.agora.io/en/cloud-recording/reference/region-vendor
  if (vendor === 11 && !endpoint) {
    throw new Error(
      'AGORA_RECORDING_STORAGE_ENDPOINT is required when AGORA_RECORDING_STORAGE_VENDOR=11 (S3-compatible endpoint, e.g. <account>.r2.cloudflarestorage.com)',
    );
  }

  const storageConfig: JsonRecord = {
    vendor,
    region,
    bucket: tempBucket,
    accessKey: requireEnv('R2_ACCESS_KEY_ID', ['CLOUDFLARE_ACCESS_KEY_ID']),
    secretKey: requireEnv('R2_SECRET_ACCESS_KEY', ['CLOUDFLARE_SECRET_ACCESS_KEY']),
    fileNamePrefix: ['agora-temp', input.userId, input.sessionId],
  };

  if (vendor === 11 && endpoint) {
    // Per Agora spec, S3-compatible vendor only accepts { endpoint } here.
    storageConfig.extensionParams = { endpoint };
  }

  const transcodingConfig = buildTranscodingConfig(input.recordingLayout, input.quality);

  const body = {
    cname: input.channel,
    uid: String(input.uid),
    clientRequest: {
      token: input.token,
      recordingConfig: {
        maxIdleTime,
        streamTypes: 2,
        channelType: 0,
        subscribeUidGroup: 0,
        subscribeAudioUids: ['#allstream#'],
        subscribeVideoUids: ['#allstream#'],
        transcodingConfig,
      },
      recordingFileConfig: {
        avFileType: ['hls', 'mp4'],
      },
      storageConfig,
    },
  };
  return await agoraFetch(`/resourceid/${encodeURIComponent(input.resourceId)}/mode/mix/start`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function queryRecording(resourceId: string, sid: string, channel: string, uid: number | string): Promise<JsonRecord> {
  return await agoraFetch(
    `/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/query?cname=${encodeURIComponent(channel)}&uid=${encodeURIComponent(String(uid))}`,
    { method: 'GET' },
  );
}

function isNotFoundRecordingError(error: unknown): boolean {
  const anyErr = error as { status?: number; message?: string; raw?: string };
  const text = `${anyErr?.message || ''} ${anyErr?.raw || ''}`.toLowerCase();
  return anyErr?.status === 404 || text.includes('not found') || text.includes('not exist');
}

export async function stopRecording(
  resourceId: string,
  sid: string,
  channel: string,
  uid: number | string,
  maxAttempts = 3,
): Promise<JsonRecord & { alreadyStopped?: boolean }> {
  const body = {
    cname: channel,
    uid: String(uid),
    clientRequest: {},
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await agoraFetch(
        `/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/stop`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    } catch (error) {
      if (isNotFoundRecordingError(error)) {
        return { alreadyStopped: true, reason: 'not_found' };
      }
      if (attempt >= maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt * attempt));
    }
  }

  return { alreadyStopped: true, reason: 'exhausted' };
}
