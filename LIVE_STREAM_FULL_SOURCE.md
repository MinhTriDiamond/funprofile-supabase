# LIVE STREAM FULL SOURCE BUNDLE

Generated: 2026-02-21 16:17:41 +08:00
Scope: Live stream + Agora RTC reuse + Supabase + Worker (no packages/fun-chat*)

Restore rule: Create each file exactly at the path shown after `### FILE:` and paste the full code block content.

## TABLE OF CONTENTS

### App
- src/pages/LiveDiscoveryPage.tsx
- src/integrations/supabase/client.ts
- src/lib/agoraRtc.ts
- src/utils/r2Upload.ts
- src/components/layout/FacebookNavbar.tsx
- src/components/layout/MobileBottomNav.tsx
- src/components/ui/avatar.tsx
- src/components/ui/badge.tsx
- src/components/ui/button.tsx
- src/components/ui/card.tsx
- src/components/ui/dialog.tsx
- src/components/ui/input.tsx
- src/components/ui/label.tsx
- src/components/ui/progress.tsx
- src/components/ui/radio-group.tsx
- src/components/ui/scroll-area.tsx
- src/components/ui/skeleton.tsx
- src/modules/live/api/agora.ts
- src/modules/live/components/FloatingReactions.tsx
- src/modules/live/components/LiveChatPanel.tsx
- src/modules/live/components/LiveChatReplay.tsx
- src/modules/live/components/LiveSessionCard.tsx
- src/modules/live/components/LiveSharePanel.tsx
- src/modules/live/components/StartLiveDialog.tsx
- src/modules/live/hooks/useFollowingLiveStatus.ts
- src/modules/live/hooks/useLiveComments.ts
- src/modules/live/hooks/useLiveMessages.ts
- src/modules/live/hooks/useLiveReactions.ts
- src/modules/live/hooks/useLiveRtc.ts
- src/modules/live/index.ts
- src/modules/live/liveService.ts
- src/modules/live/pages/AudienceLive.tsx
- src/modules/live/pages/HostLive.tsx
- src/modules/live/pages/LiveAudiencePage.tsx
- src/modules/live/pages/LiveHostPage.tsx
- src/modules/live/pages/LiveStream.tsx
- src/modules/live/pages/LiveStudio.tsx
- src/modules/live/pages/LiveViewer.tsx
- src/modules/live/README.md
- src/modules/live/recording/clientRecorder.ts
- src/modules/live/streamService.ts
- src/modules/live/types.ts
- src/modules/live/useLiveSession.ts

### Supabase
- supabase/config.toml
- supabase/functions/_shared/jwt.ts
- supabase/functions/agora-token/index.ts
- supabase/functions/live-token/index.ts
- supabase/functions/live-token/deno.json
- supabase/functions/live-start/index.ts
- supabase/functions/live-stop/index.ts
- supabase/functions/live-recording-start/index.ts
- supabase/functions/live-recording-stop/index.ts
- supabase/functions/live-recording-status/index.ts
- supabase/functions/live-recording-proxy/index.ts
- supabase/functions/stream-video/index.ts
- supabase/functions/cleanup-stream-videos/index.ts
- supabase/migrations/20260211103000_live_sessions_mvp.sql
- supabase/migrations/20260211114000_live_recording_e2e.sql
- supabase/migrations/20260211121000_live_recording_alignment.sql
- supabase/migrations/20260215010000_live_stream_mvp_phase0.sql
- supabase/migrations/20260215173000_live_replay_backfill.sql
- supabase/migrations/20260215194000_live_recording_rpc_no_service_role.sql
- supabase/migrations/20260217153000_live_sessions_rls_additive.sql

### Worker
- worker/package.json
- worker/README.md
- worker/wrangler.toml
- worker/tsconfig.json
- worker/src/cors.ts
- worker/src/index.ts
- worker/src/recording.ts
- worker/src/upload.ts
- worker/src/validate.ts

## SOURCE DUMP

### FILE: src/pages/LiveDiscoveryPage.tsx
`$ext
import { useNavigate } from 'react-router-dom';
import { Radio, Eye, Users } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFollowingLiveStatus } from '@/modules/live/hooks/useFollowingLiveStatus';
import { useActiveLiveSessions } from '@/modules/live';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function LiveDiscoveryPage() {
  const navigate = useNavigate();
  const { liveFriends, isLoading: friendsLoading } = useFollowingLiveStatus();
  const { data: allSessions = [], isLoading: allLoading } = useActiveLiveSessions();

  // Filter out sessions already shown in friends section
  const friendSessionIds = new Set(liveFriends.map((f) => f.sessionId));
  const otherSessions = allSessions.filter((s) => !friendSessionIds.has(s.id));

  const isLoading = friendsLoading || allLoading;

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 max-w-2xl mx-auto px-4 pb-24 lg:pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 py-5">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Live</h1>
            <p className="text-sm text-muted-foreground">Xem báº¡n bĂ¨ vĂ  má»i ngÆ°á»i Ä‘ang phĂ¡t trá»±c tiáº¿p</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Friends section */}
            {liveFriends.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Báº¡n bĂ¨ Ä‘ang live
                </h2>
                <div className="space-y-3">
                  {liveFriends.map((s) => (
                    <LiveSessionRow
                      key={s.sessionId}
                      sessionId={s.sessionId}
                      title={s.title}
                      viewerCount={s.viewerCount}
                      startedAt={s.startedAt}
                      host={s.host}
                      onWatch={() => navigate(`/live/${s.sessionId}`)}
                      isFriend
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other live sessions */}
            {otherSessions.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  Äang diá»…n ra
                </h2>
                <div className="space-y-3">
                {otherSessions.map((s) => (
                    <LiveSessionRow
                      key={s.id}
                      sessionId={s.id}
                      title={s.title || 'PhĂ¡t trá»±c tiáº¿p'}
                      viewerCount={s.viewer_count}
                      startedAt={s.started_at}
                      host={{
                        id: s.host_user_id,
                        username: s.host_profile?.username || 'User',
                        avatar_url: s.host_profile?.avatar_url || null,
                      }}
                      onWatch={() => navigate(`/live/${s.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {liveFriends.length === 0 && otherSessions.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Radio className="w-8 h-8 opacity-40" />
                </div>
                <p className="font-medium text-foreground">KhĂ´ng cĂ³ ai Ä‘ang live</p>
                <p className="text-sm mt-1">HĂ£y quay láº¡i sau nhĂ©!</p>
              </div>
            )}
          </>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}

interface LiveSessionRowProps {
  sessionId: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  host: { id: string; username: string; avatar_url: string | null };
  onWatch: () => void;
  isFriend?: boolean;
}

function LiveSessionRow({ title, viewerCount, startedAt, host, onWatch, isFriend }: LiveSessionRowProps) {
  return (
    <Card className="p-4 hover:bg-accent/30 transition-colors cursor-pointer" onClick={onWatch}>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12">
            <AvatarImage src={host.avatar_url || ''} />
            <AvatarFallback>{host.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          {/* Live indicator */}
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-destructive rounded-full border-2 border-background flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-sm truncate">{host.username}</span>
            {isFriend && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                Báº¡n bĂ¨
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {viewerCount}
            </span>
            <span>Â·</span>
            <span>{formatDistanceToNow(new Date(startedAt), { addSuffix: true, locale: vi })}</span>
          </div>
        </div>

        <Button size="sm" variant="destructive" className="shrink-0 gap-1.5" onClick={(e) => { e.stopPropagation(); onWatch(); }}>
          <Radio className="w-3.5 h-3.5" />
          Xem
        </Button>
      </div>
    </Card>
  );
}

```

### FILE: src/integrations/supabase/client.ts
`$ext
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

### FILE: src/lib/agoraRtc.ts
`$ext
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

export type AgoraRtcRole = 'host' | 'audience' | 'publisher' | 'subscriber';

interface AgoraTokenResponse {
  appId: string;
  token: string;
  userAccount: string | number;
  expiresAt: number;
}

interface AgoraEdgeTokenResponse {
  token: string;
  app_id: string;
  uid: number;
  channel: string;
  expires_at: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureAgoraEdgePayload(payload: any): asserts payload is AgoraEdgeTokenResponse {
  if (!payload?.token || !payload?.app_id || payload?.uid === undefined) {
    throw new Error('Invalid Agora token response');
  }
}

export async function getAgoraRtcToken(
  channelName: string,
  _role: AgoraRtcRole
): Promise<AgoraTokenResponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('agora-token', {
      body: { channel_name: channelName },
    }),
    8000,
    'agora-token timeout'
  );
  if (error) throw error;
  const payload = data as AgoraEdgeTokenResponse;
  ensureAgoraEdgePayload(payload);
  return {
    appId: payload.app_id,
    token: payload.token,
    userAccount: payload.uid,
    expiresAt: payload.expires_at,
  };
}

export function createAgoraRtcClient(mode: 'rtc' | 'live' = 'rtc'): IAgoraRTCClient {
  return AgoraRTC.createClient({ mode, codec: 'vp8' });
}

export async function getAgoraRtcTokenFromEdge(channelName: string): Promise<{
  token: string;
  appId: string;
  uid: number;
}> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('agora-token', {
      body: { channel_name: channelName },
    }),
    8000,
    'agora-token timeout'
  );
  if (error) throw error;
  const payload = data as AgoraEdgeTokenResponse;
  ensureAgoraEdgePayload(payload);
  return {
    token: payload.token,
    appId: payload.app_id,
    uid: payload.uid,
  };
}

export async function getAgoraRtcTokenForLive(
  channelName: string,
  role: AgoraRtcRole = 'host'
): Promise<{ token: string; appId: string; userAccount: string | number }> {
  return getAgoraRtcToken(channelName, role);
}

export async function getLiveToken(
  sessionId: string,
  role: 'host' | 'audience'
): Promise<{ token: string; channel: string; uid: string; appId: string; expiresAt: number }> {
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('live-token', {
        body: { session_id: sessionId, role },
      }),
      8000,
      'live-token timeout'
    );
    if (error) throw error;

    const payload = data as {
      token?: string;
      channel?: string;
      uid?: string;
      appId?: string;
      expiresAt?: number;
    };

    if (!payload?.token || !payload?.channel || !payload?.uid || !payload?.appId) {
      throw new Error('Invalid live token response');
    }

    return {
      token: payload.token,
      channel: payload.channel,
      uid: payload.uid,
      appId: payload.appId,
      expiresAt: payload.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    };
  } catch (error) {
    console.warn('[live-token] fallback -> agora-token', error);

    const { data: liveSession, error: sessionError } = await withTimeout(
      supabase
        .from('live_sessions')
        .select('channel_name, agora_channel, status, host_user_id')
        .eq('id', sessionId)
        .maybeSingle() as unknown as Promise<{ data: any; error: any }>,
      5000,
      'live session lookup timeout'
    );

    if (sessionError || !liveSession) {
      throw sessionError || new Error('Live session not found');
    }
    if (liveSession.status !== 'live') {
      throw new Error('Live session has ended');
    }

    const channel = liveSession.agora_channel || liveSession.channel_name;
    if (!channel) {
      throw new Error('Live channel not found');
    }
    if (role === 'host') {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), 5000, 'auth session timeout');
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      if (liveSession.host_user_id !== session.user.id) {
        throw new Error('Only host can start this live');
      }
    }

    const fallback = await withTimeout(getAgoraRtcTokenFromEdge(channel), 8000, 'agora-token timeout');
    return {
      token: fallback.token,
      channel,
      uid: String(fallback.uid),
      appId: fallback.appId,
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
  }
}

export function secondsUntilExpiry(expiresAt?: number): number {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}

```

### FILE: src/utils/r2Upload.ts
`$ext
import { supabase } from '@/integrations/supabase/client';

export interface R2UploadResult {
  url: string;
  key: string;
}

export interface R2VideoUploadResult {
  publicUrl: string;
  key: string;
  contentType: string;
  size: number;
}

const ALLOWED_R2_KEY_BUCKETS = new Set(['avatars', 'covers', 'posts', 'videos', 'comment-media']);

function sanitizeKeySegment(input: string): string {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

export function extractR2KeyFromUrl(urlOrKey: string): string | null {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;

  const asKey = (candidate: string): string | null => {
    const clean = sanitizeKeySegment(candidate);
    const bucket = clean.split('/')[0];
    if (!bucket || !ALLOWED_R2_KEY_BUCKETS.has(bucket)) return null;
    return clean;
  };

  try {
    const u = new URL(urlOrKey);
    return asKey(u.pathname.replace(/^\/+/, ''));
  } catch {
    return asKey(urlOrKey);
  }
}

function getExtensionFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || 'bin';
  return ext.replace(/[^a-z0-9]/g, '') || 'bin';
}

async function getCurrentUserId(accessToken?: string): Promise<string> {
  // Prefer explicit token (when provided) so uploads work even if local session isn't hydrated.
  const { data: { user } } = await supabase.auth.getUser(accessToken);
  if (!user?.id) throw new Error('ChÆ°a Ä‘Äƒng nháº­p');
  return user.id;
}

function buildScopedKey(bucket: string, userId: string, customPath?: string): string {
  const cleanCustom = customPath ? sanitizeKeySegment(customPath) : '';

  // Allow passing only a filename or a nested path; always scope under `<bucket>/<userId>/...`.
  // If caller accidentally includes the userId prefix, strip it to avoid double nesting.
  const stripped =
    cleanCustom === userId
      ? ''
      : cleanCustom.startsWith(`${userId}/`)
        ? cleanCustom.slice(userId.length + 1)
        : cleanCustom.startsWith(`${userId}_`)
          ? cleanCustom.slice(userId.length + 1) // keep rest of filename after `${userId}_`
          : cleanCustom;

  if (stripped) return `${bucket}/${userId}/${stripped}`;
  return `${bucket}/${userId}`;
}

/**
 * Get presigned URL from edge function with timeout
 */
async function getPresignedUrl(
  key: string,
  contentType: string,
  fileSize: number,
  accessToken?: string,
  timeoutMs: number = 30000
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use provided token or get fresh one
    let token = accessToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('ChÆ°a Ä‘Äƒng nháº­p');
      }
      token = session.access_token;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/get-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ key, contentType, fileSize }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.uploadUrl || !data.publicUrl) {
      throw new Error('Invalid response from server');
    }

    return { uploadUrl: data.uploadUrl, publicUrl: data.publicUrl };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload file directly to R2 using presigned URL
 */
async function uploadWithPresignedUrl(
  file: File,
  uploadUrl: string,
  timeoutMs: number = 120000
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload video to R2 with progress tracking
 * Uses XHR for upload progress support
 */
export async function uploadVideoToR2(
  file: File,
  onProgress?: (progress: { bytesUploaded: number; bytesTotal: number; percentage: number }) => void,
  accessToken?: string
): Promise<R2VideoUploadResult> {
  const userId = await getCurrentUserId(accessToken);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = getExtensionFromName(file.name);
  const filename = `${timestamp}-${randomString}.${extension}`;
  const key = buildScopedKey('videos', userId, filename);
  const contentType = file.type || 'video/mp4';

  const { uploadUrl, publicUrl } = await getPresignedUrl(
    key,
    contentType,
    file.size,
    accessToken,
    45000
  );

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percentage = Math.round((event.loaded / event.total) * 100);
      onProgress({
        bytesUploaded: event.loaded,
        bytesTotal: event.total,
        percentage,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Upload failed - network error'));
    };

    xhr.send(file);
  });

  return {
    publicUrl,
    key,
    contentType,
    size: file.size,
  };
}

/**
 * Upload file directly to Cloudflare R2 via presigned URL
 * Much more efficient than base64 - supports large files
 * @param accessToken Optional access token to avoid multiple getSession calls
 */
export async function uploadToR2(
  file: File,
  bucket: 'posts' | 'avatars' | 'videos' | 'comment-media',
  customPath?: string,
  accessToken?: string
): Promise<R2UploadResult> {
  const userId = await getCurrentUserId(accessToken);
  // Generate unique filename
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = getExtensionFromName(file.name);
  const fallbackFilename = `${timestamp}-${randomString}.${extension}`;
  const filenameOrPath = customPath || fallbackFilename;
  const key = buildScopedKey(bucket, userId, filenameOrPath);

  // Step 1: Get presigned URL from edge function
  const { uploadUrl, publicUrl } = await getPresignedUrl(
    key,
    file.type,
    file.size,
    accessToken,
    45000 // 45s timeout for getting URL (increased)
  );

  // Step 2: Upload directly to R2 using presigned URL
  await uploadWithPresignedUrl(
    file,
    uploadUrl,
    180000 // 3 min timeout for upload (large files)
  );

  return {
    url: publicUrl,
    key: key,
  };
}

/**
 * Delete file from Cloudflare R2 via edge function
 */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('delete-from-r2', {
      body: { key },
    });

    if (error) throw error;
  } catch (error) {
    throw error;
  }
}

```

### FILE: src/components/layout/FacebookNavbar.tsx
`$ext
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { InlineSearch } from './InlineSearch';
import { NotificationDropdown } from './NotificationDropdown';
import { useLanguage } from '@/i18n/LanguageContext';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { TetModeToggle } from '@/components/tet';
import { useFollowingLiveStatus } from '@/modules/live/hooks/useFollowingLiveStatus';
import {
  Home,
  Users,
  MessageCircle,
  Menu,
  Wallet,
  LogOut,
  Globe,
  Settings,
  Radio,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FacebookLeftSidebar } from '@/components/feed/FacebookLeftSidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const FacebookNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const isMobileOrTablet = useIsMobileOrTablet();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Use AuthContext instead of manual auth management
  const { isAuthenticated, user, profile, signOut } = useAuth();
  const { count: liveCount, hasLive } = useFollowingLiveStatus();

  const isActive = (path: string) => location.pathname === path;

  // Language options with country flag images
  const languageOptions = [
    { code: 'vi' as const, name: 'Tiáº¿ng Viá»‡t', flagUrl: 'https://flagcdn.com/w40/vn.png' },
    { code: 'en' as const, name: 'English', flagUrl: 'https://flagcdn.com/w40/us.png' },
    { code: 'zh' as const, name: 'ä¸­æ–‡', flagUrl: 'https://flagcdn.com/w40/cn.png' },
    { code: 'ja' as const, name: 'æ—¥æœ¬èª', flagUrl: 'https://flagcdn.com/w40/jp.png' },
    { code: 'ko' as const, name: 'í•œêµ­́–´', flagUrl: 'https://flagcdn.com/w40/kr.png' },
    { code: 'th' as const, name: 'à¹„à¸—à¸¢', flagUrl: 'https://flagcdn.com/w40/th.png' },
    { code: 'id' as const, name: 'Indonesia', flagUrl: 'https://flagcdn.com/w40/id.png' },
    { code: 'fr' as const, name: 'FranĂ§ais', flagUrl: 'https://flagcdn.com/w40/fr.png' },
    { code: 'es' as const, name: 'EspaĂ±ol', flagUrl: 'https://flagcdn.com/w40/es.png' },
    { code: 'de' as const, name: 'Deutsch', flagUrl: 'https://flagcdn.com/w40/de.png' },
    { code: 'pt' as const, name: 'PortuguĂªs', flagUrl: 'https://flagcdn.com/w40/br.png' },
    { code: 'ru' as const, name: 'Đ ÑƒÑÑĐºĐ¸Đ¹', flagUrl: 'https://flagcdn.com/w40/ru.png' },
    { code: 'ar' as const, name: 'Ø§Ù„Ø¹Ø±Ø¨ÙØ©', flagUrl: 'https://flagcdn.com/w40/sa.png' },
  ];

  // Navigation items for center nav (Desktop only)
  const iconNavItems = [
    { icon: Home, path: '/', label: t('home') },
    { icon: Users, path: '/friends', label: t('friends') },
    { icon: MessageCircle, path: '/chat', label: 'Chat' },
    { icon: Wallet, path: '/wallet', label: 'Wallet' },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 fb-header h-12 md:h-14 safe-area-top">
      <div className="h-full max-w-screen-2xl mx-auto px-2 sm:px-4 flex items-center justify-between">
        {/* Left Section - Menu Button & Logo & Search */}
        <div className="flex items-center gap-2 flex-shrink-0 md:w-[280px]">
          {/* Menu Button - Left of Logo (Mobile/Tablet only) */}
          {isMobileOrTablet && (
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <button 
                  className="fun-icon-btn flex-shrink-0"
                  aria-label="Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-4 overflow-y-auto">
                <FacebookLeftSidebar onItemClick={() => setIsSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
          )}

          {/* Logo */}
          <img
            src="/fun-profile-logo-40.webp"
            alt="FUN Profile"
            width={36}
            height={36}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full cursor-pointer flex-shrink-0"
            onClick={() => navigate('/')}
            loading="eager"
          />
          <div className="hidden sm:block">
            <InlineSearch />
          </div>
        </div>

        {/* Center Section - Navigation (Desktop only, hidden on tablet) */}
        <nav className="hidden lg:flex items-center justify-center flex-1 max-w-[600px] h-full gap-1">
          <TooltipProvider delayDuration={200}>
            {iconNavItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(item.path)}
                    aria-label={item.label}
                    className={`flex-1 h-full max-w-[100px] flex items-center justify-center relative transition-all duration-300 rounded-full border-[0.5px] group ${
                      isActive(item.path)
                        ? 'text-primary-foreground bg-primary border-[#C9A84C]'
                        : 'text-foreground hover:text-primary hover:bg-primary/10 border-transparent hover:border-[#C9A84C]/50'
                    }`}
                  >
                    <item.icon className={`w-6 h-6 transition-all duration-300 ${
                      isActive(item.path) 
                        ? '' 
                        : 'group-hover:drop-shadow-[0_0_6px_hsl(142_76%_36%/0.5)]'
                    }`} />
                    {isActive(item.path) && (
                      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-gold to-primary rounded-t-full" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card text-card-foreground border border-border">
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}

            {/* Live button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/live')}
                  aria-label="Live"
                  className={`flex-1 h-full max-w-[100px] flex items-center justify-center relative transition-all duration-300 rounded-full border-[0.5px] group ${
                    isActive('/live')
                      ? 'text-primary-foreground bg-primary border-[#C9A84C]'
                      : 'text-foreground hover:text-destructive hover:bg-destructive/10 border-transparent hover:border-destructive/50'
                  }`}
                >
                  <div className="relative">
                    <Radio className={`w-6 h-6 transition-all duration-300 ${
                      isActive('/live') ? '' : 'group-hover:drop-shadow-[0_0_6px_hsl(0_84%_60%/0.6)]'
                    }`} />
                    {hasLive && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 animate-pulse">
                        {liveCount > 9 ? '9+' : liveCount}
                      </span>
                    )}
                  </div>
                  {isActive('/live') && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-gold to-primary rounded-t-full" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border border-border">
                <p>Live{hasLive ? ` (${liveCount} Ä‘ang live)` : ''}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 md:w-[280px] justify-end">
          {/* Search button for mobile */}
          <div className="sm:hidden">
            <InlineSearch />
          </div>

          {/* Mobile/Tablet: Wallet icon */}
          {isMobileOrTablet && (
            <button 
              className="fun-icon-btn-gold group" 
              aria-label="Wallet"
              onClick={() => navigate('/wallet')}
            >
              <Wallet className="w-5 h-5 text-gold drop-shadow-[0_0_6px_hsl(48_96%_53%/0.5)] group-hover:drop-shadow-[0_0_12px_hsl(48_96%_53%/0.8)] transition-all duration-300" />
            </button>
          )}

          {/* Notification for mobile/tablet */}
          {isMobileOrTablet && <NotificationDropdown />}

          {/* Desktop only: Notification Bell + Avatar with Dropdown */}
          {!isMobileOrTablet && isAuthenticated && (
            <div className="flex items-center gap-3">
              <NotificationDropdown />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex-shrink-0" aria-label="Profile Menu">
                    <Avatar className="w-9 h-9 border-2 border-gold/30 hover:border-gold transition-colors cursor-pointer">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {profile?.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-card border border-border shadow-lg z-50">
                  {/* Go to Profile - with user avatar and name */}
                  <DropdownMenuItem 
                    onClick={() => navigate(`/profile/${user?.id}`)}
                    className="cursor-pointer gap-3 p-3"
                  >
                    <Avatar className="w-10 h-10 border-2 border-gold/30">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {(profile?.username || user?.email)?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground">
                      {profile?.username || user?.email?.split('@')[0] || 'User'}
                    </span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  {/* Language Switcher - Collapsible */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-between w-full px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          <span>{t('language')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <img 
                            src={languageOptions.find(l => l.code === language)?.flagUrl} 
                            alt={language}
                            className="w-5 h-4 object-cover rounded-sm"
                          />
                          <span className="text-xs text-muted-foreground">{language.toUpperCase()}</span>
                        </div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="left" align="start" className="min-w-[200px]">
                      <div className="grid grid-cols-2 gap-1 p-2">
                        {languageOptions.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => setLanguage(lang.code)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                              language === lang.code
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-accent text-foreground'
                            }`}
                          >
                            <img 
                              src={lang.flagUrl} 
                              alt={lang.name}
                              className="w-5 h-4 object-cover rounded-sm"
                            />
                            <span>{lang.name}</span>
                          </button>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <DropdownMenuSeparator />
                  
                  {/* Tet Mode Toggle */}
                  <div className="px-2 py-2">
                    <TetModeToggle />
                  </div>
                  
                  <DropdownMenuSeparator />
                  
                  {/* Account Settings */}
                  <DropdownMenuItem 
                    onClick={() => navigate('/settings/account')}
                    className="cursor-pointer gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    <span>{t('accountSettings') || 'Account Settings'}</span>
                  </DropdownMenuItem>
                  
                  {/* Logout */}
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('signOut')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Sign In Button - Only show when not logged in */}
          {!isAuthenticated && (
            <Button
              onClick={() => navigate('/auth')}
              className="bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              {t('signIn')}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

```

### FILE: src/components/layout/MobileBottomNav.tsx
`$ext
import { useState, memo, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Home, Users, Award, Bell, Wallet, MessageCircle, Radio } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { FacebookLeftSidebar } from '@/components/feed/FacebookLeftSidebar';
import { FacebookRightSidebar } from '@/components/feed/FacebookRightSidebar';
import { MobileStats } from '@/components/profile/CoverHonorBoard';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useFollowingLiveStatus } from '@/modules/live/hooks/useFollowingLiveStatus';

export const MobileBottomNav = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams<{ userId: string }>();
  const { t } = useLanguage();
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [honorBoardOpen, setHonorBoardOpen] = useState(false);
  const { hasLive, count: liveCount } = useFollowingLiveStatus();

  // Detect if we're on a profile page
  const isProfilePage = location.pathname.startsWith('/profile');

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['current-user-nav'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Get the profile user ID (from URL params or current user)
  const profileUserId = userId || currentUser?.id;

  // Fetch profile data for honor board
  const { data: profileData } = useQuery({
    queryKey: ['profile-nav', profileUserId],
    queryFn: async () => {
      if (!profileUserId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', profileUserId)
        .single();
      return data;
    },
    enabled: !!profileUserId && isProfilePage,
    staleTime: 5 * 60 * 1000,
  });

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const navItems = [
    { icon: Home, label: t('feed'), path: '/', action: () => handleNavigate('/') },
    { icon: Users, label: t('friends'), path: '/friends', action: () => handleNavigate('/friends') },
    { icon: Award, label: t('honorBoard'), isCenter: true, action: () => setHonorBoardOpen(true) },
    { icon: MessageCircle, label: 'Chat', path: '/chat', action: () => handleNavigate('/chat') },
    {
      icon: Radio,
      label: 'Live',
      path: '/live',
      action: () => handleNavigate('/live'),
      badgeCount: hasLive ? liveCount : 0,
    },
  ];

  return (
    <>
      {/* Bottom Navigation Bar - Fixed with larger touch targets */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-transparent border-t border-border/30 safe-area-bottom">
        <div className="flex items-center justify-around h-[72px] px-1 max-w-lg mx-auto">
          {navItems.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all duration-300 touch-manipulation group border-[0.5px] ${
                item.isCenter
                  ? 'relative -mt-8 border-transparent'
                  : item.path && isActive(item.path)
                  ? 'text-white bg-primary border-[#C9A84C]'
                  : 'text-foreground hover:text-primary hover:bg-primary/10 border-transparent hover:border-[#C9A84C]/40 active:text-white active:bg-primary'
              }`}
            >
              {item.isCenter ? (
                /* Honor Board Center Button - Special Design */
                <div className="relative">
                  {/* Glow ring effect */}
                  <div className="absolute inset-0 w-16 h-16 rounded-full bg-gradient-to-br from-amber-400/40 to-yellow-500/40 blur-md animate-pulse" />
                  {/* Main button */}
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 shadow-lg shadow-amber-500/50 flex items-center justify-center border-4 border-background active:scale-95 transition-transform">
                    <item.icon className="w-7 h-7 text-white drop-shadow-md" strokeWidth={2.5} />
                  </div>
                  {/* Sparkle decorations */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-ping opacity-75" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-amber-200 rounded-full animate-pulse" />
                </div>
              ) : (
              <div className="relative flex flex-col items-center">
                  <div className="relative">
                    <item.icon className={`w-6 h-6 transition-all duration-300 ${
                      item.path && isActive(item.path) 
                        ? 'drop-shadow-[0_0_8px_hsl(48_96%_53%/0.6)]' 
                        : 'group-hover:drop-shadow-[0_0_6px_hsl(142_76%_36%/0.5)]'
                    }`} strokeWidth={1.8} />
                    {(item as any).badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 animate-pulse">
                        {(item as any).badgeCount > 9 ? '9+' : (item as any).badgeCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] mt-1 font-medium truncate max-w-[52px]">{item.label}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Left Sidebar Sheet (Menu) */}
      <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 bg-background overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="p-4 pt-8">
            <FacebookLeftSidebar onItemClick={() => setLeftSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Honor Board Bottom Drawer - Shows Profile Honor Board on Profile page, Top Ranking on Feed */}
      <Drawer open={honorBoardOpen} onOpenChange={setHonorBoardOpen}>
        <DrawerContent className="max-h-[85vh] bg-background/80 backdrop-blur-xl border-t-2 border-amber-500/30">
          <DrawerHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mt-2">
              <Award className="w-6 h-6 text-amber-500" />
              <DrawerTitle className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                {isProfilePage ? 'âœ¨ HONOR BOARD âœ¨' : t('honorBoard')}
              </DrawerTitle>
              <Award className="w-6 h-6 text-amber-500" />
            </div>
          </DrawerHeader>
          <div className="px-4 pb-8 overflow-y-auto max-h-[70vh]">
            {isProfilePage && profileUserId ? (
              // Profile Page: Show individual user's honor board stats
              <MobileStats 
                userId={profileUserId} 
                username={profileData?.username || ''} 
                avatarUrl={profileData?.avatar_url || undefined}
              />
            ) : (
              // Feed/Other Pages: Show top ranking leaderboard
              <FacebookRightSidebar />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';

```

### FILE: src/components/ui/avatar.tsx
`$ext
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { getAvatarUrl } from "@/lib/imageTransform";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

interface AvatarImageProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> {
  /** Size hint for optimization: 'sm' (40px), 'md' (128px), 'lg' (256px) */
  sizeHint?: 'sm' | 'md' | 'lg';
  /** Skip Cloudflare Image transformation */
  skipTransform?: boolean;
}

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  AvatarImageProps
>(({ className, src, sizeHint = 'md', skipTransform = false, ...props }, ref) => {
  // Transform URL via Cloudflare Image Resizing for optimization
  const optimizedSrc = React.useMemo(() => {
    if (!src || skipTransform) return src;
    return getAvatarUrl(src, sizeHint);
  }, [src, sizeHint, skipTransform]);

  return (
    <AvatarPrimitive.Image 
      ref={ref} 
      src={optimizedSrc}
      className={cn("aspect-square h-full w-full", className)} 
      {...props} 
    />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };

```

### FILE: src/components/ui/badge.tsx
`$ext
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

```

### FILE: src/components/ui/button.tsx
`$ext
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Royal Premium - Glossy Green vá»›i Metallic Gold Border
        default: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] font-semibold rounded-full border-[2px] border-[#DAA520] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.15),0_0_8px_rgba(218,165,32,0.4),0_2px_4px_rgba(0,0,0,0.2)] hover:from-[#1d8a4c] hover:via-[#188639] hover:to-[#0e5530] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_12px_rgba(218,165,32,0.5),0_3px_6px_rgba(0,0,0,0.25)] hover:scale-[1.02] duration-300",
        destructive: "bg-gradient-to-b from-[#dc2626] via-[#b91c1c] to-[#991b1b] text-white font-semibold rounded-full border-[2px] border-[#DAA520]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[#ef4444] hover:via-[#dc2626] hover:to-[#b91c1c] duration-300",
        outline: "bg-transparent text-[#DAA520] font-semibold rounded-full border-[2px] border-[#DAA520] shadow-[0_0_6px_rgba(218,165,32,0.3)] hover:bg-[#166534]/20 hover:text-[#FFD700] hover:shadow-[0_0_10px_rgba(218,165,32,0.5)] duration-300",
        secondary: "bg-gradient-to-b from-[#f8f6f0] to-[#f0ede4] text-[#166534] font-semibold rounded-full border-[2px] border-[#DAA520]/60 shadow-[0_0_4px_rgba(218,165,32,0.2)] hover:border-[#DAA520] hover:shadow-[0_0_8px_rgba(218,165,32,0.4)] duration-300",
        ghost: "text-[#DAA520] rounded-full hover:bg-[#166534]/15 hover:text-[#FFD700] border-[2px] border-transparent hover:border-[#DAA520]/40 duration-300",
        link: "text-[#DAA520] underline-offset-4 hover:underline hover:text-[#FFD700] rounded-full",
        premium: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#FFD700] font-bold rounded-full border-[2px] border-[#DAA520] shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.2),0_0_12px_rgba(255,215,0,0.5),0_3px_8px_rgba(0,0,0,0.3)] hover:from-[#1d8a4c] hover:via-[#188639] hover:to-[#0e5530] hover:shadow-[inset_0_2px_0_rgba(255,255,255,0.3),0_0_16px_rgba(255,215,0,0.6),0_4px_12px_rgba(0,0,0,0.35)] hover:scale-[1.03] duration-300",
        light: "bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] font-semibold rounded-full border-[1.5px] border-[#DAA520]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_6px_rgba(218,165,32,0.3)] hover:border-[#DAA520] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_10px_rgba(218,165,32,0.5)] duration-300",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-8",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

```

### FILE: src/components/ui/card.tsx
`$ext
import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

```

### FILE: src/components/ui/dialog.tsx
`$ext
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[150] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-[150] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

```

### FILE: src/components/ui/input.tsx
`$ext
import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

```

### FILE: src/components/ui/label.tsx
`$ext
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };

```

### FILE: src/components/ui/progress.tsx
`$ext
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

```

### FILE: src/components/ui/radio-group.tsx
`$ext
import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };

```

### FILE: src/components/ui/scroll-area.tsx
`$ext
import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };

```

### FILE: src/components/ui/skeleton.tsx
`$ext
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };

```

### FILE: src/modules/live/api/agora.ts
`$ext
import { supabase } from '@/integrations/supabase/client';

export type LiveRtcRole = 'host' | 'audience' | 'recorder';

export interface GetRtcTokenInput {
  sessionId?: string;
  channelName?: string;
  uid?: string | number;
  role: LiveRtcRole;
  expireSeconds?: number;
}

export interface RtcTokenResult {
  appId: string;
  token: string;
  uid: string | number;
  channel: string;
  expiresAt?: number;
}

export interface StartRecordingInput {
  sessionId: string;
  channelName: string;
  recorderUid: string | number;
  mode?: 'mix' | 'individual';
}

export interface StartRecordingResult {
  resourceId: string;
  sid: string;
}

export interface StopRecordingInput {
  sessionId: string;
  channelName: string;
  recorderUid: string | number;
  resourceId: string;
  sid: string;
}

export interface StopRecordingResult {
  status?: 'ready' | 'pending' | 'failed';
  uploadingStatus?: string | null;
  files?: unknown[];
  mediaKey?: string | null;
  mediaUrl?: string | null;
  message?: string;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  rawAgoraResponse?: Record<string, unknown>;
  serverResponse: {
    status?: 'ready' | 'pending' | 'failed';
    uploadingStatus?: string | null;
    files?: unknown[];
    mediaKey?: string | null;
    mediaUrl?: string | null;
    message?: string;
    durationSeconds?: number | null;
    thumbnailUrl?: string | null;
    rawAgoraResponse?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export async function getRtcToken(input: GetRtcTokenInput): Promise<RtcTokenResult> {
  const { data, error } = await supabase.functions.invoke('live-token', {
    body: {
      sessionId: input.sessionId,
      channelName: input.channelName,
      uid: input.uid,
      role: input.role,
      expireSeconds: input.expireSeconds,
    },
  });

  if (error) throw error;
  if (!data?.token || !data?.appId || !data?.channel) {
    throw new Error('Invalid live-token response');
  }

  return {
    appId: data.appId,
    token: data.token,
    uid: data.uid,
    channel: data.channel,
    expiresAt: data.expiresAt,
  };
}

export async function startRecording(input: StartRecordingInput): Promise<StartRecordingResult> {
  const { data, error } = await supabase.functions.invoke('live-recording-start', {
    body: {
      sessionId: input.sessionId,
      channelName: input.channelName,
      recorderUid: String(input.recorderUid),
      mode: input.mode || 'mix',
    },
  });

  if (error) throw error;
  if (!data?.resourceId || !data?.sid) {
    throw new Error('Invalid live-recording-start response');
  }

  return {
    resourceId: data.resourceId,
    sid: data.sid,
  };
}

export async function stopRecording(input: StopRecordingInput): Promise<StopRecordingResult> {
  const { data, error } = await supabase.functions.invoke('live-recording-stop', {
    body: {
      sessionId: input.sessionId,
      channelName: input.channelName,
      recorderUid: String(input.recorderUid),
      resourceId: input.resourceId,
      sid: input.sid,
    },
  });

  if (error) throw error;

  const serverResponse = (data?.serverResponse || data || {}) as StopRecordingResult['serverResponse'];
  return {
    status: typeof data?.status === 'string' ? data.status : serverResponse.status,
    uploadingStatus: typeof data?.uploadingStatus === 'string' ? data.uploadingStatus : serverResponse.uploadingStatus,
    files: Array.isArray(data?.files) ? data.files : serverResponse.files,
    mediaKey: typeof data?.mediaKey === 'string' ? data.mediaKey : serverResponse.mediaKey,
    mediaUrl: typeof data?.mediaUrl === 'string' ? data.mediaUrl : serverResponse.mediaUrl,
    message: typeof data?.message === 'string' ? data.message : serverResponse.message,
    durationSeconds: typeof data?.durationSeconds === 'number' ? data.durationSeconds : serverResponse.durationSeconds,
    thumbnailUrl: typeof data?.thumbnailUrl === 'string' ? data.thumbnailUrl : serverResponse.thumbnailUrl,
    rawAgoraResponse: (data?.rawAgoraResponse || serverResponse.rawAgoraResponse) as Record<string, unknown> | undefined,
    serverResponse,
  };
}

```

### FILE: src/modules/live/components/FloatingReactions.tsx
`$ext
import { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveReactions } from '../hooks/useLiveReactions';

const EMOJIS = ['â¤ï¸', 'đŸ˜‚', 'đŸ˜®', 'đŸ˜¢', 'đŸ‘', 'đŸ”¥'];

interface FloatingEmoji {
  id: string;
  emoji: string;
  left: number;
}

interface FloatingReactionsProps {
  sessionId: string;
  showPicker?: boolean;
}

export function FloatingReactions({ sessionId, showPicker = false }: FloatingReactionsProps) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const { reactions, sendReaction } = useLiveReactions(sessionId);

  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    const id = `${latest.id}-${latest.created_at}`;
    const left = 10 + Math.random() * 80;
    setFloatingEmojis((prev) => [...prev.slice(-40), { id, emoji: latest.emoji, left }]);
  }, [reactions]);

  useEffect(() => {
    if (floatingEmojis.length === 0) return;
    const timer = setTimeout(() => {
      setFloatingEmojis((prev) => prev.slice(1));
    }, 2500);
    return () => clearTimeout(timer);
  }, [floatingEmojis]);

  const handleSendReaction = useCallback(
    async (emoji: string) => {
      await sendReaction(emoji);
    },
    [sendReaction]
  );

  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {floatingEmojis.map((fe) => (
          <span
            key={fe.id}
            className="absolute text-2xl animate-float-up"
            style={{ left: `${fe.left}%`, bottom: '10%' }}
          >
            {fe.emoji}
          </span>
        ))}
      </div>

      {!showPicker && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute bottom-3 right-3 z-10 bg-background/30 hover:bg-background/50 text-destructive rounded-full h-10 w-10"
          onClick={() => handleSendReaction('â¤ï¸')}
        >
          <Heart className="h-5 w-5 fill-current" />
        </Button>
      )}

      {showPicker && (
        <div className="flex items-center gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="text-xl hover:scale-125 transition-transform p-1.5 rounded-full hover:bg-accent"
              onClick={() => handleSendReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}


```

### FILE: src/modules/live/components/LiveChatPanel.tsx
`$ext
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveMessages } from '../hooks/useLiveMessages';
import { supabase } from '@/integrations/supabase/client';

interface LiveChatPanelProps {
  sessionId: string;
  className?: string;
}

export function LiveChatPanel({ sessionId, className }: LiveChatPanelProps) {
  const { messages, sendMessage, isLoading } = useLiveMessages(sessionId);
  const [text, setText] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    await sendMessage(value);
    setText('');
  };

  return (
    <div className={className}>
      <div className="border rounded-xl bg-card h-full flex flex-col">
        <div className="px-3 py-2 border-b font-semibold text-sm">Live Chat</div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-3 py-3">
            {isLoading && <div className="text-xs text-muted-foreground">Loading chat...</div>}
            {!isLoading &&
              messages.map((msg) => (
                <div key={msg.id} className="flex gap-2">
                  <Avatar className="h-7 w-7 mt-0.5">
                    <AvatarImage src={msg.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-xs">
                      {msg.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{msg.profile?.username || 'User'}</div>
                    <div className="text-sm break-words">{msg.content}</div>
                  </div>
                </div>
              ))}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        {isAuthenticated ? (
          <div className="p-2 border-t flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Viáº¿t bĂ¬nh luáº­n..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <Button size="icon" variant="ghost" onClick={handleSend}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="p-3 border-t text-center text-xs text-muted-foreground">
            <span>ÄÄƒng nháº­p Ä‘á»ƒ bĂ¬nh luáº­n</span>
          </div>
        )}
      </div>
    </div>
  );
}

```

### FILE: src/modules/live/components/LiveChatReplay.tsx
`$ext
import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { username: string | null; avatar_url: string | null };
}

interface LiveChatReplayProps {
  sessionId: string;
}

export function LiveChatReplay({ sessionId }: LiveChatReplayProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (!active) return;
      if (error || !data || data.length === 0) {
        setIsLoading(false);
        setMessages([]);
        return;
      }

      // Fetch profiles
      const ids = [...new Set(data.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids);

      if (!active) return;
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      setMessages(
        data.map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profile: profileMap.get(row.user_id),
        }))
      );
      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!isLoading) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLoading, messages]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Live Chat Replay
        </span>
        {messages.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{messages.length} tin nháº¯n</span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2.5 p-3">
          {isLoading && (
            <div className="text-xs text-muted-foreground text-center py-4">Äang táº£i...</div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <span>KhĂ´ng cĂ³ tin nháº¯n trong buá»•i live nĂ y</span>
            </div>
          )}

          {!isLoading &&
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                  <AvatarImage src={msg.profile?.avatar_url || ''} />
                  <AvatarFallback className="text-[10px]">
                    {msg.profile?.username?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-foreground">
                    {msg.profile?.username || 'User'}
                  </span>
                  <span className="text-xs text-foreground/80 ml-1.5 break-words">{msg.content}</span>
                </div>
              </div>
            ))}

          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Footer note */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          Chat Ä‘Ă£ káº¿t thĂºc â€” chá»‰ xem láº¡i
        </p>
      </div>
    </div>
  );
}

```

### FILE: src/modules/live/components/LiveSessionCard.tsx
`$ext
import { useNavigate } from 'react-router-dom';
import { Video, Eye, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LiveSession } from '../types';

interface LiveSessionCardProps {
  session: LiveSession;
}

export function LiveSessionCard({ session }: LiveSessionCardProps) {
  const navigate = useNavigate();
  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'NgÆ°á»i dĂ¹ng';
  const avatar = session.host_profile?.avatar_url || '';
  const isLive = session.status === 'live';

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatar} alt={hostName} />
            <AvatarFallback>{hostName[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-semibold truncate">{hostName}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(session.started_at), { addSuffix: true, locale: vi })}
            </div>
          </div>
        </div>
        <Badge variant={isLive ? 'destructive' : 'secondary'} className="gap-1">
          <Radio className="h-3.5 w-3.5" />
          {isLive ? 'LIVE' : 'ÄĂƒ Káº¾T THĂC'}
        </Badge>
      </div>

      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Video className="h-4 w-4 text-red-500" />
          {session.title || 'PhĂ¡t trá»±c tiáº¿p trĂªn FUN Profile'}
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          {session.viewer_count || 0} ngÆ°á»i xem
        </div>
      </div>

      <div className="mt-3">
        <Button
          className="w-full"
          variant={isLive ? 'default' : 'outline'}
          onClick={() => navigate(`/live/${session.id}`)}
        >
          {isLive ? 'Xem' : 'Xem láº¡i tráº¡ng thĂ¡i'}
        </Button>
      </div>
    </div>
  );
}


```

### FILE: src/modules/live/components/LiveSharePanel.tsx
`$ext
import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface LiveSharePanelProps {
  sessionId: string;
}

export function LiveSharePanel({ sessionId }: LiveSharePanelProps) {
  const [copied, setCopied] = useState(false);
  const liveUrl = `${window.location.origin}/live/${sessionId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      toast.success('ÄĂ£ sao chĂ©p link!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('KhĂ´ng thá»ƒ sao chĂ©p');
    }
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(liveUrl)}`, '_blank');
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(liveUrl)}&text=Xem+LIVE+ngay!`, '_blank');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Share2 className="h-4 w-4" />
          Chia sáº»
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chia sáº» LIVE</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input value={liveUrl} readOnly className="text-sm" />
            <Button size="icon" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={shareToFacebook}>
              Facebook
            </Button>
            <Button variant="outline" className="flex-1" onClick={shareToTelegram}>
              Telegram
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/live/components/StartLiveDialog.tsx
`$ext
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface StartLiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartLiveDialog({ open, onOpenChange }: StartLiveDialogProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'realtime' | 'record'>('realtime');

  const handleStart = () => {
    onOpenChange(false);
    navigate(mode === 'realtime' ? '/live/new' : '/live/stream');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-destructive" />
            Báº¯t Ä‘áº§u LIVE
          </DialogTitle>
          <DialogDescription>Chá»n cháº¿ Ä‘á»™ Ä‘á»ƒ báº¯t Ä‘áº§u.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as 'realtime' | 'record')}
            className="grid grid-cols-2 gap-3"
          >
            <label
              htmlFor="mode-realtime"
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                mode === 'realtime'
                  ? 'border-destructive bg-destructive/5'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <RadioGroupItem value="realtime" id="mode-realtime" className="sr-only" />
              <Video className="h-6 w-6 text-destructive" />
              <span className="text-sm font-medium">PhĂ¡t trá»±c tiáº¿p</span>
              <span className="text-xs text-muted-foreground text-center">Agora RTC</span>
            </label>

            <label
              htmlFor="mode-record"
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                mode === 'record'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <RadioGroupItem value="record" id="mode-record" className="sr-only" />
              <Film className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Ghi & ÄÄƒng</span>
              <span className="text-xs text-muted-foreground text-center">Browser</span>
            </label>
          </RadioGroup>

          <Button onClick={handleStart} className="w-full">
            {mode === 'realtime' ? 'PhĂ¡t trá»±c tiáº¿p' : 'Báº¯t Ä‘áº§u ghi hĂ¬nh'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/live/hooks/useFollowingLiveStatus.ts
`$ext
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveFriend {
  sessionId: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  host: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

/**
 * Returns live sessions from friends/accepted connections of the current user.
 * Subscribes to realtime changes in live_sessions so the badge updates automatically.
 */
export function useFollowingLiveStatus() {
  const [liveFriends, setLiveFriends] = useState<LiveFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLiveFriends = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    // Get accepted friendships (both directions)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (!friendships || friendships.length === 0) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    // Collect friend IDs
    const friendIds = friendships.map((f) =>
      f.user_id === user.id ? f.friend_id : f.user_id
    );

    // Query active live sessions hosted by friends
    const { data: sessions } = await supabase
      .from('live_sessions')
      .select(
        `id, title, viewer_count, started_at,
         host_profile:profiles!live_sessions_host_user_id_fkey(id, username, avatar_url)`
      )
      .eq('status', 'live')
      .in('host_user_id', friendIds);

    if (!sessions) {
      setLiveFriends([]);
      setIsLoading(false);
      return;
    }

    const mapped: LiveFriend[] = sessions.map((s: any) => ({
      sessionId: s.id,
      title: s.title || 'PhĂ¡t trá»±c tiáº¿p',
      viewerCount: s.viewer_count || 0,
      startedAt: s.started_at,
      host: {
        id: s.host_profile?.id || '',
        username: s.host_profile?.username || 'User',
        avatar_url: s.host_profile?.avatar_url || null,
      },
    }));

    setLiveFriends(mapped);
    setIsLoading(false);
  };

  useEffect(() => {
    setIsLoading(true);
    fetchLiveFriends();

    // Subscribe to live_sessions changes â€” any status change triggers a refresh
    const channel = supabase
      .channel('following-live-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        () => {
          fetchLiveFriends();
        }
      )
      .subscribe();

    // Also listen to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchLiveFriends();
    });

    return () => {
      supabase.removeChannel(channel);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return {
    liveFriends,
    isLoading,
    count: liveFriends.length,
    hasLive: liveFriends.length > 0,
  };
}

```

### FILE: src/modules/live/hooks/useLiveComments.ts
`$ext
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveComment {
  id: string;
  live_session_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profile?: {
    username: string;
    avatar_url: string | null;
  };
}

export function useLiveComments(liveSessionId?: string) {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial comments
  useEffect(() => {
    if (!liveSessionId) return;

    const fetchComments = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_comments')
        .select('*')
        .eq('live_session_id', liveSessionId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (!error && data) {
        // Fetch profiles for all unique user_ids
        const userIds = [...new Set(data.map((d: any) => d.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, { username: p.username, avatar_url: p.avatar_url }])
        );
        setComments(
          data.map((d: any) => ({
            id: d.id,
            live_session_id: d.live_session_id,
            user_id: d.user_id,
            message: d.message,
            created_at: d.created_at,
            profile: profileMap.get(d.user_id),
          }))
        );
      }
      setIsLoading(false);
    };

    fetchComments();
  }, [liveSessionId]);

  // Realtime subscription
  useEffect(() => {
    if (!liveSessionId) return;

    const channel = supabase
      .channel(`live-comments-${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_comments',
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;
          // Fetch profile for this comment
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newRow.user_id)
            .single();

          const comment: LiveComment = {
            id: newRow.id,
            live_session_id: newRow.live_session_id,
            user_id: newRow.user_id,
            message: newRow.message,
            created_at: newRow.created_at,
            profile: profile ?? undefined,
          };

          setComments((prev) => [...prev, comment]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveSessionId]);

  const sendComment = useCallback(
    async (message: string) => {
      if (!liveSessionId || !message.trim()) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('live_comments').insert({
        live_session_id: liveSessionId,
        user_id: user.id,
        message: message.trim(),
      });
    },
    [liveSessionId]
  );

  return { comments, isLoading, sendComment };
}

```

### FILE: src/modules/live/hooks/useLiveMessages.ts
`$ext
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveMessage {
  id: number;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username: string | null;
    avatar_url: string | null;
  };
}

async function enrichProfiles(rows: Array<{ user_id: string }>) {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length === 0) return new Map<string, { username: string | null; avatar_url: string | null }>();

  const { data } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', ids);

  return new Map((data || []).map((p: any) => [p.id, { username: p.username, avatar_url: p.avatar_url }]));
}

export function useLiveMessages(sessionId?: string) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('live_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (!active) return;
      if (error || !data) {
        setMessages([]);
        setIsLoading(false);
        return;
      }

      const profileMap = await enrichProfiles(data as any[]);
      if (!active) return;

      setMessages(
        (data as any[]).map((row) => ({
          id: row.id,
          session_id: row.session_id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profile: profileMap.get(row.user_id),
        }))
      );
      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-messages:${sessionId}:${channelSuffix.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const row = payload.new as any;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', row.user_id)
            .maybeSingle();

          const newMsg: LiveMessage = {
            id: row.id,
            session_id: row.session_id,
            user_id: row.user_id,
            content: row.content,
            created_at: row.created_at,
            profile: profile ?? undefined,
          };

          setMessages((prev) => {
            // Skip if already exists (by real id)
            if (prev.some((m) => m.id === row.id)) return prev;
            // Replace optimistic message (negative id, same user + content)
            const withoutOptimistic = prev.filter(
              (m) => !(m.id < 0 && m.user_id === row.user_id && m.content === row.content)
            );
            return [...withoutOptimistic, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const value = content.trim();
      if (!sessionId || !value) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Optimistic update with negative id
      const optimisticMsg: LiveMessage = {
        id: -Date.now(),
        session_id: sessionId,
        user_id: user.id,
        content: value,
        created_at: new Date().toISOString(),
        profile: undefined,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { error } = await supabase.from('live_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        content: value,
      });
      if (error) {
        // Rollback optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        throw error;
      }
    },
    [sessionId]
  );

  return { messages, isLoading, sendMessage };
}

```

### FILE: src/modules/live/hooks/useLiveReactions.ts
`$ext
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveReaction {
  id: number;
  session_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const THROTTLE_MS = 300;

export function useLiveReactions(sessionId?: string) {
  const [reactions, setReactions] = useState<LiveReaction[]>([]);
  const lastSendAtRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-reactions:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_reactions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setReactions((prev) => [
            ...prev.slice(-120),
            {
              id: row.id,
              session_id: row.session_id,
              user_id: row.user_id,
              emoji: row.emoji,
              created_at: row.created_at,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sendReaction = useCallback(
    async (emoji: string) => {
      if (!sessionId) return false;
      const now = Date.now();
      if (now - lastSendAtRef.current < THROTTLE_MS) return false;
      lastSendAtRef.current = now;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.from('live_reactions').insert({
        session_id: sessionId,
        user_id: user.id,
        emoji,
      });
      if (error) throw error;
      return true;
    },
    [sessionId]
  );

  return { reactions, sendReaction };
}


```

### FILE: src/modules/live/hooks/useLiveRtc.ts
`$ext
import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { createAgoraRtcClient, secondsUntilExpiry } from '@/lib/agoraRtc';
import { getRtcToken } from '../api/agora';

type LiveRole = 'host' | 'audience';

interface UseLiveRtcOptions {
  sessionId?: string;
  role: LiveRole;
  enabled?: boolean;
  onViewerCountChange?: (count: number) => void;
  onRemoteOffline?: () => void;
}

const MAX_REJOIN_ATTEMPTS = 5;

function mapRtcError(error: unknown): string {
  const anyErr = error as any;
  const name = String(anyErr?.name || '');
  const msg = String(anyErr?.message || '');
  if (name === 'NotAllowedError') return 'Báº¡n chÆ°a cáº¥p quyá»n camera/micro.';
  if (name === 'NotFoundError') return 'KhĂ´ng tĂ¬m tháº¥y thiáº¿t bá»‹ camera/micro.';
  if (msg.toLowerCase().includes('network')) return 'Máº¡ng khĂ´ng á»•n Ä‘á»‹nh, Ä‘ang thá»­ káº¿t ná»‘i láº¡i...';
  if (msg.toLowerCase().includes('timeout')) return 'Káº¿t ná»‘i quĂ¡ cháº­m, vui lĂ²ng thá»­ láº¡i.';
  return msg || 'Káº¿t ná»‘i LIVE tháº¥t báº¡i.';
}

export function useLiveRtc({
  sessionId,
  role,
  enabled = true,
  onViewerCountChange,
  onRemoteOffline,
}: UseLiveRtcOptions) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const remoteAudioRef = useRef<any>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const rejoinAttemptsRef = useRef(0);
  const renewFailuresRef = useRef(0);
  const rejoinTimerRef = useRef<number | null>(null);
  const isLeavingRef = useRef(false);
  const startedRef = useRef(false);

  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const [localContainerMounted, setLocalContainerMounted] = useState(false);

  const setLocalContainerRef = useCallback((node: HTMLDivElement | null) => {
    localContainerRef.current = node;
    setLocalContainerMounted(!!node);
  }, []);
  const remoteContainerRef = useRef<HTMLDivElement | null>(null);

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');

  // Viewer count is now tracked via database, not Agora remoteUsers
  const emitViewerCount = useCallback((_client: IAgoraRTCClient) => {
    // no-op: viewer count managed by increment/decrement in LiveAudiencePage
  }, []);

  const clearRejoinTimer = () => {
    if (rejoinTimerRef.current) {
      window.clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
  };

  const playRemote = useCallback((user: IAgoraRTCRemoteUser) => {
    if (user.videoTrack && remoteContainerRef.current) {
      user.videoTrack.play(remoteContainerRef.current);
      setHasRemoteVideo(true);
    }
    if (user.audioTrack) {
      remoteAudioRef.current = user.audioTrack;
      user.audioTrack.play();
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!sessionId || !clientRef.current) return;
    const tokenData = await getRtcToken({ sessionId, role });
    tokenExpiresAtRef.current = tokenData.expiresAt;
    await clientRef.current.renewToken(tokenData.token);
    renewFailuresRef.current = 0;
  }, [role, sessionId]);

  const leave = useCallback(async () => {
    isLeavingRef.current = true;
    clearRejoinTimer();
    renewFailuresRef.current = 0;
    rejoinAttemptsRef.current = 0;

    localAudioRef.current?.close();
    localVideoRef.current?.close();
    localAudioRef.current = null;
    localVideoRef.current = null;
    remoteAudioRef.current?.stop?.();
    remoteAudioRef.current = null;
    setHasRemoteVideo(false);
    setIsJoined(false);
    startedRef.current = false;

    if (clientRef.current) {
      clientRef.current.removeAllListeners();
      await clientRef.current.leave();
      clientRef.current = null;
    }
  }, []);

  const rejoinWithBackoff = useCallback(async () => {
    if (!sessionId || !clientRef.current || isLeavingRef.current) return;
    if (rejoinAttemptsRef.current >= MAX_REJOIN_ATTEMPTS) {
      setStatusText('Káº¿t ná»‘i tháº¥t báº¡i, thá»­ táº£i láº¡i.');
      return;
    }

    rejoinAttemptsRef.current += 1;
    const attempt = rejoinAttemptsRef.current;
    const delay = Math.min(1000 * 2 ** (attempt - 1), 12000);
    clearRejoinTimer();

    rejoinTimerRef.current = window.setTimeout(async () => {
      try {
        const tokenData = await getRtcToken({ sessionId, role });
        tokenExpiresAtRef.current = tokenData.expiresAt;
        await clientRef.current?.leave();
        await clientRef.current?.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);

        if (role === 'host' && localAudioRef.current) {
          if (localVideoRef.current) {
            await clientRef.current?.publish([localAudioRef.current, localVideoRef.current]);
          } else {
            await clientRef.current?.publish(localAudioRef.current);
          }
          if (clientRef.current) emitViewerCount(clientRef.current);
        }

        rejoinAttemptsRef.current = 0;
        setStatusText(role === 'audience' ? 'Waiting for host...' : 'LIVE');
        setIsJoined(true);
      } catch (error) {
        setStatusText(mapRtcError(error));
        rejoinWithBackoff().catch(() => undefined);
      }
    }, delay);
  }, [emitViewerCount, role, sessionId]);

  const setupClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;

    const client = createAgoraRtcClient('live');
    clientRef.current = client;

    client.on('user-joined', () => {
      emitViewerCount(client);
    });

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      playRemote(user);
      emitViewerCount(client);
    });

    client.on('user-unpublished', () => {
      setHasRemoteVideo(false);
      if (role === 'audience') {
        setStatusText('Host táº¡m dá»«ng phĂ¡t...');
        onRemoteOffline?.();
      }
    });

    client.on('user-left', () => {
      emitViewerCount(client);
      if (role === 'audience') {
        setHasRemoteVideo(false);
        setStatusText('Host Ä‘Ă£ rá»i phiĂªn live');
        onRemoteOffline?.();
      }
    });

    client.on('connection-state-change', (curState, _prevState, reason) => {
      if (curState === 'DISCONNECTED' && reason !== 'LEAVE' && !isLeavingRef.current) {
        setStatusText('Máº¡ng khĂ´ng á»•n Ä‘á»‹nh, Ä‘ang thá»­ káº¿t ná»‘i láº¡i...');
        rejoinWithBackoff().catch(() => undefined);
      }
    });

    client.on('token-privilege-will-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        if (renewFailuresRef.current >= 2) {
          setStatusText('Äang cáº¥p láº¡i token...');
          rejoinWithBackoff().catch(() => undefined);
        }
      });
    });

    client.on('token-privilege-did-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        setStatusText('Token háº¿t háº¡n, Ä‘ang káº¿t ná»‘i láº¡i...');
        rejoinWithBackoff().catch(() => undefined);
      });
    });

    return client;
  }, [emitViewerCount, onRemoteOffline, playRemote, refreshToken, rejoinWithBackoff, role]);

  const start = useCallback(async () => {
    if (!sessionId || !enabled) return;
    if (startedRef.current) return;
    startedRef.current = true;
    isLeavingRef.current = false;
    setStatusText('Connecting...');

    try {
      const tokenData = await getRtcToken({ sessionId, role });
      tokenExpiresAtRef.current = tokenData.expiresAt;
      const client = setupClient();
      await client.setClientRole(role);
      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);
      emitViewerCount(client);

      if (role === 'host') {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        if (localContainerRef.current) {
          videoTrack.play(localContainerRef.current);
        }
        await client.publish([audioTrack, videoTrack]);
        setStatusText('LIVE');
      } else {
        setStatusText('Waiting for host...');
        for (const user of client.remoteUsers) {
          if (user.hasVideo) await client.subscribe(user, 'video');
          if (user.hasAudio) await client.subscribe(user, 'audio');
          playRemote(user);
        }
      }

      setIsJoined(true);
      rejoinAttemptsRef.current = 0;
      renewFailuresRef.current = 0;
    } catch (error) {
      startedRef.current = false;
      setStatusText(mapRtcError(error));
      throw error;
    }
  }, [emitViewerCount, enabled, playRemote, role, sessionId, setupClient]);

  const toggleMute = useCallback(async () => {
    if (!localAudioRef.current) return;
    const next = !isMuted;
    await localAudioRef.current.setEnabled(!next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    if (!localVideoRef.current) return;
    const next = !isCameraOff;
    await localVideoRef.current.setEnabled(!next);
    setIsCameraOff(next);
  }, [isCameraOff]);

  const toggleRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    if (isMuted) {
      remoteAudioRef.current.play();
      setIsMuted(false);
    } else {
      remoteAudioRef.current.stop();
      setIsMuted(true);
    }
  }, [isMuted]);

  useEffect(() => {
    if (!tokenExpiresAtRef.current || !isJoined) return;
    const secondsLeft = secondsUntilExpiry(tokenExpiresAtRef.current);
    if (secondsLeft > 90) return;
    refreshToken().catch(() => {
      rejoinWithBackoff().catch(() => undefined);
    });
  }, [isJoined, refreshToken, rejoinWithBackoff]);

  useEffect(() => {
    if (localContainerMounted && localVideoRef.current && localContainerRef.current) {
      localVideoRef.current.play(localContainerRef.current);
    }
  }, [localContainerMounted]);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

  const getLocalTracks = useCallback(() => ({
    audio: localAudioRef.current,
    video: localVideoRef.current,
  }), []);

  return {
    setLocalContainerRef,
    remoteContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    hasRemoteVideo,
    statusText,
    start,
    leave,
    toggleMute,
    toggleCamera,
    toggleRemoteAudio,
    getLocalTracks,
  };
}

```

### FILE: src/modules/live/index.ts
`$ext
export { default as LiveStudioPage } from './pages/LiveStudio';
export { default as LiveViewerPage } from './pages/LiveViewer';
export { default as LiveStreamPage } from './pages/LiveStream';
export { default as LiveHostPage } from './pages/LiveHostPage';
export { default as LiveAudiencePage } from './pages/LiveAudiencePage';
export { default as HostLive } from './pages/HostLive';
export { default as AudienceLive } from './pages/AudienceLive';
export { useLiveSession, useActiveLiveSessions } from './useLiveSession';
export { useLiveRtc } from './hooks/useLiveRtc';
export { useLiveMessages } from './hooks/useLiveMessages';
export { useLiveReactions } from './hooks/useLiveReactions';
export { getRtcToken, startRecording, stopRecording } from './api/agora';
export {
  createLiveSession,
  endLiveSession,
  uploadLiveThumbnail,
} from './liveService';
export { StartLiveDialog } from './components/StartLiveDialog';
export { LiveSessionCard } from './components/LiveSessionCard';
export { FloatingReactions } from './components/FloatingReactions';
export { LiveChatPanel } from './components/LiveChatPanel';
export { LiveSharePanel } from './components/LiveSharePanel';
export { useLiveComments } from './hooks/useLiveComments';
export type { LiveSession, LivePrivacy, LiveStatus } from './types';

```

### FILE: src/modules/live/liveService.ts
`$ext
import { supabase } from '@/integrations/supabase/client';
import type { CreateLiveSessionInput, LiveSession } from './types';

const db = supabase as any;

const LIVE_POST_DEFAULT_CONTENT = 'Dang LIVE tren FUN Profile';
const WORKER_URL = import.meta.env.VITE_AGORA_WORKER_URL || 'https://fun-agora-rtc-token.hieu-le-010.workers.dev';

const buildChannelName = (userId: string) => `live_${userId}_${Date.now()}`;

const uuidToNumericUid = (uuid: string) => {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
};

interface UploadLiveRecordingResult {
  key: string;
  url: string;
}

export type RecordingStatus =
  | 'idle'
  | 'acquiring'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface FinalizeLiveSessionOptions {
  playbackUrl?: string | null;
  recordingStatus?: RecordingStatus;
}

type LivePostMetadata = {
  live_title?: string | null;
  live_status?: 'live' | 'ended';
  channel_name?: string | null;
  agora_channel?: string | null;
  live_session_id?: string | null;
  viewer_count?: number;
  ended_at?: string | null;
  playback_url?: string | null;
  [key: string]: unknown;
};

function ensureWorkerUrl(): string {
  if (!WORKER_URL) {
    throw new Error('VITE_AGORA_WORKER_URL is missing');
  }
  return WORKER_URL.replace(/\/+$/, '');
}

async function mergeLivePostMetadata(postId: string, patch: Partial<LivePostMetadata>): Promise<void> {
  const { data: existingPost } = await db
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();

  const existing = (existingPost?.metadata || {}) as LivePostMetadata;

  await db
    .from('posts')
    .update({
      metadata: {
        ...existing,
        ...patch,
      },
    })
    .eq('id', postId);
}

function normalizeLiveSession(row: any): LiveSession {
  return {
    id: row.id,
    host_user_id: row.host_user_id || row.owner_id,
    agora_channel: row.agora_channel || row.channel_name,
    channel_name: row.channel_name,
    agora_uid_host: row.agora_uid_host ?? null,
    recording_uid: row.recording_uid ?? null,
    recording_status: row.recording_status ?? null,
    title: row.title ?? null,
    privacy: row.privacy,
    status: row.status,
    viewer_count: row.viewer_count ?? 0,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_id: row.post_id ?? null,
    host_profile: row.host_profile
      ? {
          username: row.host_profile.username ?? null,
          full_name: row.host_profile.full_name ?? null,
          avatar_url: row.host_profile.avatar_url ?? null,
        }
      : null,
  };
}

export async function uploadLiveThumbnail(
  thumbnailBlob: Blob,
  liveSessionId: string
): Promise<string | null> {
  try {
    const path = `live/${liveSessionId}/thumbnail.jpg`;
    const { error } = await supabase.storage
      .from('live-thumbnails')
      .upload(path, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      console.warn('[liveService] uploadLiveThumbnail error:', error);
      return null;
    }
    const { data } = supabase.storage.from('live-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn('[liveService] uploadLiveThumbnail exception:', err);
    return null;
  }
}

export async function attachLiveReplayToPost(
  sessionId: string,
  playbackUrl: string,
  durationSeconds?: number,
  thumbnailUrl?: string | null
): Promise<void> {
  const { error } = await db.rpc('attach_live_replay_to_post', {
    _session_id: sessionId,
    _playback_url: playbackUrl,
    _duration_seconds: durationSeconds,
    _thumbnail_url: thumbnailUrl,
  });
  if (error) throw error;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<LiveSession> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error('Ban can dang nhap de bat dau live');
  }

  const userId = session.user.id;
  const hostUid = uuidToNumericUid(userId);
  const title = input.title?.trim() || '';
  const channelName = buildChannelName(userId);
  const visibility = input.privacy === 'friends' ? 'friends' : 'public';

  let postId: string | null = null;

  try {
    const { data: post, error: postError } = await db
      .from('posts')
      .insert({
        user_id: userId,
        content: title || LIVE_POST_DEFAULT_CONTENT,
        visibility,
        post_type: 'live',
        metadata: {
          live_title: title,
          live_status: 'live',
          channel_name: channelName,
          agora_channel: channelName,
          viewer_count: 0,
        },
      })
      .select('id')
      .single();

    if (postError) throw postError;
    postId = post.id;

    const { data, error } = await db
      .from('live_sessions')
      .insert({
        host_user_id: userId,
        owner_id: userId,
        channel_name: channelName,
        agora_channel: channelName,
        agora_uid_host: hostUid,
        title,
        privacy: input.privacy,
        status: 'live',
        recording_status: 'idle',
        post_id: postId,
      })
      .select(
        `
        id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
        started_at, ended_at, created_at, updated_at, post_id,
        host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
      `
      )
      .single();

    if (error) throw error;

    await db
      .from('posts')
      .update({
        metadata: {
          live_title: title,
          live_status: 'live',
          channel_name: channelName,
          agora_channel: channelName,
          live_session_id: data.id,
          viewer_count: 0,
        },
      })
      .eq('id', postId);

    return normalizeLiveSession(data);
  } catch (error) {
    if (postId) {
      await db.from('posts').delete().eq('id', postId);
    }
    throw error;
  }
}

export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const { data, error } = await db
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, recording_uid, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeLiveSession(data);
}

export async function listActiveLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await db
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('status', 'live')
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeLiveSession);
}

export async function endLiveSession(sessionId: string): Promise<void> {
  await finalizeLiveSession(sessionId, { recordingStatus: 'failed' });
}

export async function finalizeLiveSession(
  sessionId: string,
  options: FinalizeLiveSessionOptions = {}
): Promise<void> {
  const { playbackUrl = null, recordingStatus = playbackUrl ? 'ready' : 'failed' } = options;
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from('live_sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      recording_status: recordingStatus,
      updated_at: nowIso,
    })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name, ended_at')
    .single();

  if (error) throw error;

  if (data?.post_id) {
    await mergeLivePostMetadata(data.post_id, {
      live_session_id: data.id,
      live_title: data.title,
      channel_name: data.agora_channel || data.channel_name,
      agora_channel: data.agora_channel || data.channel_name,
      live_status: 'ended',
      ended_at: data.ended_at,
      playback_url: playbackUrl,
    });

    if (playbackUrl) {
      await db.from('posts')
        .update({ video_url: playbackUrl })
        .eq('id', data.post_id);
    }
  }
}

export async function updateLiveViewerCount(sessionId: string, viewerCount: number): Promise<void> {
  const nextCount = Math.max(0, viewerCount);
  const { data } = await db
    .from('live_sessions')
    .update({ viewer_count: nextCount })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name')
    .maybeSingle();

  if (data?.post_id) {
    await db
      .from('posts')
      .update({
        metadata: {
          live_title: data.title,
          channel_name: data.agora_channel || data.channel_name,
          agora_channel: data.agora_channel || data.channel_name,
          live_status: 'live',
          viewer_count: nextCount,
          live_session_id: data.id,
        },
      })
      .eq('id', data.post_id);
  }
}

export async function incrementLiveViewerCount(sessionId: string): Promise<void> {
  await db.rpc('increment_live_viewer_count', { session_id: sessionId });
}

export async function decrementLiveViewerCount(sessionId: string): Promise<void> {
  await db.rpc('decrement_live_viewer_count', { session_id: sessionId });
}

export async function uploadLiveRecording(
  blob: Blob,
  liveSessionId: string,
  mimeType: string,
  onProgress?: (percent: number) => void
): Promise<UploadLiveRecordingResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const workerUrl = ensureWorkerUrl();

  const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
  const filename = `live-${liveSessionId}-${Date.now()}.${extension}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${workerUrl}/upload/live-recording`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('X-Stream-Id', liveSessionId);
    xhr.setRequestHeader('X-Filename', filename);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && payload?.url && payload?.key) {
          resolve({ key: payload.key, url: payload.url });
        } else {
          reject(new Error(payload?.error || 'Failed to upload recording'));
        }
      } catch {
        reject(new Error('Failed to parse upload response'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(blob);
  });
}

export async function saveLiveReplay(liveSessionId: string, playbackUrl?: string | null): Promise<void> {
  await finalizeLiveSession(liveSessionId, {
    playbackUrl: playbackUrl || null,
    recordingStatus: playbackUrl ? 'ready' : 'failed',
  });
}

```

### FILE: src/modules/live/pages/AudienceLive.tsx
`$ext
export { default } from './LiveAudiencePage';

```

### FILE: src/modules/live/pages/HostLive.tsx
`$ext
export { default } from './LiveHostPage';

```

### FILE: src/modules/live/pages/LiveAudiencePage.tsx
`$ext
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Loader2, Radio, Volume2, VolumeX } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLiveSession } from '../useLiveSession';
import { useLiveRtc } from '../hooks/useLiveRtc';
import { incrementLiveViewerCount, decrementLiveViewerCount } from '../liveService';
import { LiveChatPanel } from '../components/LiveChatPanel';
import { FloatingReactions } from '../components/FloatingReactions';

export default function LiveAudiencePage() {
  const navigate = useNavigate();
  const { liveSessionId } = useParams<{ liveSessionId: string }>();
  const { data: session, isLoading } = useLiveSession(liveSessionId);
  const [mobileTab, setMobileTab] = useState<'chat' | 'reactions'>('chat');

  const {
    remoteContainerRef,
    statusText,
    hasRemoteVideo,
    isMuted,
    start,
    leave,
    toggleRemoteAudio,
  } = useLiveRtc({
    sessionId: liveSessionId,
    role: 'audience',
    enabled: !!liveSessionId && session?.status === 'live',
  });

  useEffect(() => {
    if (!liveSessionId || !session || session.status !== 'live') return;
    start().catch(() => undefined);
  }, [liveSessionId, session, start]);

  // Track viewer count via database
  useEffect(() => {
    if (!liveSessionId || session?.status !== 'live') return;

    incrementLiveViewerCount(liveSessionId).catch(console.warn);

    const handleBeforeUnload = () => {
      decrementLiveViewerCount(liveSessionId).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      decrementLiveViewerCount(liveSessionId).catch(() => {});
    };
  }, [liveSessionId, session?.status]);

  useEffect(() => {
    if (session?.status === 'ended') {
      leave().catch(() => undefined);
    }
  }, [leave, session?.status]);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">Live session not found.</Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={session.host_profile?.avatar_url || ''} />
                  <AvatarFallback>
                    {session.host_profile?.username?.charAt(0)?.toUpperCase() || 'H'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-sm">{session.host_profile?.full_name || session.host_profile?.username || 'Host'}</div>
                  <h1 className="text-lg md:text-xl font-bold">{session.title || 'Live Stream'}</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === 'live' ? 'destructive' : 'secondary'} className="gap-1">
                  <Radio className="h-3.5 w-3.5" />
                  {session.status === 'live' ? 'LIVE' : 'ENDED'}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {session.viewer_count || 0}
                </Badge>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="aspect-video bg-black relative">
                <div ref={remoteContainerRef} className="h-full w-full" />
                {!hasRemoteVideo && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50 text-center px-4">
                    {session.status === 'ended' ? 'This live has ended.' : statusText}
                  </div>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute bottom-3 left-3 z-10 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
                  onClick={toggleRemoteAudio}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>

                {liveSessionId && <FloatingReactions sessionId={liveSessionId} />}
              </div>
            </Card>

            <div className="lg:hidden border rounded-xl bg-card overflow-hidden">
              <div className="grid grid-cols-2 border-b">
                <button
                  className={`py-2 text-sm font-medium ${mobileTab === 'chat' ? 'bg-accent' : ''}`}
                  onClick={() => setMobileTab('chat')}
                >
                  Chat
                </button>
                <button
                  className={`py-2 text-sm font-medium ${mobileTab === 'reactions' ? 'bg-accent' : ''}`}
                  onClick={() => setMobileTab('reactions')}
                >
                  Reactions
                </button>
              </div>
              <div className="p-2">
                {mobileTab === 'chat' && liveSessionId && <LiveChatPanel sessionId={liveSessionId} className="h-[320px]" />}
                {mobileTab === 'reactions' && liveSessionId && (
                  <div className="h-[120px] flex items-center justify-center relative">
                    <FloatingReactions sessionId={liveSessionId} showPicker />
                  </div>
                )}
              </div>
            </div>
          </section>

          {liveSessionId && <LiveChatPanel sessionId={liveSessionId} className="hidden lg:flex h-[calc(100vh-120px)]" />}
        </div>
        <div className="max-w-7xl mx-auto mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Back
          </Button>
        </div>
      </main>
    </div>
  );
}

```

### FILE: src/modules/live/pages/LiveHostPage.tsx
`$ext
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Home, Loader2, Mic, MicOff, PhoneOff, Radio, RefreshCw, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { supabase } from '@/integrations/supabase/client';
import {
  createLiveSession,
  finalizeLiveSession,
  updateLiveViewerCount,
  uploadLiveRecording,
  uploadLiveThumbnail,
  attachLiveReplayToPost,
  type RecordingStatus,
} from '../liveService';
import { createRecorder, type RecorderController } from '../recording/clientRecorder';
import { useLiveSession } from '../useLiveSession';
import { useLiveRtc } from '../hooks/useLiveRtc';
import { LiveChatPanel } from '../components/LiveChatPanel';
import { FloatingReactions } from '../components/FloatingReactions';

type BootState = 'idle' | 'auth' | 'creating' | 'loading' | 'starting' | 'ready' | 'error';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toUserError(error: unknown): string {
  const anyErr = error as any;
  const message = String(anyErr?.message || '');
  const name = String(anyErr?.name || '');
  if (name === 'NotAllowedError') return 'Ban chua cap quyen camera/micro.';
  if (name === 'NotFoundError') return 'Khong tim thay thiet bi camera/micro.';
  if (message.toLowerCase().includes('timeout')) return 'Ket noi qua cham, vui long thu lai.';
  return message || 'Khong the bat dau phat truc tiep.';
}

const REC_BADGE: Record<RecordingStatus, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  idle: { label: 'âº Sáºµn sĂ ng', variant: 'secondary' },
  acquiring: { label: 'â³ Äang chuáº©n bá»‹...', variant: 'secondary' },
  starting: { label: 'â³ Äang báº¯t Ä‘áº§u...', variant: 'secondary' },
  recording: { label: 'âº Äang ghi', variant: 'destructive' },
  stopping: { label: 'â³ Äang dá»«ng...', variant: 'secondary' },
  processing: { label: 'â³ Äang xá»­ lĂ½...', variant: 'secondary' },
  ready: { label: 'âœ“ ÄĂ£ lÆ°u', variant: 'default' },
  failed: { label: 'âœ— Lá»—i ghi hĂ¬nh', variant: 'outline' },
  stopped: { label: 'â–  ÄĂ£ dá»«ng', variant: 'secondary' },
};

export default function LiveHostPage() {
  const navigate = useNavigate();
  const { liveSessionId } = useParams<{ liveSessionId: string }>();

  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootState, setBootState] = useState<BootState>('idle');
  const [bootError, setBootError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [recordingState, setRecordingState] = useState<RecordingStatus>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const startedRef = useRef(false);
  const browserRecorderRef = useRef<RecorderController | null>(null);
  const lastSentViewerCountRef = useRef<number | null>(null);
  const viewerCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveSessionId = liveSessionId || createdSessionId || undefined;
  const sessionQuery = useLiveSession(effectiveSessionId);
  const session = sessionQuery.data;

  const {
    setLocalContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    statusText,
    start,
    leave,
    toggleMute,
    toggleCamera,
    getLocalTracks,
  } = useLiveRtc({
    sessionId: effectiveSessionId,
    role: 'host',
    enabled: !!effectiveSessionId && session?.status !== 'ended',
    onViewerCountChange: async (count) => {
      if (!effectiveSessionId) return;
      if (lastSentViewerCountRef.current === count) return;
      if (viewerCountTimerRef.current) {
        clearTimeout(viewerCountTimerRef.current);
      }
      viewerCountTimerRef.current = setTimeout(async () => {
        if (!effectiveSessionId) return;
        if (lastSentViewerCountRef.current === count) return;
        lastSentViewerCountRef.current = count;
        await updateLiveViewerCount(effectiveSessionId, count);
      }, 400);
    },
  });

  const isHost = useMemo(() => !!session && !!userId && session.host_user_id === userId, [session, userId]);

  const runBootstrap = useCallback(async () => {
    setBootError(null);
    setBootState('auth');
    setCreatedSessionId(null);

    const authResult = await withTimeout(supabase.auth.getSession(), 8000, 'auth timeout');
    const currentUserId = authResult.data.session?.user?.id;
    if (!currentUserId) {
      throw new Error('Ban can dang nhap de phat truc tiep.');
    }
    setUserId(currentUserId);

    if (liveSessionId) {
      setBootState('loading');
      return;
    }

    setBootState('creating');
    const created = await withTimeout(
      createLiveSession({ privacy: 'public' }),
      15000,
      'create live session timeout'
    );
    setCreatedSessionId(created.id);
    setBootState('loading');
    navigate(`/live/${created.id}/host`, { replace: true });
  }, [liveSessionId, navigate]);

  useEffect(() => {
    let active = true;
    runBootstrap().catch((error) => {
      if (!active) return;
      setBootState('error');
      setBootError(toUserError(error));
    });

    return () => {
      active = false;
    };
  }, [retryNonce, runBootstrap]);

  useEffect(() => {
    if (typeof session?.viewer_count === 'number') {
      lastSentViewerCountRef.current = session.viewer_count;
    }
  }, [session?.viewer_count]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    if (sessionQuery.isLoading) return;
    if (sessionQuery.isError) {
      setBootState('error');
      setBootError('Khong tai duoc phien LIVE. Vui long thu lai.');
      return;
    }
    if (!session) {
      setBootState('error');
      setBootError('Khong tim thay phien LIVE.');
      return;
    }
    if (bootState !== 'starting') {
      setBootState('ready');
    }
  }, [bootState, effectiveSessionId, session, sessionQuery.isError, sessionQuery.isLoading]);

  // Start Agora RTC + Browser Recording
  useEffect(() => {
    if (!session || !isHost || session.status === 'ended' || startedRef.current) return;
    startedRef.current = true;
    setBootState('starting');

    start()
      .then(() => {
        setBootState('ready');

        // Start browser recording immediately after joining
        try {
          const tracks = getLocalTracks();
          if (tracks.video && tracks.audio) {
            const stream = new MediaStream();
            const videoTrack = tracks.video.getMediaStreamTrack();
            const audioTrack = tracks.audio.getMediaStreamTrack();
            if (videoTrack) stream.addTrack(videoTrack);
            if (audioTrack) stream.addTrack(audioTrack);
            const recorder = createRecorder(stream);
            recorder.start();
            browserRecorderRef.current = recorder;
            setRecordingState('recording');
            setRecordingError(null);
          } else {
            setRecordingState('failed');
            setRecordingError('KhĂ´ng láº¥y Ä‘Æ°á»£c track video/audio Ä‘á»ƒ ghi hĂ¬nh.');
          }
        } catch (recErr: any) {
          setRecordingState('failed');
          setRecordingError(recErr?.message || 'KhĂ´ng thá»ƒ báº¯t Ä‘áº§u ghi hĂ¬nh.');
          toast.error('KhĂ´ng thá»ƒ báº¯t Ä‘áº§u ghi hĂ¬nh báº±ng trĂ¬nh duyá»‡t.');
        }
      })
      .catch((error) => {
        startedRef.current = false;
        const message = toUserError(error);
        setBootState('error');
        setBootError(message);
        toast.error(message);
      });
  }, [effectiveSessionId, isHost, session, start, getLocalTracks]);

  useEffect(() => {
    if (session?.status === 'ended') {
      leave().catch(() => undefined);
    }
  }, [leave, session?.status]);

  useEffect(() => {
    return () => {
      if (viewerCountTimerRef.current) {
        clearTimeout(viewerCountTimerRef.current);
      }
      leave().catch(() => undefined);
    };
  }, [leave]);

async function generateThumbnailFromBlob(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    let settled = false;

    const finish = (result: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 10000);

    video.onloadeddata = () => {
      video.currentTime = Math.min(video.duration * 0.1, 2);
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob((thumbBlob) => finish(thumbBlob), 'image/jpeg', 0.85);
      } catch {
        finish(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
  });
}

const handleEndLive = async () => {
    if (!effectiveSessionId) return;
    if (viewerCountTimerRef.current) {
      clearTimeout(viewerCountTimerRef.current);
      viewerCountTimerRef.current = null;
    }

    let playbackUrl: string | null = null;
    let recordingStatus: RecordingStatus = 'failed';
    let thumbnailUrl: string | null = null;

    try {
      if (browserRecorderRef.current?.getState() === 'recording') {
        setRecordingState('stopping');
        const blob = await browserRecorderRef.current.stop();
        if (blob.size > 0) {
          setRecordingState('processing');
          setUploadProgress(0);

          // 1. Generate thumbnail from video blob (silent fail)
          try {
            const thumbBlob = await generateThumbnailFromBlob(blob);
            if (thumbBlob) {
              thumbnailUrl = await uploadLiveThumbnail(thumbBlob, effectiveSessionId);
            }
          } catch {
            // thumbnail failure won't block video upload
          }

          // 2. Upload video to R2 with progress tracking
          const { url } = await uploadLiveRecording(
            blob,
            effectiveSessionId,
            browserRecorderRef.current.getMimeType(),
            (percent) => setUploadProgress(percent)
          );
          playbackUrl = url;
          recordingStatus = 'ready';
          setRecordingState('ready');
        } else {
          setRecordingState('failed');
          setRecordingError('Video trá»‘ng, khĂ´ng thá»ƒ lÆ°u replay.');
        }
      } else {
        setRecordingState('failed');
        setRecordingError('KhĂ´ng cĂ³ báº£n ghi nĂ o Ä‘ang hoáº¡t Ä‘á»™ng.');
      }

      // 3. Finalize session & attach replay with thumbnail
      await finalizeLiveSession(effectiveSessionId, { playbackUrl, recordingStatus });

      if (playbackUrl) {
        try {
          await attachLiveReplayToPost(effectiveSessionId, playbackUrl, undefined, thumbnailUrl);
        } catch (attachErr) {
          console.warn('[LiveHost] attachLiveReplayToPost failed:', attachErr);
        }
      }

      await leave();
      toast.success('Live Ä‘Ă£ káº¿t thĂºc!');
      navigate(`/live/${effectiveSessionId}`);
    } catch (error: any) {
      toast.error(error?.message || 'KhĂ´ng thá»ƒ káº¿t thĂºc live');
    }
  };

  const handleRetry = () => {
    startedRef.current = false;
    setBootError(null);
    setBootState('idle');
    setRetryNonce((x) => x + 1);
  };

  const isEnding = ['stopping', 'processing'].includes(recordingState);

  const showLoader =
    ['auth', 'creating', 'loading', 'starting'].includes(bootState) ||
    (!!effectiveSessionId && sessionQuery.isLoading);

  if (showLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>
            {bootState === 'creating'
              ? 'Dang tao phien LIVE...'
              : bootState === 'starting'
                ? 'Dang ket noi Agora...'
                : 'Dang tai...'}
          </span>
        </div>
      </div>
    );
  }

  if (bootState === 'error') {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="pt-20 px-4 max-w-xl mx-auto">
          <Card className="p-6 space-y-4">
            <div className="font-semibold text-lg">Khong the bat dau LIVE</div>
            <div className="text-sm text-muted-foreground">{bootError || 'Da xay ra loi khong xac dinh.'}</div>
            <div className="flex items-center gap-2">
              <Button onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Thu lai
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" />
                Quay ve trang chu
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 space-y-3">
          <div>Live session not found.</div>
          <Button onClick={handleRetry}>Retry</Button>
        </Card>
      </div>
    );
  }

  if (!isHost) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="pt-20 px-4 max-w-3xl mx-auto">
          <Card className="p-6 text-center space-y-4">
            <p className="font-semibold">You are not the host of this live session.</p>
            <Button onClick={() => navigate(`/live/${session.id}`)}>Switch to viewer mode</Button>
          </Card>
        </div>
      </div>
    );
  }

  const recBadge = REC_BADGE[recordingState];

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-bold">{session.title || 'Live Stream'}</h1>
                <div className="text-sm text-muted-foreground">Channel: {session.agora_channel || session.channel_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === 'live' && isJoined ? 'destructive' : 'secondary'} className="gap-1">
                  <Radio className="h-3.5 w-3.5" />
                  {session.status === 'ended' ? 'ENDED' : isJoined ? 'LIVE' : 'CONNECTING'}
                </Badge>
                <Badge variant={recBadge.variant}>
                  {recBadge.label}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {session.viewer_count || 0}
                </Badge>
              </div>
            </div>

            {recordingError ? (
              <Card className="p-3 text-sm border-destructive/30 text-destructive">
                Ghi hĂ¬nh: {recordingError}
              </Card>
            ) : null}


            {recordingState === 'stopping' && (
              <Card className="p-3 text-sm border-primary/30 text-primary flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Äang dá»«ng ghi hĂ¬nh...
              </Card>
            )}

            {recordingState === 'processing' && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Äang táº£i video lĂªn...
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  â ï¸ Vui lĂ²ng khĂ´ng Ä‘Ă³ng tab â€” video sáº½ bá»‹ máº¥t náº¿u thoĂ¡t trang
                </p>
              </Card>
            )}


            <Card className="overflow-hidden">
              <div className="aspect-video bg-black relative">
                <div ref={setLocalContainerRef} className="h-full w-full" />
                {!isJoined && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50">
                    {statusText}
                  </div>
                )}
                {effectiveSessionId && <FloatingReactions sessionId={effectiveSessionId} />}
              </div>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={toggleMute} disabled={!isJoined || isEnding}>
                {isMuted ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="outline" onClick={toggleCamera} disabled={!isJoined || isEnding}>
                {isCameraOff ? <VideoOff className="h-4 w-4 mr-2" /> : <Video className="h-4 w-4 mr-2" />}
                {isCameraOff ? 'Camera On' : 'Camera Off'}
              </Button>
              <Button variant="destructive" onClick={handleEndLive} disabled={isEnding}>
                {isEnding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOff className="h-4 w-4 mr-2" />}
                {isEnding ? 'Äang xá»­ lĂ½...' : 'End Live'}
              </Button>
            </div>
          </section>

          {effectiveSessionId && <LiveChatPanel sessionId={effectiveSessionId} className="h-[70vh] lg:h-[calc(100vh-120px)]" />}
        </div>
      </main>
    </div>
  );
}

```

### FILE: src/modules/live/pages/LiveStream.tsx
`$ext
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Square, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { uploadStreamVideo, createStreamRecord } from '../streamService';

type Phase = 'idle' | 'preview' | 'recording' | 'uploading';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function resolveMime(): string {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function LiveStream() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('idle');
  const [title, setTitle] = useState(searchParams.get('title') || '');
  const [seconds, setSeconds] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const busyRef = useRef(false);

  // Cleanup helper
  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (phase === 'recording' || phase === 'uploading') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      stopTracks();
    };
  }, [stopTracks]);

  // Attach stream to video element whenever the video element mounts
  useEffect(() => {
    if (videoRef.current && streamRef.current && phase !== 'idle') {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  // ---- Actions ----
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPhase('preview');
    } catch {
      toast.error('KhĂ´ng thá»ƒ truy cáº­p camera / micro');
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = resolveMime();
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setSeconds(0);
    setPhase('recording');

    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stopAndUpload = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    clearInterval(timerRef.current);

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      busyRef.current = false;
      return;
    }

    setPhase('uploading');

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

    stopTracks();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ChÆ°a Ä‘Äƒng nháº­p');

      const duration = seconds;
      const { publicUrl } = await uploadStreamVideo(blob, user.id);
      await createStreamRecord(user.id, title.trim() || null, publicUrl, duration);
      await queryClient.invalidateQueries({ queryKey: ['feed-posts'] });
      toast.success('Video Ä‘Ă£ Ä‘Æ°á»£c Ä‘Äƒng!');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message || 'Upload tháº¥t báº¡i');
      setPhase('idle');
    } finally {
      busyRef.current = false;
    }
  };

  const handleBack = () => {
    if (phase === 'recording') return;
    clearInterval(timerRef.current);
    stopTracks();
    navigate(-1);
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 p-3 border-b">
        <Button variant="ghost" size="icon" onClick={handleBack} disabled={phase === 'uploading'}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">Ghi & ÄÄƒng</h1>
        {phase === 'recording' && (
          <Badge variant="destructive" className="animate-pulse gap-1">
            <span className="h-2 w-2 rounded-full bg-white" />
            REC {formatTime(seconds)}
          </Badge>
        )}
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {phase === 'idle' ? (
          <div className="text-center text-muted-foreground space-y-4 p-6">
            <Camera className="h-16 w-16 mx-auto opacity-40" />
            <p>Nháº­p tiĂªu Ä‘á» rá»“i báº­t camera Ä‘á»ƒ báº¯t Ä‘áº§u</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}

        {phase === 'uploading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-white" />
            <p className="text-white text-sm">Äang táº£i lĂªnâ€¦</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3 border-t">
        {phase === 'idle' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rec-title">TiĂªu Ä‘á» (tuá»³ chá»n)</Label>
              <Input
                id="rec-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VĂ­ dá»¥: Giao lÆ°u tá»‘i nay"
                maxLength={120}
              />
            </div>
            <Button onClick={startCamera} className="w-full gap-2">
              <Camera className="h-4 w-4" />
              Báº­t camera
            </Button>
          </>
        )}

        {phase === 'preview' && (
          <Button onClick={startRecording} className="w-full gap-2">
            <span className="h-3 w-3 rounded-full bg-destructive" />
            Báº¯t Ä‘áº§u ghi
          </Button>
        )}

        {phase === 'recording' && (
          <Button onClick={stopAndUpload} variant="destructive" className="w-full gap-2">
            <Square className="h-4 w-4" />
            Káº¿t thĂºc & ÄÄƒng
          </Button>
        )}
      </div>
    </div>
  );
}

```

### FILE: src/modules/live/pages/LiveStudio.tsx
`$ext
export { default } from './LiveHostPage';


```

### FILE: src/modules/live/pages/LiveViewer.tsx
`$ext
export { default } from './LiveAudiencePage';


```

### FILE: src/modules/live/README.md
`$ext
# Live Streaming (RLS-Only, No Service Role)

This module uses Agora live mode and Supabase RLS with user session JWT.

## Routes

- `/live/new`: create live session and redirect host
- `/live/:liveSessionId/host`: host screen
- `/live/:liveSessionId`: audience screen
- Legacy aliases still supported:
- `/live/stream` -> `/live/new`
- `/live/studio/:liveSessionId` -> `/live/:liveSessionId/host`

## Frontend Deliverables

- `src/modules/live/pages/HostLive.tsx`
- `src/modules/live/pages/AudienceLive.tsx`
- `src/modules/live/api/agora.ts`

API wrappers:

- `getRtcToken({ sessionId?, channelName?, uid?, role, expireSeconds? })`
- `startRecording({ sessionId, channelName, recorderUid, mode })`
- `stopRecording({ sessionId, channelName, recorderUid, resourceId, sid })`

## Supabase Migration

Run SQL migration in Supabase SQL Editor or via CLI:

```sh
supabase db push
```

Required additive migration:

- `supabase/migrations/20260217153000_live_sessions_rls_additive.sql`

It ensures:

- `live_sessions.recording_resource_id`
- `live_sessions.recording_sid`
- `live_sessions.recording_files`
- RLS insert/update with `auth.uid() = host_user_id OR owner_id`
- Public select for `status in ('live', 'ended')`

## Edge Functions

Deploy:

```sh
supabase functions deploy live-token
supabase functions deploy live-recording-start
supabase functions deploy live-recording-stop
```

Edge function env vars:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `LIVE_AGORA_WORKER_URL`
- `LIVE_AGORA_WORKER_API_KEY`
- optional fallback names: `VITE_AGORA_WORKER_URL`, `VITE_AGORA_WORKER_API_KEY`

Recording worker envs (required/preferred):

- `REC_STORAGE_BUCKET`
- `REC_STORAGE_ACCESS_KEY`
- `REC_STORAGE_SECRET_KEY`
- `REC_STORAGE_REGION`
- `REC_R2_ENDPOINT` (S3 endpoint: `https://<account>.r2.cloudflarestorage.com`)
- `PUBLIC_MEDIA_BASE_URL` (public read URL, e.g. `https://pub-xxxx.r2.dev/funprofile/live` or custom domain)
- optional: `REC_ENABLE_HEAD_FALLBACK=true` (only used when Agora query lacks upload status)

Backward-compatible fallback env names still supported:

- `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REGION`, `R2_ENDPOINT`
- `RECORDING_PLAYBACK_BASE_URL`

## Worker API

Worker keeps old routes and adds `/api/*` aliases:

- `POST /api/agora/rtc-token`
- `POST /api/agora/recording/start`
- `POST /api/agora/recording/stop`
- `GET /api/agora/recording/query`
- `POST /api/recording/start` (internally acquire -> start)
- `POST /api/recording/stop`
- `GET /api/recording/query`

Legacy routes kept:

- `POST /token/rtc`
- `POST /recording/acquire`
- `POST /recording/start`
- `POST /recording/stop`
- `GET /recording/query`

## Cloud Recording Status Semantics

- `uploadingStatus = backuped` means upload is still pending (not playable yet).
- Worker returns `mediaUrl` only when `status = ready` and upload is fully `uploaded`.
- Worker now returns `mediaKey` and `mediaUrl`; `mediaUrl` is always `null` while `status = pending`.
- Frontend must poll query endpoint every 10s (up to 8 minutes) while `status = pending`.

## R2 StorageConfig (Self-Built S3 Compatible)

Agora Cloud Recording is configured with:

- `storageConfig.vendor = 11`
- `storageConfig.extensionParams.endpoint = https://<account>.r2.cloudflarestorage.com`
- plus `bucket`, `accessKey`, `secretKey`, `region`, `fileNamePrefix`

Example Wrangler commands:

```sh
wrangler secret put AGORA_APP_ID
wrangler secret put AGORA_APP_CERTIFICATE
wrangler secret put AGORA_CUSTOMER_ID
wrangler secret put AGORA_CUSTOMER_SECRET
wrangler secret put API_KEY
wrangler secret put REC_STORAGE_BUCKET
wrangler secret put REC_STORAGE_ACCESS_KEY
wrangler secret put REC_STORAGE_SECRET_KEY
wrangler secret put REC_STORAGE_REGION
wrangler secret put REC_R2_ENDPOINT
wrangler secret put PUBLIC_MEDIA_BASE_URL
```

## Security

Never expose in client bundle:

- Agora App Certificate
- Agora customer secret
- R2/S3 credentials
- Supabase service role key

Client only uses:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- user session JWT (from Supabase Auth)

## Verification Checklist

1. Host starts live and audience receives stream in <= 5s.
2. Audience subscribes on `user-published` and stream stops on `user-unpublished`/host leave.
3. Host ends live and `live_sessions.status` becomes `ended`.
4. `recording_files` saved on host-owned row via RLS.
5. No secrets present in frontend source/bundle.

```

### FILE: src/modules/live/recording/clientRecorder.ts
`$ext
export type RecorderState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface CreateRecorderOptions {
  timesliceMs?: number;
  onStateChange?: (state: RecorderState) => void;
  onError?: (error: unknown) => void;
}

export interface RecorderController {
  start: () => void;
  stop: () => Promise<Blob>;
  getBlob: () => Blob | null;
  getMimeType: () => string;
  getSize: () => number;
  getState: () => RecorderState;
}

const DEFAULT_TIMESLICE_MS = 1500;
const MIME_CANDIDATES = ['video/webm;codecs=vp8,opus', 'video/webm'];

function resolveMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser');
  }

  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  throw new Error('No supported recording mime type found');
}

export function createRecorder(
  stream: MediaStream,
  opts: CreateRecorderOptions = {}
): RecorderController {
  const mimeType = resolveMimeType();
  const timesliceMs = opts.timesliceMs ?? DEFAULT_TIMESLICE_MS;
  const chunks: BlobPart[] = [];
  let blob: Blob | null = null;
  let size = 0;
  let state: RecorderState = 'idle';

  const setState = (nextState: RecorderState) => {
    state = nextState;
    opts.onStateChange?.(nextState);
  };

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType });
  } catch (error) {
    setState('failed');
    opts.onError?.(error);
    throw error;
  }

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (!event.data || event.data.size === 0) return;
    chunks.push(event.data);
    size += event.data.size;
  };

  mediaRecorder.onerror = (event) => {
    setState('failed');
    opts.onError?.(event);
  };

  return {
    start: () => {
      if (mediaRecorder.state !== 'inactive') return;
      setState('starting');
      blob = null;
      size = 0;
      chunks.length = 0;

      try {
        mediaRecorder.start(timesliceMs);
        setState('recording');
      } catch (error) {
        setState('failed');
        opts.onError?.(error);
      }
    },
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        if (mediaRecorder.state === 'inactive') {
          if (blob) return resolve(blob);
          const emptyBlob = new Blob(chunks, { type: mimeType });
          blob = emptyBlob;
          setState('stopped');
          return resolve(emptyBlob);
        }

        setState('stopping');

        mediaRecorder.onstop = () => {
          blob = new Blob(chunks, { type: mimeType });
          setState('stopped');
          resolve(blob);
        };

        try {
          mediaRecorder.stop();
        } catch (error) {
          setState('failed');
          opts.onError?.(error);
          reject(error);
        }
      }),
    getBlob: () => blob,
    getMimeType: () => mimeType,
    getSize: () => size,
    getState: () => state,
  };
}

```

### FILE: src/modules/live/streamService.ts
`$ext
import { supabase } from '@/integrations/supabase/client';
import { uploadVideoToR2 } from '@/utils/r2Upload';

const db = supabase as any;

export async function uploadStreamVideo(blob: Blob, userId: string) {
  const file = new File([blob], `${Date.now()}.webm`, { type: 'video/webm' });
  const result = await uploadVideoToR2(file);
  return { publicUrl: result.publicUrl, key: result.key };
}

export async function createStreamRecord(
  userId: string,
  title: string | null,
  publicUrl: string,
  duration: number
) {
  const { data: stream, error: streamError } = await db
    .from('streams')
    .insert({
      user_id: userId,
      title: title || 'Live Video',
      video_path: publicUrl,
      duration,
      status: 'completed',
    })
    .select('id')
    .single();

  if (streamError) throw streamError;

  await db.from('posts').insert({
    user_id: userId,
    content: title || 'Live Video',
    video_url: publicUrl,
    visibility: 'public',
    post_type: 'video',
  });

  return stream;
}

```

### FILE: src/modules/live/types.ts
`$ext
export type LivePrivacy = 'public' | 'friends';
export type LiveStatus = 'live' | 'ended';

export interface LiveHostProfile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface LiveSession {
  id: string;
  host_user_id: string;
  agora_channel?: string | null;
  channel_name: string;
  agora_uid_host?: number | null;
  recording_uid?: number | null;
  recording_status?:
    | 'idle'
    | 'acquired'
    | 'acquiring'
    | 'starting'
    | 'recording'
    | 'stopping'
    | 'processing'
    | 'ready'
    | 'stopped'
    | 'failed'
    | null;
  title: string | null;
  privacy: LivePrivacy;
  status: LiveStatus;
  viewer_count: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  post_id: string | null;
  host_profile?: LiveHostProfile | null;
}

export interface CreateLiveSessionInput {
  title?: string;
  privacy: LivePrivacy;
}

```

### FILE: src/modules/live/useLiveSession.ts
`$ext
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLiveSession, listActiveLiveSessions } from './liveService';

export function useLiveSession(sessionId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-session', sessionId],
    queryFn: () => getLiveSession(sessionId as string),
    enabled: !!sessionId,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['live-session', sessionId] });
          queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  return query;
}

export function useActiveLiveSessions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-active-sessions'],
    queryFn: listActiveLiveSessions,
    staleTime: 10_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('live-active-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['live-active-sessions'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}


```

### FILE: supabase/config.toml
`$ext
project_id = "lramftbsjrqyysdqlfdg"
```

### FILE: supabase/functions/_shared/jwt.ts
`$ext
/**
 * JWT Utilities for FUN Profile SSO
 * 
 * Derives signing key from SUPABASE_SERVICE_ROLE_KEY to avoid needing a separate secret.
 * Uses HMAC-SHA256 for token signing.
 */

const JWT_ISSUER = "fun_profile";
const ACCESS_TOKEN_EXPIRES_SECONDS = 3600; // 1 hour

interface JWTPayload {
  sub: string;                    // user_id (UUID)
  fun_id: string;                 // FUN ID (username-based identifier)
  username: string;               // Display username
  custodial_wallet: string | null; // Custodial wallet address
  scope: string[];                // Granted scopes/permissions
}

interface JWTHeader {
  alg: string;
  typ: string;
}

// Derive a signing key from SUPABASE_SERVICE_ROLE_KEY using HKDF-like approach
async function getSigningKey(): Promise<CryptoKey> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  
  // Use the service key + salt to derive JWT signing key
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(serviceKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  
  // Derive a specific key for JWT signing
  const salt = encoder.encode("fun_profile_jwt_v1");
  const derivedKeyData = await crypto.subtle.sign("HMAC", keyMaterial, salt);
  
  // Import the derived key for HMAC operations
  return await crypto.subtle.importKey(
    "raw",
    derivedKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Base64URL encode
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) {
    padded += "=";
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a JWT Access Token
 */
export async function generateAccessToken(payload: JWTPayload): Promise<string> {
  const signingKey = await getSigningKey();
  const encoder = new TextEncoder();
  
  const now = Math.floor(Date.now() / 1000);
  
  const header: JWTHeader = {
    alg: "HS256",
    typ: "JWT"
  };
  
  const claims = {
    ...payload,
    iss: JWT_ISSUER,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_SECONDS
  };
  
  // Encode header and payload
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  
  // Sign
  const message = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(message)
  );
  
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  
  return `${message}.${signatureB64}`;
}

/**
 * Verify and decode a JWT Access Token
 * Returns null if invalid or expired
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[JWT] Invalid token format");
      return null;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const signingKey = await getSigningKey();
    const encoder = new TextEncoder();
    const message = `${headerB64}.${payloadB64}`;
    
    const signatureBytes = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      signingKey,
      new Uint8Array(signatureBytes).buffer as ArrayBuffer,
      encoder.encode(message)
    );
    
    if (!isValid) {
      console.error("[JWT] Signature verification failed");
      return null;
    }
    
    // Decode and validate claims
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const claims = JSON.parse(payloadJson);
    
    // Check issuer
    if (claims.iss !== JWT_ISSUER) {
      console.error("[JWT] Invalid issuer");
      return null;
    }
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      console.error("[JWT] Token expired");
      return null;
    }
    
    return {
      sub: claims.sub,
      fun_id: claims.fun_id,
      username: claims.username,
      custodial_wallet: claims.custodial_wallet,
      scope: claims.scope
    };
  } catch (error) {
    console.error("[JWT] Verification error:", error);
    return null;
  }
}

/**
 * Generate an opaque refresh token (secure random string)
 */
export function generateRefreshToken(length = 96): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

/**
 * Decode JWT without verification (for debugging/logging only)
 */
export function decodeJwtUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

```

### FILE: supabase/functions/agora-token/index.ts
`$ext
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authorization required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const body = await req.json();
    const { channel_name, call_session_id } = body;

    if (!channel_name) {
      return jsonResponse({ error: "channel_name is required" }, 400);
    }

    // If call_session_id provided, verify user is participant
    if (call_session_id) {
      const { data: session, error: sessionError } = await supabase
        .from("call_sessions")
        .select("id, conversation_id")
        .eq("id", call_session_id)
        .single();

      if (sessionError || !session) {
        return jsonResponse({ error: "Call session not found" }, 404);
      }
    }

    // Proxy to Cloudflare Worker (uses official Agora library)
    const workerUrl = Deno.env.get("VITE_AGORA_WORKER_URL");
    const workerApiKey = Deno.env.get("VITE_AGORA_WORKER_API_KEY");
    if (!workerUrl || !workerApiKey) {
      return jsonResponse({ error: "Agora worker configuration missing" }, 500);
    }

    const allowedOrigin = "https://angelquangvu-funprofile.lovable.app";

    const workerRes = await fetch(`${workerUrl.replace(/\/$/, "")}/token/rtc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
        Origin: allowedOrigin,
      },
      body: JSON.stringify({
        channel: channel_name,
        userAccount: user.id,
        role: "publisher",
        expireSeconds: 86400,
      }),
    });

    const workerPayload = await workerRes.json().catch(() => ({}));
    if (!workerRes.ok) {
      console.error("[AGORA-TOKEN] Worker error:", workerPayload);
      return jsonResponse(
        { error: workerPayload?.error || "Failed to issue Agora token" },
        workerRes.status,
      );
    }

    console.log(
      `[AGORA-TOKEN] Token issued for user ${user.id}, channel: ${channel_name}`,
    );

    // Map response to existing frontend format
    return jsonResponse({
      token: workerPayload.token,
      app_id: workerPayload.appId,
      channel: workerPayload.channel || channel_name,
      uid: workerPayload.userAccount || user.id,
      expires_at: workerPayload.expireAt,
    });
  } catch (error: unknown) {
    console.error("[AGORA-TOKEN] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});

```

### FILE: supabase/functions/live-token/index.ts
`$ext
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type LiveRole = "host" | "audience" | "recorder";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(error: string, status = 400) {
  return jsonResponse({ error }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return badRequest("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return badRequest("Authorization required", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return badRequest("Supabase configuration missing", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return badRequest("Invalid token", 401);

    const body = await req.json().catch(() => null) as {
      session_id?: string;
      sessionId?: string;
      channelName?: string;
      uid?: string | number;
      role?: LiveRole;
      expireSeconds?: number;
    } | null;
    const sessionId = body?.session_id || body?.sessionId;
    const directChannelName = body?.channelName?.trim();
    const role = body?.role;
    if (!sessionId && !directChannelName) return badRequest("session_id or channelName is required");
    if (role !== "host" && role !== "audience" && role !== "recorder") return badRequest("role must be host, audience, or recorder");

    let channel = directChannelName || "";
    let requestUid = body?.uid ? String(body.uid) : user.id;
    let liveSession:
      | {
          id: string;
          host_user_id: string;
          status: string;
          agora_channel: string | null;
          channel_name: string;
          recording_uid: number | null;
        }
      | null = null;

    if (sessionId) {
      const { data: sessionRow, error: sessionError } = await supabase
        .from("live_sessions")
        .select("id, host_user_id, status, agora_channel, channel_name, recording_uid")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError) return badRequest(sessionError.message, 400);
      if (!sessionRow) return badRequest("Live session not found", 404);
      liveSession = sessionRow;

      channel = sessionRow.agora_channel || sessionRow.channel_name;
      if (!channel) return badRequest("Live channel not configured", 400);

      if ((role === "host" || role === "recorder") && sessionRow.host_user_id !== user.id) {
        return badRequest("Only host can request host/recorder token", 403);
      }
      if (role !== "recorder" && sessionRow.status !== "live") {
        return badRequest("Live session has ended", 409);
      }

      if (role === "recorder") {
        requestUid = String(sessionRow.recording_uid || user.id);
      }
    }

    const workerUrl = Deno.env.get("LIVE_AGORA_WORKER_URL") || Deno.env.get("VITE_AGORA_WORKER_URL");
    const workerApiKey = Deno.env.get("LIVE_AGORA_WORKER_API_KEY") || Deno.env.get("VITE_AGORA_WORKER_API_KEY");
    if (!workerUrl || !workerApiKey) {
      return badRequest("Live Agora worker configuration missing", 500);
    }

    const allowedOrigin = "https://angelquangvu-funprofile.lovable.app";
    const workerBase = workerUrl.replace(/\/$/, "");
    const workerPayload = {
      channelName: channel,
      uid: requestUid,
      role,
      expireSeconds: body?.expireSeconds || 3600,
    };

    const workerRes = await fetch(`${workerBase}/api/agora/rtc-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
        "Origin": allowedOrigin,
      },
      body: JSON.stringify(workerPayload),
    });

    let workerResponse = await workerRes.json().catch(() => ({}));
    if (!workerRes.ok) {
      // Backward-compatible fallback for old worker route
      const fallbackRes = await fetch(`${workerBase}/token/rtc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": workerApiKey,
          "Origin": allowedOrigin,
        },
        body: JSON.stringify({
          channel,
          userAccount: requestUid,
          role: role === "host" || role === "recorder" ? "publisher" : "subscriber",
          expireSeconds: body?.expireSeconds || 3600,
        }),
      });
      workerResponse = await fallbackRes.json().catch(() => ({}));
      if (!fallbackRes.ok) {
        return badRequest(workerResponse?.error || "Failed to issue Agora token", fallbackRes.status);
      }
    }

    if (!workerResponse?.token || !workerResponse?.appId) {
      return badRequest("Invalid worker token response", 502);
    }

    return jsonResponse({
      token: workerResponse.token,
      channel: workerResponse.channel || channel,
      uid: workerResponse.uid || workerResponse.userAccount || requestUid,
      appId: workerResponse.appId,
      expiresAt: workerResponse.expireAt,
      sessionId: liveSession?.id ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return badRequest(message, 500);
  }
});

```

### FILE: supabase/functions/live-token/deno.json
`$ext
{
  "imports": {}
}

```

### FILE: supabase/functions/live-start/index.ts
`$ext
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "Endpoint deprecated",
      message: "Recording is now handled by Cloudflare Worker /recording/acquire + /recording/start.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

```

### FILE: supabase/functions/live-stop/index.ts
`$ext
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "Endpoint deprecated",
      message: "Recording stop is now handled by Cloudflare Worker /recording/stop.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

```

### FILE: supabase/functions/live-recording-start/index.ts
`$ext
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Body = {
  sessionId?: string;
  channelName?: string;
  recorderUid?: string | number;
  mode?: "mix" | "individual";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Supabase configuration missing" }, 500);
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid token" }, 401);

    const body = (await req.json().catch(() => null)) as Body | null;
    const sessionId = body?.sessionId;
    const mode = body?.mode || "mix";
    if (!sessionId) return jsonResponse({ error: "sessionId is required" }, 400);

    const { data: liveSession, error: sessionError } = await client
      .from("live_sessions")
      .select("id, host_user_id, channel_name, agora_channel, recording_uid, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) return jsonResponse({ error: sessionError.message }, 400);
    if (!liveSession) return jsonResponse({ error: "Live session not found" }, 404);
    if (liveSession.host_user_id !== user.id) {
      return jsonResponse({ error: "Only host can start recording" }, 403);
    }
    if (liveSession.status !== "live") {
      return jsonResponse({ error: "Live session has ended" }, 409);
    }

    const channelName = (body?.channelName || liveSession.agora_channel || liveSession.channel_name || "").trim();
    if (!channelName) return jsonResponse({ error: "channelName is required" }, 400);

    const recorderUid = String(body?.recorderUid || liveSession.recording_uid || "");
    if (!recorderUid) return jsonResponse({ error: "recorderUid is required" }, 400);

    const workerUrl = (Deno.env.get("LIVE_AGORA_WORKER_URL") || Deno.env.get("VITE_AGORA_WORKER_URL") || "").replace(/\/+$/, "");
    const workerApiKey = Deno.env.get("LIVE_AGORA_WORKER_API_KEY") || Deno.env.get("VITE_AGORA_WORKER_API_KEY") || "";
    if (!workerUrl || !workerApiKey) {
      return jsonResponse({ error: "Live Agora worker configuration missing" }, 500);
    }

    const tokenRes = await client.functions.invoke("live-token", {
      body: { sessionId, role: "recorder" },
    });
    if (tokenRes.error || !tokenRes.data?.token) {
      return jsonResponse({ error: tokenRes.error?.message || "Failed to get recorder token" }, 400);
    }
    const recorderToken = tokenRes.data.token as string;

    const allowedOrigin = (Deno.env.get("FUN_PROFILE_ORIGIN") || "https://angelquangvu-funprofile.lovable.app").replace(/\/+$/, "").trim();
    console.log("[live-recording-start] Using origin:", allowedOrigin, "workerUrl:", workerUrl);
    const fetchUrl = `${workerUrl}/api/agora/recording/start`;
    console.log("[live-recording-start] POST", fetchUrl, "origin:", allowedOrigin);
    const resp = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
        Origin: allowedOrigin,
      },
      body: JSON.stringify({
        channelName,
        recorderUid,
        token: recorderToken,
        mode,
        sessionId,
      }),
    });

    const rawText = await resp.text();
    console.log("[live-recording-start] Worker response:", resp.status, rawText.substring(0, 500));
    let payload: any = {};
    try { payload = JSON.parse(rawText); } catch { /* non-json */ }
    if (!resp.ok) {
      return jsonResponse({ error: payload?.error || `Worker returned ${resp.status}` }, resp.status);
    }

    const resourceId = payload?.resourceId || payload?.data?.resourceId;
    const sid = payload?.sid || payload?.data?.sid;
    if (!resourceId || !sid) {
      return jsonResponse({ error: "Invalid recording start response" }, 502);
    }

    return jsonResponse({ resourceId, sid });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Unexpected error" }, 500);
  }
});

```

### FILE: supabase/functions/live-recording-stop/index.ts
`$ext
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Body = {
  sessionId?: string;
  channelName?: string;
  recorderUid?: string | number;
  resourceId?: string;
  sid?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Supabase configuration missing" }, 500);
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid token" }, 401);

    const body = (await req.json().catch(() => null)) as Body | null;
    const sessionId = body?.sessionId;
    if (!sessionId) return jsonResponse({ error: "sessionId is required" }, 400);

    const { data: liveSession, error: sessionError } = await client
      .from("live_sessions")
      .select("id, host_user_id, channel_name, agora_channel, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) return jsonResponse({ error: sessionError.message }, 400);
    if (!liveSession) return jsonResponse({ error: "Live session not found" }, 404);
    if (liveSession.host_user_id !== user.id) {
      return jsonResponse({ error: "Only host can stop recording" }, 403);
    }

    const channelName = (body?.channelName || liveSession.agora_channel || liveSession.channel_name || "").trim();
    const recorderUid = String(body?.recorderUid || "");
    const resourceId = body?.resourceId?.trim();
    const sid = body?.sid?.trim();

    if (!channelName || !recorderUid || !resourceId || !sid) {
      return jsonResponse({ error: "channelName, recorderUid, resourceId, sid are required" }, 400);
    }

    const workerUrl = (Deno.env.get("LIVE_AGORA_WORKER_URL") || Deno.env.get("VITE_AGORA_WORKER_URL") || "").replace(/\/+$/, "");
    const workerApiKey = Deno.env.get("LIVE_AGORA_WORKER_API_KEY") || Deno.env.get("VITE_AGORA_WORKER_API_KEY") || "";
    if (!workerUrl || !workerApiKey) {
      return jsonResponse({ error: "Live Agora worker configuration missing" }, 500);
    }

    const allowedOrigin = (Deno.env.get("FUN_PROFILE_ORIGIN") || "https://angelquangvu-funprofile.lovable.app").replace(/\/+$/, "").trim();
    const fetchUrl = `${workerUrl}/api/agora/recording/stop`;
    console.log("[live-recording-stop] POST", fetchUrl, "origin:", allowedOrigin);
    const resp = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
        Origin: allowedOrigin,
      },
      body: JSON.stringify({
        channelName,
        recorderUid,
        resourceId,
        sid,
        sessionId,
      }),
    });

    const rawText = await resp.text();
    console.log("[live-recording-stop] Worker response:", resp.status, rawText.substring(0, 500));
    let payload: any = {};
    try { payload = JSON.parse(rawText); } catch { /* non-json */ }
    if (!resp.ok) {
      return jsonResponse({ error: payload?.error || `Worker returned ${resp.status}` }, resp.status);
    }

    const serverResponse = payload?.serverResponse || payload?.data || payload;
    return jsonResponse({
      ...serverResponse,
      serverResponse,
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Unexpected error" }, 500);
  }
});

```

### FILE: supabase/functions/live-recording-status/index.ts
`$ext
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") || url.searchParams.get("liveId");
    if (!sessionId) {
      return jsonResponse({ error: "sessionId is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const workerUrl = (Deno.env.get("LIVE_AGORA_WORKER_URL") || Deno.env.get("VITE_AGORA_WORKER_URL") || "").replace(/\/+$/, "");
    const workerApiKey = Deno.env.get("LIVE_AGORA_WORKER_API_KEY") || Deno.env.get("VITE_AGORA_WORKER_API_KEY") || "";

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const { data: contextRows, error: contextError } = await client.rpc("get_live_recording_context", {
      _session_id: sessionId,
    });

    if (contextError) {
      return jsonResponse({ error: contextError.message }, 400);
    }

    const context = Array.isArray(contextRows) ? contextRows[0] : contextRows;
    if (!context) {
      return jsonResponse({ error: "Forbidden or live session not found" }, 403);
    }

    let workerQuery: any = null;
    if (workerUrl && workerApiKey && context.resource_id && context.sid) {
      const queryUrl = `${workerUrl}/api/agora/recording/query?resourceId=${encodeURIComponent(context.resource_id)}&sid=${encodeURIComponent(context.sid)}&mode=mix&sessionId=${encodeURIComponent(sessionId)}`;
      const queryRes = await fetch(queryUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": workerApiKey,
          "x-correlation-id": crypto.randomUUID(),
          Origin: Deno.env.get("FUN_PROFILE_ORIGIN") || "https://angelquangvu-funprofile.lovable.app",
        },
      });

      workerQuery = await queryRes.json().catch(() => ({}));
      if (!queryRes.ok) {
        return jsonResponse({
          ok: false,
          session: context,
          workerQuery,
        }, 200);
      }
    }

    const { data: recording } = await client
      .from("live_recordings")
      .select("id, status, file_list_json, stopped_at, created_at, media_url, duration_seconds, thumbnail_url")
      .eq("live_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse({
      ok: true,
      session: context,
      recording,
      workerQuery,
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Unexpected error" }, 500);
  }
});

```

### FILE: supabase/functions/live-recording-proxy/index.ts
`$ext
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "live-recording-proxy is deprecated",
      message: "Use frontend RPC + Worker direct flow (no SUPABASE_SERVICE_ROLE_KEY required).",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

```

### FILE: supabase/functions/stream-video/index.ts
`$ext
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

// UTF-8 safe Base64 encoder (btoa only supports Latin1 characters)
function base64EncodeUtf8(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  const chunkSize = 0x8000; // Process in chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Truncate error text for logging (avoid huge responses)
function truncateErrorText(text: string, maxLen = 500): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...[truncated]' : text;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Validate environment
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      console.error('[stream-video] Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Missing Cloudflare Stream configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[stream-video] Action:', action);

    // Log request fingerprint for debugging
    const origin = req.headers.get('Origin') || req.headers.get('Referer') || 'unknown';
    console.log('[stream-video] Request origin:', origin);

    // Authenticate user for all actions except health check
    const authHeader = req.headers.get('Authorization');
    
    // Health check can work without auth (but will return limited info)
    if (action === 'health') {
      if (!authHeader) {
        console.log('[stream-video] Health check (no auth)');
        return new Response(
          JSON.stringify({ 
            ok: true, 
            ts: new Date().toISOString(),
            authenticated: false,
            cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // With auth - return user info too
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      console.log('[stream-video] Health check (authenticated):', user?.id || 'auth failed');
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          ts: new Date().toISOString(),
          authenticated: !authError && !!user,
          userId: user?.id,
          cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require auth
    if (!authHeader) {
      console.error('[stream-video] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[stream-video] Auth error:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[stream-video] User:', user.id);

    switch (action) {
      // ============================================
      // GET TUS UPLOAD URL - Direct Creator Upload
      // ============================================
      case 'get-tus-upload-url': {
        const { fileSize, fileName, fileType, fileId } = body;
        
        if (!fileSize || fileSize <= 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid file size', details: `fileSize: ${fileSize}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sanitize filename and log request fingerprint
        const safeName = (fileName || `video_${Date.now()}`).trim().slice(0, 200);
        
        console.log('[stream-video] Creating Direct Creator Upload URL:', {
          fileSize,
          fileName: safeName,
          fileType,
          fileId: fileId || 'not-provided',
          userId: user.id,
          origin,
          timestamp: new Date().toISOString(),
        });

        // Build upload metadata with user ID and file ID for tracking
        // Use base64EncodeUtf8 for UTF-8 safe encoding (supports Vietnamese/Unicode filenames)
        const metadata = [
          `maxDurationSeconds ${base64EncodeUtf8('7200')}`,
          `requiresignedurls ${base64EncodeUtf8('false')}`,
          `name ${base64EncodeUtf8(safeName)}`,
        ].join(',');

        // Call Cloudflare Stream API with direct_user=true
        // This returns a Direct Upload URL that the client can use directly
        console.log('[stream-video] Calling Cloudflare API...');
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Tus-Resumable': '1.0.0',
              'Upload-Length': fileSize.toString(),
              'Upload-Metadata': metadata,
            },
          }
        );

        console.log('[stream-video] Cloudflare response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Cloudflare error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Cloudflare API error: ${response.status}`, 
              details: truncateErrorText(errorText, 300),
              cloudflareStatus: response.status,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the direct upload URL from Location header
        const uploadUrl = response.headers.get('Location');
        const streamMediaId = response.headers.get('stream-media-id');

        // Validate we got both required values
        if (!uploadUrl) {
          console.error('[stream-video] Missing Location header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return upload URL (missing Location header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!streamMediaId) {
          console.error('[stream-video] Missing stream-media-id header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return video UID (missing stream-media-id header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Got Direct Upload URL:', {
          uploadUrl: uploadUrl.substring(0, 80),
          uid: streamMediaId,
          fileId: fileId || 'not-provided',
        });

        return new Response(JSON.stringify({
          uploadUrl,
          uid: streamMediaId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DIRECT UPLOAD URL (for smaller files < 200MB)
      // ============================================
      case 'direct-upload': {
        const maxDurationSeconds = body.maxDurationSeconds || 7200;

        console.log('[stream-video] Creating direct upload URL');

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              maxDurationSeconds,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
              meta: {
                userId: user.id,
                uploadedAt: new Date().toISOString(),
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Direct upload error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to create direct upload: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        
        if (!data.result?.uploadURL || !data.result?.uid) {
          console.error('[stream-video] Invalid direct upload response:', data);
          return new Response(
            JSON.stringify({ error: 'Invalid response from Cloudflare direct upload' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('[stream-video] Direct upload created:', data.result.uid);
        
        return new Response(JSON.stringify({
          uploadUrl: data.result.uploadURL,
          uid: data.result.uid,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // CHECK VIDEO STATUS
      // ============================================
      case 'check-status': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to check status: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          status: video.status,
          readyToStream: video.readyToStream,
          duration: video.duration,
          thumbnail: video.thumbnail,
          playback: video.playback,
          preview: video.preview,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // GET PLAYBACK URL
      // ============================================
      case 'get-playback-url': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to get playback URL: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          playback: {
            hls: video.playback?.hls,
            dash: video.playback?.dash,
          },
          thumbnail: video.thumbnail,
          preview: video.preview,
          duration: video.duration,
          readyToStream: video.readyToStream,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DELETE VIDEO
      // ============================================
      case 'delete': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to delete video: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Video deleted:', uid);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // UPDATE VIDEO SETTINGS
      // ============================================
      case 'update-video-settings': {
        const { uid, requireSignedURLs = false, allowedOrigins = ['*'] } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Updating settings for:', uid);

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requireSignedURLs,
              allowedOrigins,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Update settings error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to update settings: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();

        return new Response(JSON.stringify({
          success: true,
          uid,
          requireSignedURLs: data.result?.requireSignedURLs,
          allowedOrigins: data.result?.allowedOrigins,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[stream-video] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, type: 'unhandled' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

```

### FILE: supabase/functions/cleanup-stream-videos/index.ts
`$ext
/**
 * Cleanup Stream Videos Edge Function
 * 
 * Cleans up orphaned/pending videos from Cloudflare Stream
 * that are older than 24 hours and haven't been attached to any post.
 * 
 * Can be called manually or scheduled via a cron job.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

interface StreamVideo {
  uid: string;
  status: { state: string };
  created: string;
  meta?: { userId?: string };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Validate environment
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      throw new Error('Missing Cloudflare Stream configuration');
    }

    // Authenticate user (must be admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      throw new Error('Admin access required');
    }

    console.log('[cleanup-stream-videos] Starting cleanup by admin:', user.id);

    // Get all videos from Cloudflare Stream
    const listResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
        },
      }
    );

    if (!listResponse.ok) {
      throw new Error(`Failed to list videos: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const videos: StreamVideo[] = listData.result || [];

    console.log('[cleanup-stream-videos] Found', videos.length, 'videos in Stream');

    // Get all video URLs from posts
    const { data: posts } = await supabaseClient
      .from('posts')
      .select('video_url, media_urls');

    const usedVideoUids = new Set<string>();
    
    posts?.forEach((post: any) => {
      // Check video_url
      if (post.video_url) {
        const match = post.video_url.match(/videodelivery\.net\/([a-f0-9]+)/);
        if (match) usedVideoUids.add(match[1]);
      }
      
      // Check media_urls
      if (post.media_urls && Array.isArray(post.media_urls)) {
        post.media_urls.forEach((media: any) => {
          if (media.type === 'video' && media.url) {
            const match = media.url.match(/videodelivery\.net\/([a-f0-9]+)/);
            if (match) usedVideoUids.add(match[1]);
          }
        });
      }
    });

    console.log('[cleanup-stream-videos] Found', usedVideoUids.size, 'videos in use');

    // Find orphan videos (not in any post and older than 24 hours)
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const orphanVideos: StreamVideo[] = [];
    const pendingVideos: StreamVideo[] = [];

    videos.forEach((video) => {
      const createdAt = new Date(video.created).getTime();
      const age = now - createdAt;
      
      // Check if video is orphaned (not in any post and older than 24 hours)
      if (!usedVideoUids.has(video.uid) && age > ONE_DAY_MS) {
        orphanVideos.push(video);
      }
      
      // Check for pending upload status (older than 24 hours)
      if (video.status?.state === 'pendingupload' && age > ONE_DAY_MS) {
        pendingVideos.push(video);
      }
    });

    console.log('[cleanup-stream-videos] Found', orphanVideos.length, 'orphan videos');
    console.log('[cleanup-stream-videos] Found', pendingVideos.length, 'pending videos');

    // Parse request for action
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    const deletedVideos: string[] = [];
    const failedDeletions: string[] = [];

    if (!dryRun) {
      // Delete orphan videos
      for (const video of [...orphanVideos, ...pendingVideos]) {
        // Skip if already counted (some might be in both lists)
        if (deletedVideos.includes(video.uid)) continue;

        try {
          const deleteResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${video.uid}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              },
            }
          );

          if (deleteResponse.ok || deleteResponse.status === 404) {
            deletedVideos.push(video.uid);
            console.log('[cleanup-stream-videos] Deleted:', video.uid);
          } else {
            failedDeletions.push(video.uid);
            console.error('[cleanup-stream-videos] Failed to delete:', video.uid);
          }
        } catch (err) {
          failedDeletions.push(video.uid);
          console.error('[cleanup-stream-videos] Error deleting:', video.uid, err);
        }
      }
    }

    const result = {
      dryRun,
      totalVideos: videos.length,
      videosInUse: usedVideoUids.size,
      orphanVideos: orphanVideos.map(v => ({
        uid: v.uid,
        created: v.created,
        status: v.status?.state,
      })),
      pendingVideos: pendingVideos.map(v => ({
        uid: v.uid,
        created: v.created,
      })),
      deletedCount: deletedVideos.length,
      failedCount: failedDeletions.length,
    };

    console.log('[cleanup-stream-videos] Cleanup complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[cleanup-stream-videos] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: errorMessage === 'Unauthorized' || errorMessage === 'Admin access required' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

```

### FILE: supabase/migrations/20260211103000_live_sessions_mvp.sql
`$ext
-- MVP In-app Livestream
-- 1) Extend posts to support live post cards
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_post_type_check'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('text', 'live'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_posts_post_type_created_at
ON public.posts(post_type, created_at DESC);

-- 2) Live sessions table
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_name text NOT NULL UNIQUE,
  title text,
  privacy text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'live',
  viewer_count integer NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_sessions_privacy_check CHECK (privacy IN ('public', 'friends')),
  CONSTRAINT live_sessions_status_check CHECK (status IN ('live', 'ended'))
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_status_started_at
ON public.live_sessions(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_sessions_host_status
ON public.live_sessions(host_user_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_sessions_privacy_status
ON public.live_sessions(privacy, status, started_at DESC);

DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON public.live_sessions;
CREATE TRIGGER update_live_sessions_updated_at
BEFORE UPDATE ON public.live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Live sessions can be viewed by host/public/friends" ON public.live_sessions;
CREATE POLICY "Live sessions can be viewed by host/public/friends"
ON public.live_sessions
FOR SELECT
USING (
  host_user_id = auth.uid()
  OR privacy = 'public'
  OR (
    privacy = 'friends'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = host_user_id AND f.friend_id = auth.uid())
          OR
          (f.friend_id = host_user_id AND f.user_id = auth.uid())
        )
    )
  )
);

DROP POLICY IF EXISTS "Hosts can create own live sessions" ON public.live_sessions;
CREATE POLICY "Hosts can create own live sessions"
ON public.live_sessions
FOR INSERT
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "Hosts can update own live sessions" ON public.live_sessions;
CREATE POLICY "Hosts can update own live sessions"
ON public.live_sessions
FOR UPDATE
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

```

### FILE: supabase/migrations/20260211114000_live_recording_e2e.sql
`$ext
-- Agora Cloud Recording E2E for livestream -> feed video

-- Ensure live_sessions structure exists and is compatible with recording workflow.
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel_name text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill owner_id from prior column host_user_id if table already existed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'live_sessions'
      AND column_name = 'host_user_id'
  ) THEN
    UPDATE public.live_sessions
    SET owner_id = host_user_id
    WHERE owner_id IS NULL;
  END IF;
END
$$;

ALTER TABLE public.live_sessions
  ALTER COLUMN channel_name SET NOT NULL,
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_channel_name_unique
ON public.live_sessions(channel_name);

CREATE INDEX IF NOT EXISTS idx_live_sessions_owner_status
ON public.live_sessions(owner_id, status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'live_sessions_status_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_status_check CHECK (status IN ('live', 'ended'));
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON public.live_sessions;
CREATE TRIGGER update_live_sessions_updated_at
BEFORE UPDATE ON public.live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Cloud recording lifecycle table
CREATE TABLE IF NOT EXISTS public.live_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  resource_id text NOT NULL,
  sid text NOT NULL,
  recorder_uid text NOT NULL,
  mode text NOT NULL DEFAULT 'composite' CHECK (mode IN ('composite')),
  status text NOT NULL DEFAULT 'recording' CHECK (status IN ('starting', 'recording', 'stopped', 'failed')),
  storage_vendor integer NOT NULL,
  storage_region integer NOT NULL,
  file_list_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_url text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_live_recordings_live_created
ON public.live_recordings(live_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_recordings_status
ON public.live_recordings(status, created_at DESC);

-- Public feed archive table for recorded live videos
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'video' CHECK (type IN ('video')),
  title text,
  caption text,
  media_key text,
  media_url text,
  source text NOT NULL DEFAULT 'agora_recording' CHECK (source IN ('agora_recording')),
  recording_id uuid NOT NULL REFERENCES public.live_recordings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_posts_media_ref_check CHECK (media_key IS NOT NULL OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_created
ON public.feed_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_posts_author
ON public.feed_posts(author_id, created_at DESC);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

-- live_sessions policies
DROP POLICY IF EXISTS "Live sessions can be viewed by host/public/friends" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts can create own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts can update own live sessions" ON public.live_sessions;

DROP POLICY IF EXISTS "Live sessions read by everyone" ON public.live_sessions;
CREATE POLICY "Live sessions read by everyone"
ON public.live_sessions
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Owners can create live sessions" ON public.live_sessions;
CREATE POLICY "Owners can create live sessions"
ON public.live_sessions
FOR INSERT
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners or admins can update live sessions" ON public.live_sessions;
CREATE POLICY "Owners or admins can update live sessions"
ON public.live_sessions
FOR UPDATE
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- live_recordings policies
DROP POLICY IF EXISTS "Owners or admins can read live recordings" ON public.live_recordings;
CREATE POLICY "Owners or admins can read live recordings"
ON public.live_recordings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_id
      AND (ls.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Owners or admins can create live recordings" ON public.live_recordings;
CREATE POLICY "Owners or admins can create live recordings"
ON public.live_recordings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_id
      AND (ls.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Owners or admins can update live recordings" ON public.live_recordings;
CREATE POLICY "Owners or admins can update live recordings"
ON public.live_recordings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_id
      AND (ls.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = live_id
      AND (ls.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- feed_posts policies
DROP POLICY IF EXISTS "Feed posts are viewable by everyone" ON public.feed_posts;
CREATE POLICY "Feed posts are viewable by everyone"
ON public.feed_posts
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authors or admins can create feed posts" ON public.feed_posts;
CREATE POLICY "Authors or admins can create feed posts"
ON public.feed_posts
FOR INSERT
WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authors or admins can update feed posts" ON public.feed_posts;
CREATE POLICY "Authors or admins can update feed posts"
ON public.feed_posts
FOR UPDATE
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

```

### FILE: supabase/migrations/20260211121000_live_recording_alignment.sql
`$ext
-- Align live_sessions schema to Agora Cloud Recording quickstart requirements

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS host_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agora_uid_host integer,
  ADD COLUMN IF NOT EXISTS recording_uid integer,
  ADD COLUMN IF NOT EXISTS resource_id text,
  ADD COLUMN IF NOT EXISTS sid text,
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS recording_acquired_at timestamptz;

-- Backfill host_user_id from owner_id if present
UPDATE public.live_sessions
SET host_user_id = owner_id
WHERE host_user_id IS NULL
  AND owner_id IS NOT NULL;

ALTER TABLE public.live_sessions
  ALTER COLUMN host_user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'live_sessions_recording_status_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_recording_status_check
      CHECK (recording_status IN ('idle', 'acquired', 'recording', 'stopped', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_status
ON public.live_sessions(recording_status, created_at DESC);

-- Sensitive recording internals should not be selected by generic clients.
REVOKE SELECT(resource_id, sid) ON public.live_sessions FROM anon, authenticated;
GRANT SELECT(resource_id, sid) ON public.live_sessions TO service_role;

-- Public audience can only read active live rows (without sensitive columns).
DROP POLICY IF EXISTS "Live sessions read by everyone" ON public.live_sessions;
CREATE POLICY "Live sessions read active"
ON public.live_sessions
FOR SELECT
USING (
  status = 'live'
  OR host_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Host create/update guard
DROP POLICY IF EXISTS "Owners can create live sessions" ON public.live_sessions;
CREATE POLICY "Hosts can create own sessions"
ON public.live_sessions
FOR INSERT
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners or admins can update live sessions" ON public.live_sessions;
CREATE POLICY "Hosts or admins can update sessions"
ON public.live_sessions
FOR UPDATE
USING (host_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (host_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));


```

### FILE: supabase/migrations/20260215010000_live_stream_mvp_phase0.sql
`$ext
-- Live Streaming MVP (phase 0 + reactions) additive migration

-- 1) live_sessions compatibility: add agora_channel, keep channel_name
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS agora_channel text;

UPDATE public.live_sessions
SET agora_channel = channel_name
WHERE agora_channel IS NULL
  AND channel_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_agora_channel_unique
ON public.live_sessions(agora_channel)
WHERE agora_channel IS NOT NULL;

-- 2) live_messages table
CREATE TABLE IF NOT EXISTS public.live_messages (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_messages_session_created_at
ON public.live_messages(session_id, created_at);

-- 3) live_reactions table
CREATE TABLE IF NOT EXISTS public.live_reactions (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_reactions_session_created_at
ON public.live_reactions(session_id, created_at);

-- 4) RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Live sessions read by everyone" ON public.live_sessions;
CREATE POLICY "Live sessions read by everyone"
ON public.live_sessions
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Host can create live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts can create own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Owners can create live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts can create own sessions" ON public.live_sessions;
CREATE POLICY "Hosts can create own live sessions"
ON public.live_sessions
FOR INSERT
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "Host can update own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts can update own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Owners or admins can update live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Hosts or admins can update sessions" ON public.live_sessions;
CREATE POLICY "Hosts can update own live sessions"
ON public.live_sessions
FOR UPDATE
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view live messages" ON public.live_messages;
CREATE POLICY "Anyone can view live messages"
ON public.live_messages
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert live messages" ON public.live_messages;
CREATE POLICY "Authenticated users can insert live messages"
ON public.live_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view live reactions" ON public.live_reactions;
CREATE POLICY "Anyone can view live reactions"
ON public.live_reactions
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert live reactions" ON public.live_reactions;
CREATE POLICY "Authenticated users can insert live reactions"
ON public.live_reactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 5) Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;
  END IF;
END
$$;

```

### FILE: supabase/migrations/20260215173000_live_replay_backfill.sql
`$ext
-- Backfill playback_url for ended live posts from latest live_recordings.media_url

WITH latest_recordings AS (
  SELECT
    ls.id AS live_id,
    ls.post_id,
    lr.media_url,
    ROW_NUMBER() OVER (PARTITION BY ls.id ORDER BY lr.created_at DESC) AS rn
  FROM public.live_sessions ls
  JOIN public.live_recordings lr ON lr.live_id = ls.id
  WHERE ls.status = 'ended'
    AND ls.post_id IS NOT NULL
    AND lr.media_url IS NOT NULL
    AND lr.media_url <> ''
)
UPDATE public.posts p
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(p.metadata::jsonb, '{}'::jsonb),
    '{playback_url}',
    to_jsonb(lat.media_url),
    true
  ),
  '{live_status}',
  to_jsonb('ended'::text),
  true
)
FROM latest_recordings lat
WHERE lat.rn = 1
  AND p.id = lat.post_id
  AND (
    (COALESCE(p.metadata::jsonb, '{}'::jsonb) ->> 'playback_url') IS NULL
    OR (COALESCE(p.metadata::jsonb, '{}'::jsonb) ->> 'playback_url') = ''
  );

WITH latest_recordings AS (
  SELECT
    ls.id AS live_id,
    lr.media_url,
    ROW_NUMBER() OVER (PARTITION BY ls.id ORDER BY lr.created_at DESC) AS rn
  FROM public.live_sessions ls
  JOIN public.live_recordings lr ON lr.live_id = ls.id
  WHERE ls.status = 'ended'
    AND lr.media_url IS NOT NULL
    AND lr.media_url <> ''
)
UPDATE public.live_sessions ls
SET recording_status = 'stopped',
    updated_at = now()
FROM latest_recordings lat
WHERE lat.rn = 1
  AND ls.id = lat.live_id
  AND COALESCE(ls.recording_status, 'idle') <> 'stopped';

```

### FILE: supabase/migrations/20260215194000_live_recording_rpc_no_service_role.sql
`$ext
-- Live recording no-service-role architecture for Lovable Cloud

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_error text,
  ADD COLUMN IF NOT EXISTS last_worker_response jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.live_recordings
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE public.live_recordings
  DROP CONSTRAINT IF EXISTS live_recordings_status_check;

ALTER TABLE public.live_recordings
  ADD CONSTRAINT live_recordings_status_check
  CHECK (status IN ('starting', 'recording', 'stopping', 'processing', 'ready', 'stopped', 'failed'));

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_recording_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_recording_status_check
  CHECK (recording_status IN ('idle', 'acquired', 'acquiring', 'starting', 'recording', 'stopping', 'processing', 'ready', 'stopped', 'failed'));

CREATE OR REPLACE FUNCTION public.get_live_recording_context(_session_id uuid)
RETURNS TABLE (
  id uuid,
  host_user_id uuid,
  channel_name text,
  agora_channel text,
  resource_id text,
  sid text,
  recording_uid integer,
  recording_status text,
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_ready_at timestamptz,
  recording_error text,
  last_worker_response jsonb,
  post_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.host_user_id,
    ls.channel_name,
    ls.agora_channel,
    ls.resource_id,
    ls.sid,
    ls.recording_uid,
    ls.recording_status,
    ls.recording_started_at,
    ls.recording_stopped_at,
    ls.recording_ready_at,
    ls.recording_error,
    COALESCE(ls.last_worker_response, '{}'::jsonb),
    ls.post_id
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_recording_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_recording_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_live_recording_state(
  _session_id uuid,
  _recording_status text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recording_uid integer DEFAULT NULL,
  _recording_started_at timestamptz DEFAULT NULL,
  _recording_stopped_at timestamptz DEFAULT NULL,
  _recording_ready_at timestamptz DEFAULT NULL,
  _recording_error text DEFAULT NULL,
  _last_worker_response jsonb DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.live_sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = _session_id
      AND (
        ls.host_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = COALESCE(_recording_status, ls.recording_status),
    resource_id = COALESCE(_resource_id, ls.resource_id),
    sid = COALESCE(_sid, ls.sid),
    recording_uid = COALESCE(_recording_uid, ls.recording_uid),
    recording_started_at = COALESCE(_recording_started_at, ls.recording_started_at),
    recording_stopped_at = COALESCE(_recording_stopped_at, ls.recording_stopped_at),
    recording_ready_at = COALESCE(_recording_ready_at, ls.recording_ready_at),
    recording_error = COALESCE(_recording_error, ls.recording_error),
    last_worker_response = COALESCE(_last_worker_response, ls.last_worker_response),
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_live_recording_state(uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_live_recording_state(uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_live_recording_row(
  _session_id uuid,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recorder_uid text DEFAULT NULL,
  _status text DEFAULT NULL,
  _file_list_json jsonb DEFAULT NULL,
  _media_url text DEFAULT NULL,
  _raw_response jsonb DEFAULT NULL,
  _stopped_at timestamptz DEFAULT NULL,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_recordings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _latest_id uuid;
  _row public.live_recordings;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lr.id INTO _latest_id
  FROM public.live_recordings lr
  WHERE lr.live_id = _session_id
  ORDER BY lr.created_at DESC
  LIMIT 1;

  IF _latest_id IS NULL THEN
    INSERT INTO public.live_recordings (
      live_id,
      resource_id,
      sid,
      recorder_uid,
      status,
      file_list_json,
      media_url,
      raw_response,
      stopped_at,
      duration_seconds,
      thumbnail_url
    ) VALUES (
      _session_id,
      _resource_id,
      _sid,
      _recorder_uid,
      COALESCE(_status, 'recording'),
      COALESCE(_file_list_json, '[]'::jsonb),
      _media_url,
      _raw_response,
      _stopped_at,
      _duration_seconds,
      _thumbnail_url
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.live_recordings lr
    SET
      resource_id = COALESCE(_resource_id, lr.resource_id),
      sid = COALESCE(_sid, lr.sid),
      recorder_uid = COALESCE(_recorder_uid, lr.recorder_uid),
      status = COALESCE(_status, lr.status),
      file_list_json = COALESCE(_file_list_json, lr.file_list_json),
      media_url = COALESCE(_media_url, lr.media_url),
      raw_response = COALESCE(_raw_response, lr.raw_response),
      stopped_at = COALESCE(_stopped_at, lr.stopped_at),
      duration_seconds = COALESCE(_duration_seconds, lr.duration_seconds),
      thumbnail_url = COALESCE(_thumbnail_url, lr.thumbnail_url)
    WHERE lr.id = _latest_id
    RETURNING lr.* INTO _row;
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_live_recording_row(uuid, text, text, text, text, jsonb, text, jsonb, timestamptz, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_live_recording_row(uuid, text, text, text, text, jsonb, text, jsonb, timestamptz, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_live_replay_to_post(
  _session_id uuid,
  _playback_url text,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _metadata jsonb;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _live.post_id IS NOT NULL THEN
    SELECT COALESCE(p.metadata::jsonb, '{}'::jsonb)
    INTO _metadata
    FROM public.posts p
    WHERE p.id = _live.post_id;

    _metadata := _metadata
      || jsonb_build_object('playback_url', _playback_url)
      || jsonb_build_object('live_status', 'ended')
      || jsonb_build_object('replay_ready_at', now());

    IF _duration_seconds IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('duration_seconds', _duration_seconds);
    END IF;

    IF _thumbnail_url IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('thumbnail_url', _thumbnail_url);
    END IF;

    UPDATE public.posts p
    SET
      metadata = _metadata,
      video_url = COALESCE(_playback_url, p.video_url)
    WHERE p.id = _live.post_id;
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN 'failed' ELSE 'ready' END,
    recording_ready_at = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN ls.recording_ready_at ELSE now() END,
    recording_error = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN COALESCE(ls.recording_error, 'Playback URL missing') ELSE NULL END,
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _live;

  RETURN _live;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_live_replay_to_post(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_live_replay_to_post(uuid, text, integer, text) TO authenticated;

```

### FILE: supabase/migrations/20260217153000_live_sessions_rls_additive.sql
`$ext
-- Additive RLS alignment for live_sessions (no service role flow)

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS host_user_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS resource_id text,
  ADD COLUMN IF NOT EXISTS sid text,
  ADD COLUMN IF NOT EXISTS recording_resource_id text,
  ADD COLUMN IF NOT EXISTS recording_sid text,
  ADD COLUMN IF NOT EXISTS recording_files jsonb;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Backfill new columns from existing recording columns when available
UPDATE public.live_sessions
SET
  host_user_id = COALESCE(host_user_id, owner_id),
  owner_id = COALESCE(owner_id, host_user_id),
  recording_resource_id = COALESCE(recording_resource_id, resource_id),
  recording_sid = COALESCE(recording_sid, sid),
  recording_files = COALESCE(recording_files, '[]'::jsonb)
WHERE host_user_id IS NULL
   OR owner_id IS NULL
   OR recording_resource_id IS NULL
   OR recording_sid IS NULL
   OR recording_files IS NULL;

ALTER TABLE public.live_sessions
  ALTER COLUMN recording_files SET DEFAULT '[]'::jsonb;

-- Keep select behavior public for live/ended sessions
DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Live sessions read by everyone" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
ON public.live_sessions
FOR SELECT
TO anon, authenticated
USING (status in ('live','ended'));

-- Replace insert/update policies with host/owner self-write only
DROP POLICY IF EXISTS "Hosts can create own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Owners can create live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "host can insert own live session" ON public.live_sessions;
CREATE POLICY "host can insert own live session"
ON public.live_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
);

DROP POLICY IF EXISTS "Hosts can update own live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Owners or admins can update live sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "host can update own live session" ON public.live_sessions;
CREATE POLICY "host can update own live session"
ON public.live_sessions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
)
WITH CHECK (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
);

```

### FILE: worker/package.json
`$ext
{
  "name": "fun-agora-rtc-token",
  "version": "1.0.0",
  "description": "Cloudflare Worker for generating Agora RTC tokens with userAccount support",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "dependencies": {
    "agora-token": "^2.0.3"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241112.0",
    "typescript": "^5.6.3",
    "wrangler": "^3.91.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}

```

### FILE: worker/README.md
`$ext
# Fun Agora RTC Token Service

## Cloud Recording env (required)

Set these secrets for `/recording/acquire|start|stop|query`:

- `AGORA_APP_ID`
- `AGORA_CUSTOMER_ID`
- `AGORA_CUSTOMER_SECRET`
- `API_KEY`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_REGION`
- `R2_ENDPOINT` (e.g. `https://<accountid>.r2.cloudflarestorage.com`)
- `RECORDING_PLAYBACK_BASE_URL`

Cloudflare Worker Ä‘á»ƒ generate Agora RTC tokens cho á»©ng dá»¥ng Fun Profile.

## đŸ€ Quick Start

### 1. CĂ i Ä‘áº·t dependencies

```bash
cd worker
npm install
```

### 2. Cáº¥u hĂ¬nh Secrets

```bash
# Agora credentials (láº¥y tá»« Agora Console)
wrangler secret put AGORA_APP_ID
# Nháº­p App ID khi Ä‘Æ°á»£c há»i

wrangler secret put AGORA_APP_CERTIFICATE
# Nháº­p App Certificate khi Ä‘Æ°á»£c há»i

# API key Ä‘á»ƒ báº£o vá»‡ endpoint (táº¡o má»™t key máº¡nh 32+ kĂ½ tá»±)
wrangler secret put API_KEY
# Nháº­p API key khi Ä‘Æ°á»£c há»i
```

### 3. Local Development

```bash
npm run dev
```

Worker sáº½ cháº¡y táº¡i `http://localhost:8787`

### 4. Deploy to Production

```bash
npm run deploy
```

Worker sáº½ Ä‘Æ°á»£c deploy táº¡i: `https://fun-agora-rtc-token.<your-subdomain>.workers.dev`

---

## đŸ“¡ API Reference

### GET /health

Health check endpoint.

**Response:**
```json
{
  "ok": true,
  "service": "fun-agora-rtc-token",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /config

Tráº£ vá» public configuration (khĂ´ng bao gá»“m secrets).

**Response:**
```json
{
  "appId": "your_app_id",
  "allowedOrigin": "https://angelquangvu-funprofile.lovable.app",
  "defaultTtlSeconds": 3600
}
```

### POST /token/rtc

Generate RTC token cho Agora Video Calling.

**Headers:**
```
Content-Type: application/json
x-api-key: <YOUR_API_KEY>
```

**Request Body:**
```json
{
  "channel": "my-channel",
  "userAccount": "user-123",
  "role": "publisher",
  "expireSeconds": 3600
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| channel | string | Yes | Channel name (1-64 chars, alphanumeric, _, -) |
| userAccount | string | Yes | User account/UID (1-128 chars) |
| role | string | No | "publisher" (default) or "subscriber" |
| expireSeconds | number | No | Token TTL in seconds (60-86400, default: 3600) |

**Success Response (200):**
```json
{
  "appId": "your_app_id",
  "token": "007eJxTYBBx...",
  "channel": "my-channel",
  "userAccount": "user-123",
  "role": "publisher",
  "expireAt": 1705316400
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Invalid request (missing/invalid fields) |
| 401 | Missing or invalid API key |
| 403 | Origin not allowed |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## đŸ”Œ Frontend Integration

### Trong Lovable App (React/TypeScript)

```typescript
// src/utils/agoraToken.ts

const AGORA_WORKER_URL = 'https://fun-agora-rtc-token.<your-subdomain>.workers.dev';
const API_KEY = import.meta.env.VITE_AGORA_WORKER_API_KEY; // LÆ°u trong .env

export interface AgoraTokenResponse {
  appId: string;
  token: string;
  channel: string;
  userAccount: string;
  role: string;
  expireAt: number;
}

export async function getAgoraToken(
  channel: string,
  userAccount: string,
  role: 'publisher' | 'subscriber' = 'publisher'
): Promise<AgoraTokenResponse> {
  const response = await fetch(`${AGORA_WORKER_URL}/token/rtc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      channel,
      userAccount,
      role,
      expireSeconds: 3600,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get Agora token');
  }

  return response.json();
}
```

### Sá»­ dá»¥ng vá»›i Agora Web SDK

```typescript
import AgoraRTC from 'agora-rtc-sdk-ng';
import { getAgoraToken } from './utils/agoraToken';

async function joinChannel(channelName: string, userId: string) {
  // 1. Get token from worker
  const { appId, token, userAccount } = await getAgoraToken(channelName, userId);

  // 2. Create Agora client
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  // 3. Join channel with string userAccount
  await client.join(appId, channelName, token, userAccount);

  // 4. Create and publish tracks
  const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
  await client.publish([audioTrack, videoTrack]);

  console.log('Joined channel successfully!');
}
```

---

## đŸ”’ Security

### CORS
- Chá»‰ cho phĂ©p requests tá»«: `https://angelquangvu-funprofile.lovable.app`

### API Key
- Báº¯t buá»™c header `x-api-key` cho endpoint `/token/rtc`
- Khuyáº¿n nghá»‹: Sá»­ dá»¥ng key máº¡nh (32+ kĂ½ tá»± random)

### Rate Limiting
- Best-effort in-memory rate limit: 60 requests/minute per IP
- **Production**: NĂªn enable Cloudflare Rate Limiting Rules

### Secrets
- `AGORA_APP_CERTIFICATE` khĂ´ng bao giá» Ä‘Æ°á»£c tráº£ vá» cho client
- Chá»‰ lÆ°u trá»¯ trong Cloudflare Secrets

---

## đŸ›  Configuration

### wrangler.toml

| Variable | Description |
|----------|-------------|
| ALLOWED_ORIGIN | Domain Ä‘Æ°á»£c phĂ©p gá»i API |
| TOKEN_TTL_SECONDS | Default TTL cho token (giĂ¢y) |

### Secrets (wrangler secret put)

| Secret | Description |
|--------|-------------|
| AGORA_APP_ID | Agora Application ID |
| AGORA_APP_CERTIFICATE | Agora App Certificate |
| API_KEY | API key Ä‘á»ƒ authenticate requests |

---

## đŸ“ Monitoring

### View Logs

```bash
npm run tail
```

### Metrics

Truy cáº­p Cloudflare Dashboard > Workers & Pages > fun-agora-rtc-token > Metrics

---

## đŸ§ª Testing with cURL

### Health Check
```bash
curl https://fun-agora-rtc-token.<subdomain>.workers.dev/health
```

### Get Config
```bash
curl https://fun-agora-rtc-token.<subdomain>.workers.dev/config
```

### Generate Token
```bash
curl -X POST https://fun-agora-rtc-token.<subdomain>.workers.dev/token/rtc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Origin: https://angelquangvu-funprofile.lovable.app" \
  -d '{
    "channel": "test-channel",
    "userAccount": "user-123",
    "role": "publisher",
    "expireSeconds": 3600
  }'
```

---

## đŸ“ License

Private - Fun Profile Team

```

### FILE: worker/wrangler.toml
`$ext
# Cloudflare Worker Configuration
# Agora RTC Token Service for Fun Profile

name = "fun-agora-rtc-token"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# Environment variables (non-sensitive)
[vars]
ALLOWED_ORIGINS = "https://angelquangvu-funprofile.lovable.app,https://id-preview--7ea0fa7c-4fc2-4fc1-9ff9-fdfadf138a52.lovable.app,https://7ea0fa7c-4fc2-4fc1-9ff9-fdfadf138a52.lovableproject.com"
TOKEN_TTL_SECONDS = "3600"
# Required for /upload/live-recording JWT verification
# SUPABASE_URL = "https://<project-ref>.supabase.co"
# SUPABASE_ANON_KEY = "<anon-key>"

# Secrets (set via `wrangler secret put <NAME>`)
# Token service:
# - AGORA_APP_ID
# - AGORA_APP_CERTIFICATE
# - API_KEY
# Cloud Recording:
# - AGORA_CUSTOMER_ID
# - AGORA_CUSTOMER_SECRET
# Preferred storage envs:
# - REC_STORAGE_BUCKET
# - REC_STORAGE_ACCESS_KEY
# - REC_STORAGE_SECRET_KEY
# - REC_STORAGE_REGION
# - REC_R2_ENDPOINT
# - PUBLIC_MEDIA_BASE_URL
# - REC_ENABLE_HEAD_FALLBACK (optional: "true"/"false")
# Backward-compatible fallback envs:
# - R2_ACCESS_KEY_ID
# - R2_SECRET_ACCESS_KEY
# - R2_BUCKET
# - R2_REGION
# - R2_ENDPOINT
# - R2_ACCOUNT_ID (optional)
# - RECORDING_PLAYBACK_BASE_URL
# - SUPABASE_URL
# - SUPABASE_ANON_KEY

[[r2_buckets]]
binding = "RECORDINGS_BUCKET"
bucket_name = "livestreampro"

# Observability
[observability]
enabled = true

```

### FILE: worker/tsconfig.json
`$ext
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}

```

### FILE: worker/src/cors.ts
`$ext
/**
 * CORS Middleware for Cloudflare Worker
 * Supports multiple allowed origins (comma-separated)
 */

export interface Env {
  ALLOWED_ORIGINS: string; // Comma-separated list of allowed origins
  TOKEN_TTL_SECONDS: string;
  AGORA_APP_ID: string;
  AGORA_APP_CERTIFICATE: string;
  API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RECORDINGS_BUCKET: R2Bucket;
  // Agora REST API (Cloud Recording)
  AGORA_CUSTOMER_ID: string;
  AGORA_CUSTOMER_SECRET: string;
  // R2 (S3-compatible storage)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_REGION: string;
  R2_ENDPOINT: string;
  R2_ACCOUNT_ID?: string;
  // New recording env names (preferred)
  REC_STORAGE_BUCKET?: string;
  REC_STORAGE_ACCESS_KEY?: string;
  REC_STORAGE_SECRET_KEY?: string;
  REC_STORAGE_REGION?: string;
  REC_R2_ENDPOINT?: string;
  PUBLIC_MEDIA_BASE_URL?: string;
  REC_ENABLE_HEAD_FALLBACK?: string;
  // Playback
  RECORDING_PLAYBACK_BASE_URL: string;
}

/**
 * Parse allowed origins from env (comma-separated)
 */
function parseAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
}

/**
 * Check if origin is in allowed list
 */
function isOriginAllowed(origin: string, env: Env): boolean {
  const allowedOrigins = parseAllowedOrigins(env);
  return allowedOrigins.includes(origin);
}

/**
 * Generate CORS headers for responses
 * Echoes back the allowed origin for proper CORS support
 */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-correlation-id, Authorization, X-Stream-Id, X-Filename',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight and origin validation
 * Returns Response if request should be blocked or is preflight
 * Returns { origin } if request should continue
 */
export function handleCors(request: Request, env: Env): Response | { origin: string } {
  const origin = request.headers.get('Origin');
  
  // For non-browser requests (no Origin header), allow if it's a health check
  if (!origin) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/config') {
      return { origin: '*' }; // Allow health/config checks without origin
    }
    // For token requests, origin is required
    return new Response(
      JSON.stringify({ error: 'Origin header required' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Check if origin is allowed
  if (!isOriginAllowed(origin, env)) {
    return new Response(
      JSON.stringify({ error: 'Origin not allowed' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Handle OPTIONS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Request is allowed, return origin for use in response headers
  return { origin };
}

/**
 * Add CORS headers to a response
 */
export function addCorsHeaders(response: Response, origin: string): Response {
  const newHeaders = new Headers(response.headers);
  const cors = corsHeaders(origin);
  
  for (const [key, value] of Object.entries(cors)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

```

### FILE: worker/src/index.ts
`$ext
/**
 * Cloudflare Worker - Agora RTC Token Service
 * 
 * Generates secure RTC tokens for Agora Video Calling using userAccount (string UID)
 * 
 * Endpoints:
 * - GET /health - Health check
 * - GET /config - Public configuration
 * - POST /token/rtc - Generate RTC token
 */

import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { Env, handleCors, corsHeaders } from './cors';
import { validateTokenRequest } from './validate';
import { handleRecordingAcquire, handleRecordingQuery, handleRecordingStart, handleRecordingStop } from './recording';
import { handleLiveRecordingUpload } from './upload';

// Re-export Env type
export type { Env };

// Rate limiting: in-memory store (best-effort, resets on worker restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

/**
 * Check rate limit for an IP address
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // Start new window
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }

  entry.count++;
  return true;
}

/**
 * Clean up expired rate limit entries (run periodically)
 */
function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

/**
 * Generate a unique request ID for logging
 */
function generateRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Create a JSON error response
 */
function errorResponse(message: string, status: number, origin: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    }
  );
}

/**
 * Create a JSON success response
 */
function jsonResponse(data: Record<string, unknown>, origin: string): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    }
  );
}

function roleToWorkerRole(role: unknown): 'publisher' | 'subscriber' {
  if (role === 'host' || role === 'publisher') return 'publisher';
  return 'subscriber';
}

/**
 * Handle GET /health endpoint
 */
function handleHealth(origin: string): Response {
  return jsonResponse({
    ok: true,
    service: 'fun-agora-rtc-token',
    timestamp: new Date().toISOString(),
  }, origin);
}

/**
 * Handle GET /config endpoint
 */
function handleConfig(env: Env, origin: string): Response {
  return jsonResponse({
    appId: env.AGORA_APP_ID,
    allowedOrigins: env.ALLOWED_ORIGINS,
    defaultTtlSeconds: parseInt(env.TOKEN_TTL_SECONDS) || 3600,
  }, origin);
}

/**
 * Handle POST /token/rtc endpoint
 */
async function handleTokenRequest(request: Request, env: Env, requestId: string, origin: string): Promise<Response> {
  // Check API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== env.API_KEY) {
    console.log(`[${requestId}] Invalid or missing API key`);
    return errorResponse('Missing or invalid API key', 401, origin);
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON in request body', 400, origin);
  }

  // Validate request
  const defaultTtl = parseInt(env.TOKEN_TTL_SECONDS) || 3600;
  const validation = validateTokenRequest(body, defaultTtl);

  if (!validation.valid || !validation.data) {
    return errorResponse(validation.error || 'Invalid request', 400, origin);
  }

  const { channel, userAccount, role, expireSeconds } = validation.data;

  try {
    // Calculate expiration timestamp
    const expireAt = Math.floor(Date.now() / 1000) + expireSeconds;

    // Generate RTC token using agora-token library
    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      env.AGORA_APP_ID,
      env.AGORA_APP_CERTIFICATE,
      channel,
      userAccount,
      agoraRole,
      expireSeconds,
      expireSeconds
    );

    console.log(`[${requestId}] Token generated for channel: ${channel}, userAccount: ${userAccount.substring(0, 8)}...`);

    return jsonResponse({
      appId: env.AGORA_APP_ID,
      token,
      channel,
      userAccount,
      role,
      expireAt,
    }, origin);

  } catch (error) {
    console.error(`[${requestId}] Token generation error:`, error instanceof Error ? error.message : 'Unknown error');
    return errorResponse('Internal server error', 500, origin);
  }
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = generateRequestId();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Cleanup rate limit map periodically (1% chance per request)
    if (Math.random() < 0.01) {
      cleanupRateLimitMap();
    }

    console.log(`[${requestId}] ${method} ${path}`);

    // Handle CORS - returns Response if blocked/preflight, or { origin } if allowed
    const corsResult = handleCors(request, env);
    if (corsResult instanceof Response) {
      return corsResult;
    }
    
    const { origin } = corsResult;

    // Rate limiting (get IP from CF headers)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      console.log(`[${requestId}] Rate limit exceeded for IP: ${clientIP.substring(0, 10)}...`);
      return errorResponse('Rate limit exceeded. Try again later.', 429, origin);
    }

    // Route handling
    try {
      // GET /health
      if (method === 'GET' && path === '/health') {
        return handleHealth(origin);
      }

      // GET /config
      if (method === 'GET' && path === '/config') {
        return handleConfig(env, origin);
      }

      // POST /token/rtc
      if (method === 'POST' && path === '/token/rtc') {
        return await handleTokenRequest(request, env, requestId, origin);
      }

      // POST /api/agora/rtc-token (alias)
      if (method === 'POST' && path === '/api/agora/rtc-token') {
        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON in request body', 400, origin);
        }

        const mappedBody = {
          channel: body?.channelName,
          userAccount: body?.uid ? String(body.uid) : '',
          role: roleToWorkerRole(body?.role),
          expireSeconds: body?.expireSeconds,
        };

        const nextReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(mappedBody),
        });
        const tokenRes = await handleTokenRequest(nextReq, env, requestId, origin);
        if (!tokenRes.ok) return tokenRes;
        const payload: any = await tokenRes.clone().json().catch(() => ({}));
        return jsonResponse(
          {
            appId: payload?.appId,
            token: payload?.token,
            uid: payload?.userAccount,
            channel: payload?.channel,
            expireAt: payload?.expireAt,
          },
          origin
        );
      }

      // POST /recording/acquire
      if (method === 'POST' && path === '/recording/acquire') {
        return await handleRecordingAcquire(request, env, requestId, origin);
      }

      // POST /recording/start
      if (method === 'POST' && path === '/recording/start') {
        return await handleRecordingStart(request, env, requestId, origin);
      }

      // POST /api/recording/start and /api/agora/recording/start (acquire -> start)
      if (method === 'POST' && (path === '/api/recording/start' || path === '/api/agora/recording/start')) {
        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON in request body', 400, origin);
        }

        const channelName = body?.channelName;
        const recordingUid = body?.recorderUid
          ? String(body.recorderUid)
          : (body?.recordingUid ? String(body.recordingUid) : (body?.uid ? String(body.uid) : ''));
        const token = body?.token;
        const sessionId = body?.sessionId;

        if (!channelName || !recordingUid || !token || !sessionId) {
          return errorResponse('channelName, recorderUid, token, sessionId are required', 400, origin);
        }

        const acquireReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            channelName,
            uid: recordingUid,
            sessionId,
          }),
        });

        const acquireRes = await handleRecordingAcquire(acquireReq, env, requestId, origin);
        if (!acquireRes.ok) return acquireRes;
        const acquirePayload: any = await acquireRes.clone().json().catch(() => ({}));
        const resourceId = acquirePayload?.data?.resourceId;
        if (!resourceId) {
          return errorResponse('Acquire step did not return resourceId', 502, origin);
        }

        const startReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            channelName,
            uid: recordingUid,
            token,
            sessionId,
            resourceId,
          }),
        });

        const startRes = await handleRecordingStart(startReq, env, requestId, origin);
        if (!startRes.ok) return startRes;
        const startPayload: any = await startRes.clone().json().catch(() => ({}));
        const sid = startPayload?.data?.sid;
        if (!sid) {
          return errorResponse('Start step did not return sid', 502, origin);
        }

        return jsonResponse(
          {
            resourceId,
            sid,
          },
          origin
        );
      }

      // POST /recording/stop
      if (method === 'POST' && path === '/recording/stop') {
        return await handleRecordingStop(request, env, requestId, origin);
      }

      // POST /api/recording/stop and /api/agora/recording/stop (alias)
      if (method === 'POST' && (path === '/api/recording/stop' || path === '/api/agora/recording/stop')) {
        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON in request body', 400, origin);
        }

        const stopReq = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            channelName: body?.channelName,
            recordingUid: body?.recorderUid
              ? String(body.recorderUid)
              : (body?.recordingUid ? String(body.recordingUid) : (body?.uid ? String(body.uid) : '')),
            resourceId: body?.resourceId,
            sid: body?.sid,
            sessionId: body?.sessionId,
          }),
        });

        const stopRes = await handleRecordingStop(stopReq, env, requestId, origin);
        if (!stopRes.ok) return stopRes;
        const stopPayload: any = await stopRes.clone().json().catch(() => ({}));
        const canonical = stopPayload?.data ?? {};

        return jsonResponse(canonical, origin);
      }

      // GET /recording/query
      if (method === 'GET' && path === '/recording/query') {
        return await handleRecordingQuery(request, env, requestId, origin);
      }

      // GET /api/recording/query and /api/agora/recording/query (alias)
      if (method === 'GET' && (path === '/api/recording/query' || path === '/api/agora/recording/query')) {
        const targetUrl = new URL(request.url);
        const sourceUrl = new URL(request.url);
        targetUrl.pathname = '/recording/query';
        targetUrl.search = sourceUrl.search;
        const queryReq = new Request(targetUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        });
        const queryRes = await handleRecordingQuery(queryReq, env, requestId, origin);
        if (!queryRes.ok) return queryRes;
        const queryPayload: any = await queryRes.clone().json().catch(() => ({}));
        return jsonResponse(queryPayload?.data ?? {}, origin);
      }

      // POST /upload/live-recording
      if (method === 'POST' && path === '/upload/live-recording') {
        return await handleLiveRecordingUpload(request, env, requestId, origin);
      }

      // 404 for unknown routes
      return errorResponse('Not found', 404, origin);

    } catch (error) {
      console.error(`[${requestId}] Unhandled error:`, error instanceof Error ? error.message : 'Unknown error');
      return errorResponse('Internal server error', 500, origin);
    }
  },
};

```

### FILE: worker/src/recording.ts
`$ext
/**
 * Agora Cloud Recording handlers for Cloudflare Worker.
 * Routes: /recording/acquire, /recording/start, /recording/stop, /recording/query
 */

import { Env, corsHeaders } from './cors';

interface AcquireRequest {
  channelName: string;
  uid: string;
  sessionId: string;
}

interface StartRequest {
  channelName: string;
  uid: string;
  token: string;
  sessionId: string;
  resourceId: string;
}

interface StopRequest {
  channelName: string;
  recordingUid: string;
  resourceId: string;
  sid: string;
  sessionId?: string;
}

type RecordingLifecycleStatus = 'ready' | 'pending' | 'failed';

interface NormalizedRecordingResult {
  status: RecordingLifecycleStatus;
  uploadingStatus: string | null;
  files: unknown[];
  mediaKey: string | null;
  mediaUrl: string | null;
  message?: string;
  rawAgoraResponse: unknown;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

interface RecordingRuntimeConfig {
  storageBucket: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storageRegion: string;
  storageEndpoint: string;
  publicMediaBaseUrl: string;
  enableHeadFallback: boolean;
}

interface FileLike {
  fileName?: string;
  filename?: string;
  name?: string;
  objectName?: string;
  uploadingStatus?: string;
  status?: string;
}

function getEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getRuntimeConfig(env: Env): RecordingRuntimeConfig {
  const storageBucket = getEnv(env, 'REC_STORAGE_BUCKET') || getEnv(env, 'R2_BUCKET');
  const storageAccessKey = getEnv(env, 'REC_STORAGE_ACCESS_KEY') || getEnv(env, 'R2_ACCESS_KEY_ID');
  const storageSecretKey = getEnv(env, 'REC_STORAGE_SECRET_KEY') || getEnv(env, 'R2_SECRET_ACCESS_KEY');
  const storageRegion = getEnv(env, 'REC_STORAGE_REGION') || getEnv(env, 'R2_REGION') || 'auto';
  const storageEndpoint = getEnv(env, 'REC_R2_ENDPOINT') || getEnv(env, 'R2_ENDPOINT');
  const publicMediaBaseUrl = getEnv(env, 'PUBLIC_MEDIA_BASE_URL') || getEnv(env, 'RECORDING_PLAYBACK_BASE_URL');
  const enableHeadFallback = (getEnv(env, 'REC_ENABLE_HEAD_FALLBACK') || '').toLowerCase() === 'true';

  return {
    storageBucket,
    storageAccessKey,
    storageSecretKey,
    storageRegion,
    storageEndpoint,
    publicMediaBaseUrl,
    enableHeadFallback,
  };
}

function requireEnv(env: Env, requestId: string, origin: string): Response | null {
  const config = getRuntimeConfig(env);
  const required: Array<[string, string]> = [
    ['AGORA_APP_ID', getEnv(env, 'AGORA_APP_ID')],
    ['AGORA_CUSTOMER_ID', getEnv(env, 'AGORA_CUSTOMER_ID')],
    ['AGORA_CUSTOMER_SECRET', getEnv(env, 'AGORA_CUSTOMER_SECRET')],
    ['REC_STORAGE_BUCKET|R2_BUCKET', config.storageBucket],
    ['REC_STORAGE_ACCESS_KEY|R2_ACCESS_KEY_ID', config.storageAccessKey],
    ['REC_STORAGE_SECRET_KEY|R2_SECRET_ACCESS_KEY', config.storageSecretKey],
    ['REC_R2_ENDPOINT|R2_ENDPOINT', config.storageEndpoint],
    ['PUBLIC_MEDIA_BASE_URL|RECORDING_PLAYBACK_BASE_URL', config.publicMediaBaseUrl],
  ];

  for (const [name, value] of required) {
    if (!value) {
      return errorJson(requestId, 'missing_env', `Missing required env: ${name}`, 500, origin);
    }
  }
  return null;
}

function basicAuth(env: Env): string {
  return `Basic ${btoa(`${env.AGORA_CUSTOMER_ID}:${env.AGORA_CUSTOMER_SECRET}`)}`;
}

function validateApiKey(request: Request, env: Env): boolean {
  const key = request.headers.get('x-api-key');
  return !!key && key === env.API_KEY;
}

function successJson(requestId: string, data: Record<string, unknown>, origin: string): Response {
  return new Response(
    JSON.stringify({ ok: true, requestId, data }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    }
  );
}

function errorJson(
  requestId: string,
  code: string,
  message: string,
  status: number,
  origin: string,
  detail?: unknown,
  agoraCode?: unknown,
  agoraMessage?: unknown
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      requestId,
      error: {
        code,
        message,
        agoraCode,
        agoraMessage,
        detail,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    }
  );
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchAgora(
  requestId: string,
  env: Env,
  method: 'GET' | 'POST',
  path: string,
  payload?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const url = `https://api.agora.io/v1/apps/${env.AGORA_APP_ID}${path}`;
  console.log(`[${requestId}] agora ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth(env),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const text = await response.text();
  const body = parseJsonSafe(text);

  const code = (body as { code?: unknown } | null)?.code;
  console.log(`[${requestId}] agora status=${response.status} code=${code ?? 'n/a'}`);
  return { status: response.status, body };
}

function parseFileList(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        return [{ fileName: trimmed }];
      }
      return [];
    }
  }
  if (typeof raw === 'object') {
    const nested = raw as Record<string, unknown>;
    const candidates = [nested.fileList, nested.files, nested.file_list];
    for (const candidate of candidates) {
      const parsed = parseFileList(candidate);
      if (parsed.length > 0) return parsed;
    }
  }
  return [];
}

function normalizeStatus(status: unknown): string | null {
  if (typeof status !== 'string') return null;
  const trimmed = status.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function extractFileName(file: unknown): string | null {
  if (!file || typeof file !== 'object') return null;
  const candidate = file as FileLike;
  const fileName = candidate.fileName || candidate.filename || candidate.name || candidate.objectName;
  if (!fileName || typeof fileName !== 'string') return null;
  const trimmed = fileName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractFileStatus(file: unknown): string | null {
  if (!file || typeof file !== 'object') return null;
  const candidate = file as FileLike;
  return normalizeStatus(candidate.uploadingStatus || candidate.status);
}

function selectPlayableFileName(fileList: unknown[]): string | null {
  const namedFiles = fileList
    .map(extractFileName)
    .filter((fileName): fileName is string => !!fileName);

  if (namedFiles.length === 0) return null;

  const lower = namedFiles.map((fileName) => ({ fileName, lower: fileName.toLowerCase() }));
  const hls = lower.find((entry) => entry.lower.endsWith('.m3u8'));
  const mp4 = lower.find((entry) => entry.lower.endsWith('.mp4'));
  return hls?.fileName || mp4?.fileName || namedFiles[0];
}

function buildMediaKey(fileName: string | null, sessionId?: string): string | null {
  if (!fileName) return null;
  const trimmed = fileName.replace(/^\/+/, '');
  if (!trimmed) return null;

  if (trimmed.includes('/')) {
    return trimmed;
  }

  if (sessionId) {
    return `funprofile/live/${sessionId}/${trimmed}`;
  }

  return trimmed;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildMediaUrl(mediaKey: string | null, publicBaseUrl: string): string | null {
  if (!mediaKey || !publicBaseUrl) return null;
  try {
    const base = publicBaseUrl.replace(/\/+$/, '');
    const baseUrl = new URL(base);
    const basePath = baseUrl.pathname.replace(/^\/+|\/+$/g, '');
    let keyPath = mediaKey.replace(/^\/+/, '');

    if (basePath && keyPath.startsWith(`${basePath}/`)) {
      keyPath = keyPath.slice(basePath.length + 1);
    }

    return `${base}/${encodePath(keyPath)}`;
  } catch {
    return null;
  }
}

function resolveOverallStatus(globalUploadingStatus: string | null, fileStatuses: string[]): RecordingLifecycleStatus {
  if (globalUploadingStatus === 'uploaded') {
    if (fileStatuses.length === 0) return 'ready';
    return fileStatuses.every((status) => status === 'uploaded') ? 'ready' : 'pending';
  }

  if (globalUploadingStatus && globalUploadingStatus !== 'uploaded') {
    return 'pending';
  }

  if (fileStatuses.length === 0) {
    return 'pending';
  }

  return fileStatuses.every((status) => status === 'uploaded') ? 'ready' : 'pending';
}

function getDurationSeconds(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const serverResponse = (body as Record<string, unknown>).serverResponse as Record<string, unknown> | undefined;
  const extensionServiceState = serverResponse?.extensionServiceState as Record<string, unknown> | undefined;
  const payload = extensionServiceState?.payload as Record<string, unknown> | undefined;
  const duration = payload?.durationMs;
  if (typeof duration === 'number') return Math.floor(duration / 1000);
  return null;
}

function getThumbnailUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  const lastDot = mediaUrl.lastIndexOf('.');
  if (lastDot < 0) return null;
  return `${mediaUrl.slice(0, lastDot)}.jpg`;
}

async function checkMediaReadyByHead(mediaUrl: string | null): Promise<boolean> {
  if (!mediaUrl) return false;
  try {
    const response = await fetch(mediaUrl, { method: 'HEAD' });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

function hasStatusSignal(globalUploadingStatus: string | null, fileStatuses: string[]): boolean {
  return !!globalUploadingStatus || fileStatuses.length > 0;
}

async function normalizeRecordingResult(
  agoraBody: unknown,
  runtimeConfig: RecordingRuntimeConfig,
  sessionId?: string,
  alreadyGone = false
): Promise<NormalizedRecordingResult> {
  if (alreadyGone) {
    return {
      status: 'failed',
      uploadingStatus: null,
      files: [],
      mediaKey: null,
      mediaUrl: null,
      message: 'Recorder instance already gone before stop.',
      rawAgoraResponse: agoraBody,
      durationSeconds: null,
      thumbnailUrl: null,
    };
  }

  const root = (agoraBody && typeof agoraBody === 'object') ? (agoraBody as Record<string, unknown>) : {};
  const serverResponse = (root.serverResponse && typeof root.serverResponse === 'object')
    ? (root.serverResponse as Record<string, unknown>)
    : root;

  const files = parseFileList(serverResponse.fileList ?? root.fileList);

  const globalUploadingStatus = normalizeStatus(
    serverResponse.uploadingStatus ??
    root.uploadingStatus ??
    serverResponse.upload_status
  );

  const fileStatuses = files
    .map(extractFileStatus)
    .filter((status): status is string => !!status);

  let overallStatus = resolveOverallStatus(globalUploadingStatus, fileStatuses);

  const playableFileName = selectPlayableFileName(files);
  const mediaKey = buildMediaKey(playableFileName, sessionId);
  let mediaUrl = overallStatus === 'ready'
    ? buildMediaUrl(mediaKey, runtimeConfig.publicMediaBaseUrl)
    : null;

  const durationSeconds = getDurationSeconds(agoraBody);
  const thumbnailUrl = getThumbnailUrl(mediaUrl);

  const statusSignalPresent = hasStatusSignal(globalUploadingStatus, fileStatuses);
  if (!statusSignalPresent && runtimeConfig.enableHeadFallback) {
    const candidateUrl = buildMediaUrl(mediaKey, runtimeConfig.publicMediaBaseUrl);
    const readyByHead = await checkMediaReadyByHead(candidateUrl);
    if (readyByHead) {
      overallStatus = 'ready';
      mediaUrl = candidateUrl;
      return {
        status: 'ready',
        uploadingStatus: 'uploaded',
        files,
        mediaKey,
        mediaUrl,
        message: 'Ready detected by HEAD fallback check.',
        rawAgoraResponse: agoraBody,
        durationSeconds,
        thumbnailUrl: getThumbnailUrl(mediaUrl),
      };
    }

    return {
      status: 'pending',
      uploadingStatus: 'backuped',
      files,
      mediaKey,
      mediaUrl: null,
      message: 'Upload in progress. Poll query endpoint.',
      rawAgoraResponse: agoraBody,
      durationSeconds,
      thumbnailUrl: null,
    };
  }

  if (overallStatus === 'ready' && !mediaUrl) {
    return {
      status: 'pending',
      uploadingStatus: globalUploadingStatus,
      files,
      mediaKey,
      mediaUrl: null,
      message: 'Upload marked uploaded but playable file is not available yet.',
      rawAgoraResponse: agoraBody,
      durationSeconds,
      thumbnailUrl: null,
    };
  }

  if (overallStatus === 'pending') {
    return {
      status: 'pending',
      uploadingStatus: globalUploadingStatus || 'backuped',
      files,
      mediaKey,
      mediaUrl: null,
      message: 'Upload in progress. Poll query endpoint.',
      rawAgoraResponse: agoraBody,
      durationSeconds,
      thumbnailUrl: null,
    };
  }

  return {
    status: 'ready',
    uploadingStatus: 'uploaded',
    files,
    mediaKey,
    mediaUrl,
    rawAgoraResponse: agoraBody,
    durationSeconds,
    thumbnailUrl,
  };
}

export async function handleRecordingAcquire(request: Request, env: Env, requestId: string, origin: string): Promise<Response> {
  if (!validateApiKey(request, env)) {
    return errorJson(requestId, 'unauthorized', 'Missing or invalid API key', 401, origin);
  }

  const envErr = requireEnv(env, requestId, origin);
  if (envErr) return envErr;

  let body: AcquireRequest;
  try {
    body = await request.json() as AcquireRequest;
  } catch {
    return errorJson(requestId, 'bad_json', 'Invalid JSON payload', 400, origin);
  }

  if (!body.channelName || !body.uid || !body.sessionId) {
    return errorJson(requestId, 'invalid_input', 'channelName, uid, sessionId are required', 400, origin);
  }

  const payload = {
    cname: body.channelName,
    uid: body.uid,
    clientRequest: { resourceExpiredHour: 24 },
  };

  const agora = await fetchAgora(requestId, env, 'POST', '/cloud_recording/acquire', payload);
  const agoraBody = (agora.body && typeof agora.body === 'object') ? (agora.body as Record<string, unknown>) : {};

  if (agora.status < 200 || agora.status >= 300 || typeof agoraBody.resourceId !== 'string') {
    return errorJson(
      requestId,
      'agora_acquire_failed',
      'Agora acquire failed',
      502,
      origin,
      agora.body,
      agoraBody.code,
      agoraBody.message
    );
  }

  return successJson(requestId, {
    resourceId: agoraBody.resourceId,
    sessionId: body.sessionId,
  }, origin);
}

export async function handleRecordingStart(request: Request, env: Env, requestId: string, origin: string): Promise<Response> {
  if (!validateApiKey(request, env)) {
    return errorJson(requestId, 'unauthorized', 'Missing or invalid API key', 401, origin);
  }

  const envErr = requireEnv(env, requestId, origin);
  if (envErr) return envErr;

  let body: StartRequest;
  try {
    body = await request.json() as StartRequest;
  } catch {
    return errorJson(requestId, 'bad_json', 'Invalid JSON payload', 400, origin);
  }

  if (!body.channelName || !body.uid || !body.token || !body.sessionId || !body.resourceId) {
    return errorJson(requestId, 'invalid_input', 'channelName, uid, token, sessionId, resourceId are required', 400, origin);
  }

  const runtimeConfig = getRuntimeConfig(env);

  const storageConfig: Record<string, unknown> = {
    vendor: 11,
    region: String(runtimeConfig.storageRegion || 'auto'),
    bucket: runtimeConfig.storageBucket,
    accessKey: runtimeConfig.storageAccessKey,
    secretKey: runtimeConfig.storageSecretKey,
    fileNamePrefix: ['funprofile', 'live', body.sessionId],
    extensionParams: {
      endpoint: runtimeConfig.storageEndpoint,
    },
  };

  console.log(`[${requestId}] storageConfig vendor=11 bucket=${runtimeConfig.storageBucket} endpoint=${runtimeConfig.storageEndpoint} region=${runtimeConfig.storageRegion || 'auto'}`);

  const payload = {
    cname: body.channelName,
    uid: body.uid,
    clientRequest: {
      token: body.token,
      recordingConfig: {
        channelType: 1,
        streamTypes: 2,
        maxIdleTime: 120,
        videoStreamType: 0,
        transcodingConfig: {
          width: 1280,
          height: 720,
          fps: 15,
          bitrate: 1200,
          mixedVideoLayout: 1,
        },
      },
      storageConfig,
    },
  };

  const path = `/cloud_recording/resourceid/${body.resourceId}/mode/mix/start`;
  const agora = await fetchAgora(requestId, env, 'POST', path, payload);
  const agoraBody = (agora.body && typeof agora.body === 'object') ? (agora.body as Record<string, unknown>) : {};

  const serverResponse = (agoraBody.serverResponse && typeof agoraBody.serverResponse === 'object')
    ? (agoraBody.serverResponse as Record<string, unknown>)
    : {};

  console.log(`[${requestId}] agora start response sid=${String(agoraBody.sid || '')} uploadingStatus=${String(serverResponse.uploadingStatus || 'n/a')}`);

  if (agora.status < 200 || agora.status >= 300 || typeof agoraBody.sid !== 'string') {
    return errorJson(
      requestId,
      'agora_start_failed',
      'Agora start failed',
      502,
      origin,
      agora.body,
      agoraBody.code,
      agoraBody.message
    );
  }

  return successJson(requestId, {
    resourceId: body.resourceId,
    sid: agoraBody.sid,
    sessionId: body.sessionId,
    storageTarget: {
      bucket: runtimeConfig.storageBucket,
      endpoint: runtimeConfig.storageEndpoint,
      vendor: 11,
    },
  }, origin);
}

export async function handleRecordingStop(request: Request, env: Env, requestId: string, origin: string): Promise<Response> {
  if (!validateApiKey(request, env)) {
    return errorJson(requestId, 'unauthorized', 'Missing or invalid API key', 401, origin);
  }

  const envErr = requireEnv(env, requestId, origin);
  if (envErr) return envErr;

  let body: StopRequest;
  try {
    body = await request.json() as StopRequest;
  } catch {
    return errorJson(requestId, 'bad_json', 'Invalid JSON payload', 400, origin);
  }

  if (!body.channelName || !body.recordingUid || !body.resourceId || !body.sid) {
    return errorJson(requestId, 'invalid_input', 'channelName, recordingUid, resourceId, sid are required', 400, origin);
  }

  const payload = {
    cname: body.channelName,
    uid: body.recordingUid,
    clientRequest: {},
  };

  const path = `/cloud_recording/resourceid/${body.resourceId}/sid/${body.sid}/mode/mix/stop`;
  const agora = await fetchAgora(requestId, env, 'POST', path, payload);

  const agoraBody = (agora.body && typeof agora.body === 'object') ? (agora.body as Record<string, unknown>) : {};
  const serverResponse = (agoraBody.serverResponse && typeof agoraBody.serverResponse === 'object')
    ? (agoraBody.serverResponse as Record<string, unknown>)
    : {};

  console.log(`[${requestId}] agora stop response uploadingStatus=${String(serverResponse.uploadingStatus || 'n/a')}`);

  const alreadyGone = agora.status === 404 && agoraBody.code === 404;
  if ((agora.status < 200 || agora.status >= 300) && !alreadyGone) {
    return errorJson(
      requestId,
      'agora_stop_failed',
      'Agora stop failed',
      502,
      origin,
      agora.body,
      agoraBody.code,
      agoraBody.message
    );
  }

  const runtimeConfig = getRuntimeConfig(env);
  const normalized = await normalizeRecordingResult(agora.body, runtimeConfig, body.sessionId, alreadyGone);

  return successJson(requestId, {
    status: normalized.status,
    uploadingStatus: normalized.uploadingStatus,
    files: normalized.files,
    mediaKey: normalized.mediaKey,
    mediaUrl: normalized.mediaUrl,
    message: normalized.message,
    durationSeconds: normalized.durationSeconds,
    thumbnailUrl: normalized.thumbnailUrl,
    rawAgoraResponse: normalized.rawAgoraResponse,
  }, origin);
}

export async function handleRecordingQuery(request: Request, env: Env, requestId: string, origin: string): Promise<Response> {
  if (!validateApiKey(request, env)) {
    return errorJson(requestId, 'unauthorized', 'Missing or invalid API key', 401, origin);
  }

  const envErr = requireEnv(env, requestId, origin);
  if (envErr) return envErr;

  const url = new URL(request.url);
  const resourceId = (url.searchParams.get('resourceId') || '').trim();
  const sid = (url.searchParams.get('sid') || '').trim();
  const mode = (url.searchParams.get('mode') || 'mix').trim() || 'mix';
  const sessionId = (url.searchParams.get('sessionId') || '').trim();

  if (!resourceId || !sid) {
    return errorJson(requestId, 'invalid_input', 'resourceId and sid are required', 400, origin);
  }

  const path = `/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/${mode}/query`;
  const agora = await fetchAgora(requestId, env, 'GET', path);

  const agoraBody = (agora.body && typeof agora.body === 'object') ? (agora.body as Record<string, unknown>) : {};

  if (agora.status < 200 || agora.status >= 300) {
    return errorJson(
      requestId,
      'agora_query_failed',
      'Agora query failed',
      502,
      origin,
      agora.body,
      agoraBody.code,
      agoraBody.message
    );
  }

  const runtimeConfig = getRuntimeConfig(env);
  const normalized = await normalizeRecordingResult(agora.body, runtimeConfig, sessionId || undefined, false);

  return successJson(requestId, {
    status: normalized.status,
    uploadingStatus: normalized.uploadingStatus,
    files: normalized.files,
    mediaKey: normalized.mediaKey,
    mediaUrl: normalized.mediaUrl,
    message: normalized.message,
    durationSeconds: normalized.durationSeconds,
    thumbnailUrl: normalized.thumbnailUrl,
    rawAgoraResponse: normalized.rawAgoraResponse,
  }, origin);
}

```

### FILE: worker/src/upload.ts
`$ext
import { Env, corsHeaders } from './cors';

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_VIDEO_TYPES = new Set([
  'video/webm',
  'video/webm;codecs=vp8,opus',
  'video/mp4',
]);

interface SupabaseUser {
  id: string;
}

function errorJson(message: string, status: number, origin: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function okJson(payload: Record<string, unknown>, origin: string): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

async function verifySupabaseUser(authHeader: string, env: Env): Promise<SupabaseUser | null> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) return null;
  const user = (await response.json()) as SupabaseUser;
  if (!user?.id) return null;
  return user;
}

async function isHostOfSession(streamId: string, userId: string, authHeader: string, env: Env): Promise<boolean> {
  const query = new URL(`${env.SUPABASE_URL}/rest/v1/live_sessions`);
  query.searchParams.set('select', 'id');
  query.searchParams.set('id', `eq.${streamId}`);
  query.searchParams.set('or', `(host_user_id.eq.${userId},owner_id.eq.${userId})`);
  query.searchParams.set('limit', '1');

  const response = await fetch(query.toString(), {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ id: string }>;
  return Array.isArray(rows) && rows.length > 0;
}

function sanitizeFilename(raw: string | null): string {
  const fallback = 'recording.webm';
  if (!raw) return fallback;
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe.startsWith('.')) return fallback;
  return safe;
}

function isSupportedVideoType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  if (ALLOWED_VIDEO_TYPES.has(normalized)) return true;
  return normalized.startsWith('video/webm') || normalized.startsWith('video/mp4');
}

export async function handleLiveRecordingUpload(
  request: Request,
  env: Env,
  requestId: string,
  origin: string
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorJson('Missing or invalid Authorization header', 401, origin);
  }

  const streamId = request.headers.get('X-Stream-Id');
  if (!streamId) {
    return errorJson('Missing X-Stream-Id', 400, origin);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType || !isSupportedVideoType(contentType)) {
    return errorJson('Unsupported Content-Type', 400, origin);
  }

  const user = await verifySupabaseUser(authHeader, env);
  if (!user) {
    return errorJson('Invalid JWT', 401, origin);
  }

  const ownsSession = await isHostOfSession(streamId, user.id, authHeader, env);
  if (!ownsSession) {
    return errorJson('Forbidden: session does not belong to user', 403, origin);
  }

  const bodyBuffer = await request.arrayBuffer();
  if (!bodyBuffer.byteLength) {
    return errorJson('Empty upload body', 400, origin);
  }
  if (bodyBuffer.byteLength > MAX_UPLOAD_SIZE_BYTES) {
    return errorJson('Uploaded file too large', 413, origin);
  }

  const filename = sanitizeFilename(request.headers.get('X-Filename'));
  const key = `recordings/${streamId}/${Date.now()}-${filename}`;
  await env.RECORDINGS_BUCKET.put(key, bodyBuffer, {
    httpMetadata: {
      contentType,
    },
  });

  const url = `${env.RECORDING_PLAYBACK_BASE_URL.replace(/\/+$/, '')}/${key}`;
  console.log(`[${requestId}] upload/live-recording stored key=${key} user=${user.id}`);

  return okJson({ ok: true, key, url }, origin);
}

```

### FILE: worker/src/validate.ts
`$ext
/**
 * Input validation utilities for Agora Token Service
 */

export interface TokenRequest {
  channel: string;
  userAccount: string;
  role: 'publisher' | 'subscriber';
  expireSeconds: number;
}

export interface ValidationResult {
  valid: boolean;
  data?: TokenRequest;
  error?: string;
}

// Validation regex patterns
const CHANNEL_REGEX = /^[a-zA-Z0-9_-]+$/;
const USER_ACCOUNT_REGEX = /^[a-zA-Z0-9@._-]+$/;

// Validation limits
const CHANNEL_MIN_LENGTH = 1;
const CHANNEL_MAX_LENGTH = 64;
const USER_ACCOUNT_MIN_LENGTH = 1;
const USER_ACCOUNT_MAX_LENGTH = 128;
const EXPIRE_MIN_SECONDS = 60;
const EXPIRE_MAX_SECONDS = 86400;
const DEFAULT_EXPIRE_SECONDS = 3600;

/**
 * Validate channel name
 */
function validateChannel(channel: unknown): string | null {
  if (channel === undefined || channel === null) {
    return 'channel is required';
  }
  
  if (typeof channel !== 'string') {
    return 'channel must be a string';
  }

  const trimmed = channel.trim();
  
  if (trimmed.length < CHANNEL_MIN_LENGTH) {
    return `channel must be at least ${CHANNEL_MIN_LENGTH} character`;
  }
  
  if (trimmed.length > CHANNEL_MAX_LENGTH) {
    return `channel must be at most ${CHANNEL_MAX_LENGTH} characters`;
  }

  if (!CHANNEL_REGEX.test(trimmed)) {
    return 'channel must contain only alphanumeric characters, underscores, and hyphens';
  }

  return null;
}

/**
 * Validate user account (string UID)
 */
function validateUserAccount(userAccount: unknown): string | null {
  if (userAccount === undefined || userAccount === null) {
    return 'userAccount is required';
  }
  
  if (typeof userAccount !== 'string') {
    return 'userAccount must be a string';
  }

  const trimmed = userAccount.trim();
  
  if (trimmed.length < USER_ACCOUNT_MIN_LENGTH) {
    return `userAccount must be at least ${USER_ACCOUNT_MIN_LENGTH} character`;
  }
  
  if (trimmed.length > USER_ACCOUNT_MAX_LENGTH) {
    return `userAccount must be at most ${USER_ACCOUNT_MAX_LENGTH} characters`;
  }

  if (!USER_ACCOUNT_REGEX.test(trimmed)) {
    return 'userAccount must contain only alphanumeric characters, @, ., _, and -';
  }

  return null;
}

/**
 * Validate role
 */
function validateRole(role: unknown): 'publisher' | 'subscriber' {
  if (role === undefined || role === null) {
    return 'publisher'; // Default role
  }
  
  if (role === 'publisher' || role === 'subscriber') {
    return role;
  }
  
  return 'publisher'; // Default for invalid values
}

/**
 * Validate expire seconds
 */
function validateExpireSeconds(expireSeconds: unknown, defaultTtl: number): number {
  if (expireSeconds === undefined || expireSeconds === null) {
    return defaultTtl;
  }
  
  const num = typeof expireSeconds === 'number' 
    ? expireSeconds 
    : parseInt(String(expireSeconds), 10);
  
  if (isNaN(num)) {
    return defaultTtl;
  }

  // Clamp to valid range
  if (num < EXPIRE_MIN_SECONDS) {
    return EXPIRE_MIN_SECONDS;
  }
  
  if (num > EXPIRE_MAX_SECONDS) {
    return EXPIRE_MAX_SECONDS;
  }

  return Math.floor(num);
}

/**
 * Validate the complete token request body
 */
export function validateTokenRequest(
  body: unknown, 
  defaultTtl: number = DEFAULT_EXPIRE_SECONDS
): ValidationResult {
  // Check if body is an object
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: 'Request body must be a JSON object',
    };
  }

  const data = body as Record<string, unknown>;

  // Validate channel
  const channelError = validateChannel(data.channel);
  if (channelError) {
    return {
      valid: false,
      error: channelError,
    };
  }

  // Validate userAccount
  const userAccountError = validateUserAccount(data.userAccount);
  if (userAccountError) {
    return {
      valid: false,
      error: userAccountError,
    };
  }

  // Validate and normalize role and expireSeconds
  const role = validateRole(data.role);
  const expireSeconds = validateExpireSeconds(data.expireSeconds, defaultTtl);

  return {
    valid: true,
    data: {
      channel: (data.channel as string).trim(),
      userAccount: (data.userAccount as string).trim(),
      role,
      expireSeconds,
    },
  };
}

```

## ENV REQUIRED (PLACEHOLDERS ONLY)

Frontend (.env)
```bash
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
VITE_AGORA_WORKER_URL=${VITE_AGORA_WORKER_URL}
VITE_AGORA_WORKER_API_KEY=${VITE_AGORA_WORKER_API_KEY}
```

Supabase Functions secrets/vars
```bash
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
LIVE_AGORA_WORKER_URL=${LIVE_AGORA_WORKER_URL}
LIVE_AGORA_WORKER_API_KEY=${LIVE_AGORA_WORKER_API_KEY}
```

Worker secrets
```bash
AGORA_APP_ID=${AGORA_APP_ID}
AGORA_APP_CERTIFICATE=${AGORA_APP_CERTIFICATE}
AGORA_CUSTOMER_ID=${AGORA_CUSTOMER_ID}
AGORA_CUSTOMER_SECRET=${AGORA_CUSTOMER_SECRET}
API_KEY=${API_KEY}
REC_STORAGE_BUCKET=${REC_STORAGE_BUCKET}
REC_STORAGE_ACCESS_KEY=${REC_STORAGE_ACCESS_KEY}
REC_STORAGE_SECRET_KEY=${REC_STORAGE_SECRET_KEY}
REC_STORAGE_REGION=${REC_STORAGE_REGION}
REC_R2_ENDPOINT=${REC_R2_ENDPOINT}
PUBLIC_MEDIA_BASE_URL=${PUBLIC_MEDIA_BASE_URL}
```

## IMPORT CHECKLIST (LOVABLE TARGET PROJECT)

1. Copy all files in this bundle to the exact paths.
2. Add routes: `/live`, `/live/new`, `/live/:liveSessionId/host`, `/live/:liveSessionId`.
3. Ensure `src/integrations/supabase/client.ts` is configured in target project.
4. Apply listed live migrations in order.
5. Deploy edge functions: `live-token`, `live-start`, `live-stop`, `live-recording-start`, `live-recording-stop`, `live-recording-status`, `live-recording-proxy`.
6. Deploy Worker and set all required secrets/vars.
7. Verify RTC flow: `useLiveRtc` -> `src/lib/agoraRtc.ts`/`live-token` -> Worker token endpoint.
8. Validate start live, audience join, end live, recording status transitions.


