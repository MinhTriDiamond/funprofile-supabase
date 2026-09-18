# CHAT CALL FULL SOURCE BUNDLE

Generated: 2026-02-21 14:50:39 +08:00
Scope: Chat messaging + voice/video call (Agora) + Supabase + Worker (no packages/fun-chat*)

Restore rule: Create each file exactly at the path shown after `### FILE:` and paste the full code block content.

## TABLE OF CONTENTS

### App
- src/contexts/CallContext.tsx
- src/integrations/funChatCallAdapter.ts
- src/integrations/funChatCallRenderers.tsx
- src/integrations/supabase/client.ts
- src/lib/agoraRtc.ts
- src/lib/urlFix.ts
- src/utils/mediaUpload.ts
- src/utils/imageCompression.ts
- src/components/feed/EmojiPicker.tsx
- src/modules/chat/components/BlockUserDialog.tsx
- src/modules/chat/components/CallControls.tsx
- src/modules/chat/components/CallRoom.tsx
- src/modules/chat/components/ChatInput.tsx
- src/modules/chat/components/ChatSettingsDialog.tsx
- src/modules/chat/components/ConversationList.tsx
- src/modules/chat/components/CreateGroupDialog.tsx
- src/modules/chat/components/CryptoGiftButton.tsx
- src/modules/chat/components/EditMessageDialog.tsx
- src/modules/chat/components/GroupSettingsDialog.tsx
- src/modules/chat/components/IncomingCallDialog.tsx
- src/modules/chat/components/MessageBubble.tsx
- src/modules/chat/components/MessageSearch.tsx
- src/modules/chat/components/MessageThread.tsx
- src/modules/chat/components/NewConversationDialog.tsx
- src/modules/chat/components/PreCallSettings.tsx
- src/modules/chat/components/RedEnvelopeCard.tsx
- src/modules/chat/components/RedEnvelopeClaimDialog.tsx
- src/modules/chat/components/RedEnvelopeDialog.tsx
- src/modules/chat/components/ReportDialog.tsx
- src/modules/chat/components/SendCryptoModal.tsx
- src/modules/chat/components/StickerPicker.tsx
- src/modules/chat/components/TypingIndicator.tsx
- src/modules/chat/components/VideoGrid.tsx
- src/modules/chat/hooks/useAgoraCall.ts
- src/modules/chat/hooks/useAngelInline.ts
- src/modules/chat/hooks/useBlocks.ts
- src/modules/chat/hooks/useChatNotifications.ts
- src/modules/chat/hooks/useChatSettings.ts
- src/modules/chat/hooks/useConversations.ts
- src/modules/chat/hooks/useGroupConversations.ts
- src/modules/chat/hooks/useMediaDevices.ts
- src/modules/chat/hooks/useMessages.ts
- src/modules/chat/hooks/usePins.ts
- src/modules/chat/hooks/useRedEnvelope.ts
- src/modules/chat/hooks/useReports.ts
- src/modules/chat/hooks/useStickers.ts
- src/modules/chat/hooks/useTypingIndicator.ts
- src/modules/chat/index.ts
- src/modules/chat/pages/Chat.tsx
- src/modules/chat/types/index.ts

### Supabase
- supabase/config.toml
- supabase/functions/_shared/jwt.ts
- supabase/functions/agora-token/index.ts
- supabase/functions/angel-inline/index.ts
- supabase/functions/get-upload-url/index.ts
- supabase/migrations/20260112145038_b700216f-a256-4fe4-b957-b9559580c085.sql
- supabase/migrations/20260113032534_6e7dee7c-abe7-4f9c-8141-4cf4162d4886.sql
- supabase/migrations/20260202032057_bfde2c00-860e-43a0-b727-a938ae10956f.sql
- supabase/migrations/20260203060452_c7b031ea-68fa-4777-83f4-d6ffe66df83a.sql
- supabase/migrations/20260207070852_3871af2a-7d33-43e9-a37f-610aa1074824.sql
- supabase/migrations/20260207090000_create_crypto_gifts.sql
- supabase/migrations/20260210120000_chat_pins_search.sql
- supabase/migrations/20260210120500_chat_block_report.sql
- supabase/migrations/20260210121000_chat_stickers_edit.sql
- supabase/migrations/20260210121500_chat_red_envelope.sql
- supabase/migrations/20260210121800_chat_message_preview.sql
- supabase/migrations/20260210170411_e7233ae3-c9be-448f-9b58-c49da8064b0c.sql
- supabase/migrations/20260210190000_crypto_gifts_fix.sql
- supabase/migrations/20260210235400_a092e63d-9c73-4a06-8a63-51c6bb845844.sql
- supabase/migrations/20260211000428_ddddd96c-af9e-48a2-a687-642c7b473017.sql
- supabase/migrations/20260211120000_chat_preview_on_update.sql
- supabase/migrations/20260214180919_93a90bf9-6e54-4835-a82c-f306bd3d1b4c.sql

### Worker
- worker/package.json
- worker/README.md
- worker/wrangler.toml
- worker/src/cors.ts
- worker/src/index.ts
- worker/src/recording.ts
- worker/src/upload.ts
- worker/src/validate.ts

## SOURCE DUMP

### FILE: src/contexts/CallContext.tsx
`$ext
/**
 * Global Call Context
 * Listens for incoming calls across all pages, not just the chat page.
 * Wraps the entire app to enable receiving calls from anywhere.
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IncomingCallDialog } from '@/modules/chat/components/IncomingCallDialog';
import type { CallSession, CallType } from '@/modules/chat/types';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface CallContextValue {
  incomingCall: CallSession | null;
  answerCall: () => void;
  declineCall: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export function useGlobalCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useGlobalCall must be used within a CallProvider');
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
  renderIncomingDialog?: boolean;
}

export function CallProvider({ children, renderIncomingDialog = true }: CallProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle answer call - navigate to chat and let the chat page handle the actual connection
  const answerCall = useCallback(() => {
    if (!incomingCall) return;
    
    const callId = incomingCall.id;
    const conversationId = incomingCall.conversation_id;
    
    // Navigate to the conversation with answer parameter
    navigate(`/chat/${conversationId}?answer=${callId}`);
    
    // Delay clearing the incoming call to ensure navigation completes
    setTimeout(() => {
      setIncomingCall(null);
    }, 500);
  }, [incomingCall, navigate]);

  // Handle decline call
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', incomingCall.id);

      setIncomingCall(null);
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }, [incomingCall]);

  // Subscribe to incoming calls globally
  useEffect(() => {
    if (!userId) return;

    console.log('[CallContext] Setting up global call listener for user:', userId);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Scope the subscription to conversations the user is currently a member of.
      const { data: rows, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (cancelled) return;
      if (error) {
        console.error('[CallContext] Failed to load conversation ids:', error);
        return;
      }

      const conversationIds = (rows || []).map((r: any) => r.conversation_id).filter(Boolean);
      if (!conversationIds.length) return;

      const inFilter = `conversation_id=in.(${conversationIds.join(',')})`;

      channel = supabase
        .channel(`global-incoming-calls:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: inFilter },
          (payload) => {
            const session = payload.new as any;

            // Skip if we're the initiator
            if (session.initiator_id === userId) return;

            // Only show ringing calls
            if (session.status !== 'ringing') return;

            console.log('[CallContext] Incoming call detected:', session.id);

            const typedSession: CallSession = {
              ...session,
              call_type: session.call_type as CallType,
            };
            setIncomingCall(typedSession);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: inFilter },
          (payload) => {
            const session = payload.new as any;

            // If the incoming call was cancelled/ended by caller
            if (incomingCall?.id === session.id && ['ended', 'declined', 'missed'].includes(session.status)) {
              console.log('[CallContext] Incoming call cancelled:', session.status);
              setIncomingCall(null);

              if (session.status === 'missed') {
                toast({
                  title: 'Cuộc gọi nhỡ',
                  description: 'Bạn đã bỏ lỡ một cuộc gọi',
                });
              }
            }
          }
        )
        .subscribe();
    })();

    return () => {
      console.log('[CallContext] Cleaning up global call listener');
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, incomingCall, toast]);

  return (
    <CallContext.Provider value={{ incomingCall, answerCall, declineCall }}>
      {children}
      {renderIncomingDialog ? (
        <IncomingCallDialog
          callSession={incomingCall}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      ) : null}
    </CallContext.Provider>
  );
}


```

### FILE: src/integrations/funChatCallAdapter.ts
`$ext
import type { ChatCallAdapter } from '@fun/chat-call';
import { supabase } from '@/integrations/supabase/client';
import { getAgoraRtcToken } from '@/lib/agoraRtc';

const PAGE_SIZE = 30;

export const funChatCallAdapter: ChatCallAdapter = {
  getAuth: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      userId: session?.user?.id ?? null,
      accessToken: session?.access_token ?? null,
    };
  },

  fetchAgoraToken: async ({ channelName, role, uid }) => {
    const token = await getAgoraRtcToken(channelName, role);
    return {
      token: token.token,
      appId: token.appId,
      uid: uid ?? token.userAccount,
      channelName,
      expiresAt: token.expiresAt,
    };
  },

  fetchChatHistory: async (conversationId, cursor) => {
    const pageIndex = Number(cursor ?? 0);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      items: (data ?? []) as any[],
      nextCursor: (data?.length ?? 0) === PAGE_SIZE ? String(pageIndex + 1) : null,
    };
  },

  sendMessage: async (conversationId, payload) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: user.id,
        content: payload.content?.trim() || null,
        media_urls: payload.mediaUrls?.map((m) => m.url) ?? [],
        reply_to_id: payload.replyToId ?? null,
        metadata: (payload.metadata ?? {}) as any,
      }])
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  subscribeRealtime: (conversationId, handlers) => {
    const channel = supabase
      .channel(`fun-chat-call:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          handlers.onMessage?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          handlers.onMessageUpdated?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (oldRow?.id) handlers.onMessageDeleted?.(oldRow.id);
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        void supabase.removeChannel(channel);
      },
    };
  },

  uploadAttachment: async (file) => {
    const sanitizedName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const path = `chat/${sanitizedName}`;

    const { error } = await supabase.storage.from('chat-media').upload(path, file, {
      upsert: false,
      contentType: file.type,
    });

    if (error) throw error;

    const { data } = supabase.storage.from('chat-media').getPublicUrl(path);

    return {
      url: data.publicUrl,
      type: file.type,
    };
  },
};

```

### FILE: src/integrations/funChatCallRenderers.tsx
`$ext
import Chat from '@/modules/chat/pages/Chat';
import { IncomingCallDialog } from '@/modules/chat/components/IncomingCallDialog';
import { useGlobalCall } from '@/contexts/CallContext';

export function HostChatPanelRenderer() {
  return <Chat />;
}

export function HostCallOverlayRenderer() {
  const { incomingCall, answerCall, declineCall } = useGlobalCall();

  return (
    <IncomingCallDialog
      callSession={incomingCall}
      onAnswer={answerCall}
      onDecline={declineCall}
    />
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

### FILE: src/lib/urlFix.ts
`$ext
export const R2_NEW_PUBLIC_URL = 'https://pub-fe745f8832684f4198a9b0e88e8d451a.r2.dev';

/**
 * Temporary safety net until CLOUDFLARE_R2_PUBLIC_URL is corrected.
 * If a chat attachment is returned with the old media.fun.rich domain for
 * comment-media paths, rewrite to the new public R2 bucket.
 */
export function rewriteChatAttachmentUrl(url: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (parsed.origin === 'https://media.fun.rich' && parsed.pathname.includes('/comment-media/')) {
      return `${R2_NEW_PUBLIC_URL}${parsed.pathname}`;
    }
  } catch {
    return url;
  }

  return url;
}

```

### FILE: src/utils/mediaUpload.ts
`$ext
/**
 * Media Upload Utility
 * 
 * Triá»ƒn khai theo hÆ°á»›ng dáº«n cá»§a Cha:
 * 1. Cache Busting: Äá»•i tĂªn file vá»›i hash/timestamp
 * 2. NĂ©n áº£nh client-side trÆ°á»›c khi upload
 * 3. Upload trá»±c tiáº¿p lĂªn R2 qua presigned URL
 * 4. URL hiá»ƒn thá»‹ qua Cloudflare Resizing
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage, FILE_LIMITS } from './imageCompression';
import { rewriteChatAttachmentUrl } from '@/lib/urlFix';

// NOTE: Use publicUrl returned by edge function. The new R2 public bucket
// is not mapped to media.fun.rich, so we must not hardcode that domain.

export interface MediaUploadResult {
  url: string;
  key: string;
  transformedUrl?: string;
}

export interface UploadOptions {
  bucket: 'posts' | 'avatars' | 'videos' | 'comment-media' | 'covers';
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

function inferContentType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'txt':
      return 'text/plain';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/x-rar-compressed';
    case 'apk':
      return 'application/vnd.android.package-archive';
    default:
      return null;
  }
}

/**
 * Generate unique filename with hash for cache busting
 * Format: [userId]_[timestamp]_[randomHash].[ext]
 */
export function generateCacheBustFilename(
  originalName: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const randomHash = Math.random().toString(36).substring(2, 10);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Clean extension
  const cleanExt = ext.replace(/[^a-z0-9]/g, '');
  
  if (userId) {
    return `${userId}_${timestamp}_${randomHash}.${cleanExt}`;
  }
  return `${timestamp}_${randomHash}.${cleanExt}`;
}

/**
 * Calculate file hash (SHA-256) for deduplication
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Upload media to R2 with presigned URL (Direct upload - khĂ´ng qua base64)
 * 
 * Flow:
 * 1. NĂ©n áº£nh náº¿u cáº§n (client-side)
 * 2. Gá»i API láº¥y presigned URL
 * 3. Upload trá»±c tiáº¿p lĂªn R2
 * 4. Return URL Ä‘Ă£ transform qua Cloudflare
 */
export async function uploadMedia(
  file: File,
  options: UploadOptions
): Promise<MediaUploadResult> {
  const { bucket, compress = true, maxWidth, maxHeight, quality } = options;

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ChÆ°a Ä‘Äƒng nháº­p');

  let processedFile = file;

  // NĂ©n áº£nh client-side náº¿u lĂ  áº£nh
  if (compress && file.type.startsWith('image/')) {
    processedFile = await compressImage(file, {
      maxWidth: maxWidth || FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
      maxHeight: maxHeight || FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
      quality: quality || 0.85,
    });
  }

  // Generate cache-busting filename
  const filename = generateCacheBustFilename(processedFile.name, user.id);
  const key = `${bucket}/${filename}`;

  const inferred = inferContentType(processedFile.name);
  const contentType = processedFile.type || inferred || 'application/octet-stream';

  // Get presigned URL tá»« edge function
  const { data: presignedData, error: presignedError } = await supabase.functions.invoke(
    'get-upload-url',
    {
      body: {
        key,
        contentType: contentType,
        fileSize: processedFile.size,
      },
    }
  );

  if (presignedError || !presignedData?.uploadUrl || !presignedData?.publicUrl) {
    const message = presignedError?.message || 'KhĂ´ng thá»ƒ láº¥y URL upload';
    if (message.includes('File type not allowed') || message.includes('Missing key or contentType')) {
      throw new Error('FILE_TYPE_NOT_SUPPORTED');
    }
    throw new Error(message);
  }

  // Upload trá»±c tiáº¿p lĂªn R2 (khĂ´ng qua base64)
  const uploadResponse = await fetch(presignedData.uploadUrl, {
    method: 'PUT',
    body: processedFile,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload tháº¥t báº¡i: ${uploadResponse.status}`);
  }

  const safeUrl = rewriteChatAttachmentUrl(presignedData.publicUrl);

  return {
    url: safeUrl,
    key,
    transformedUrl: safeUrl, // Caller can use imageTransform.ts for transforms
  };
}

/**
 * Upload avatar vá»›i compression tá»‘i Æ°u
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<MediaUploadResult> {
  // Avatar luĂ´n nĂ©n vá» max 512x512 vá»›i quality cao
  return uploadMedia(file, {
    bucket: 'avatars',
    compress: true,
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.9,
  });
}

/**
 * Upload cover photo
 */
export async function uploadCover(
  file: File,
  userId: string
): Promise<MediaUploadResult> {
  return uploadMedia(file, {
    bucket: 'covers',
    compress: true,
    maxWidth: 1920,
    maxHeight: 640,
    quality: 0.85,
  });
}

/**
 * Upload post image vá»›i compression há»£p lĂ½
 */
export async function uploadPostImage(file: File): Promise<MediaUploadResult> {
  return uploadMedia(file, {
    bucket: 'posts',
    compress: true,
    maxWidth: FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
    maxHeight: FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
    quality: 0.85,
  });
}

/**
 * Upload video (khĂ´ng nĂ©n, chá»‰ validate size)
 */
export async function uploadVideo(file: File): Promise<MediaUploadResult> {
  if (file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
    throw new Error(`Video pháº£i nhá» hÆ¡n ${FILE_LIMITS.VIDEO_MAX_SIZE / (1024 * 1024)}MB`);
  }

  return uploadMedia(file, {
    bucket: 'videos',
    compress: false,
  });
}

/**
 * Upload comment media
 */
export async function uploadCommentMedia(file: File): Promise<MediaUploadResult> {
  if (file.type.startsWith('image/')) {
    return uploadMedia(file, {
      bucket: 'comment-media',
      compress: true,
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.8,
    });
  }
  
  return uploadMedia(file, {
    bucket: 'comment-media',
    compress: false,
  });
}






```

### FILE: src/utils/imageCompression.ts
`$ext
/**
 * Image compression utility for optimizing uploads
 * Resizes and compresses images to reduce storage and improve loading times
 * Uses WebP format for better compression (30-50% smaller than JPEG)
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 to 1
  outputFormat?: 'image/jpeg' | 'image/webp' | 'image/png';
  targetSizeKB?: number; // Target file size in KB
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.80, // Reduced for better compression
  outputFormat: 'image/webp', // WebP for better compression
  targetSizeKB: 150, // Target <150KB
};

/**
 * Check if browser supports WebP
 */
const supportsWebP = (): boolean => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
};

/**
 * Compress and resize an image file with WebP support
 */
export const compressImage = async (
  file: File,
  options: CompressionOptions = {}
): Promise<File> => {
  // Check WebP support, fallback to JPEG if not supported
  const webpSupported = supportsWebP();
  const opts = { 
    ...DEFAULT_OPTIONS, 
    ...options,
    outputFormat: webpSupported ? (options.outputFormat || 'image/webp') : 'image/jpeg'
  };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = async () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > opts.maxWidth! || height > opts.maxHeight!) {
          const ratio = Math.min(opts.maxWidth! / width, opts.maxHeight! / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Iterative compression to reach target size
        let quality = opts.quality!;
        let blob: Blob | null = null;
        const targetBytes = (opts.targetSizeKB || 150) * 1024;
        
        // Try up to 5 iterations to reach target size
        for (let i = 0; i < 5; i++) {
          blob = await new Promise<Blob | null>((res) => {
            canvas.toBlob(res, opts.outputFormat, quality);
          });
          
          if (!blob) break;
          
          // If under target size, we're done
          if (blob.size <= targetBytes) break;
          
          // Reduce quality for next iteration
          quality = Math.max(0.3, quality - 0.15);
        }

        if (!blob) {
          reject(new Error('Failed to compress image'));
          return;
        }

        // Determine file extension based on format
        const ext = opts.outputFormat === 'image/webp' ? 'webp' : 
                    opts.outputFormat === 'image/png' ? 'png' : 'jpg';

        // Create new file from blob
        const compressedFile = new File(
          [blob],
          file.name.replace(/\.[^/.]+$/, '') + '.' + ext,
          { type: opts.outputFormat }
        );

        resolve(compressedFile);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Compress image for avatar (smaller size, more aggressive compression)
 */
export const compressAvatar = async (file: File): Promise<File> => {
  return compressImage(file, {
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.75,
    targetSizeKB: 50, // Avatars should be very small
  });
};

/**
 * Compress image for post (balanced quality and size)
 */
export const compressPostImage = async (file: File): Promise<File> => {
  return compressImage(file, {
    maxWidth: 1200, // Reduced from 1920 for faster loading
    maxHeight: 1200,
    quality: 0.80,
    targetSizeKB: 150,
  });
};

/**
 * Get video duration
 */
export const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = URL.createObjectURL(file);
  });
};

/**
 * Validate and get optimized file size limits
 */
export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: 100 * 1024 * 1024, // 100MB - cho áº£nh cháº¥t lÆ°á»£ng cao
  VIDEO_MAX_SIZE: 10 * 1024 * 1024 * 1024, // 10GB - cho video 4K/dĂ i
  VIDEO_MAX_DURATION: 36000, // 600 phĂºt (10 giá») - há»— trá»£ video siĂªu dĂ i
  AVATAR_MAX_WIDTH: 256,
  AVATAR_MAX_HEIGHT: 256,
  COVER_MAX_WIDTH: 1200,
  COVER_MAX_HEIGHT: 400,
  POST_IMAGE_MAX_WIDTH: 1200,
  POST_IMAGE_MAX_HEIGHT: 1200,
  // Threshold for using TUS resumable upload
  TUS_THRESHOLD: 100 * 1024 * 1024, // 100MB
  // Max files per post
  MAX_FILES_PER_POST: 100,
};

```

### FILE: src/components/feed/EmojiPicker.tsx
`$ext
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Smile } from 'lucide-react';

const EMOJI_CATEGORIES = {
  'Cáº£m xĂºc': ['đŸ˜€', 'đŸ˜ƒ', 'đŸ˜„', 'đŸ˜', 'đŸ˜†', 'đŸ˜…', 'đŸ¤£', 'đŸ˜‚', 'đŸ™‚', 'đŸ˜', 'đŸ˜‡', 'đŸ¥°', 'đŸ˜', 'đŸ¤©', 'đŸ˜˜', 'đŸ˜—', 'đŸ˜', 'đŸ˜™', 'đŸ¥²', 'đŸ˜‹', 'đŸ˜›', 'đŸ˜œ', 'đŸ¤ª', 'đŸ˜', 'đŸ¤‘', 'đŸ¤—', 'đŸ¤­', 'đŸ¤«', 'đŸ¤”', 'đŸ¤', 'đŸ¤¨', 'đŸ˜', 'đŸ˜‘', 'đŸ˜¶', 'đŸ˜', 'đŸ˜’', 'đŸ™„', 'đŸ˜¬', 'đŸ˜Œ', 'đŸ˜”', 'đŸ˜ª', 'đŸ¤¤', 'đŸ˜´', 'đŸ˜·', 'đŸ¤’', 'đŸ¤•', 'đŸ¤¢', 'đŸ¤®', 'đŸ¤§', 'đŸ¥µ', 'đŸ¥¶', 'đŸ¥´', 'đŸ˜µ', 'đŸ¤¯', 'đŸ¤ ', 'đŸ¥³', 'đŸ¥¸', 'đŸ˜', 'đŸ¤“', 'đŸ§'],
  'Cá»­ chá»‰': ['đŸ‘', 'đŸ‘', 'đŸ‘', 'âœ', 'đŸ¤›', 'đŸ¤œ', 'đŸ¤', 'đŸ‘', 'đŸ™Œ', 'đŸ‘', 'đŸ¤²', 'đŸ¤', 'âœŒï¸', 'đŸ¤Ÿ', 'đŸ¤˜', 'đŸ¤™', 'đŸ‘ˆ', 'đŸ‘‰', 'đŸ‘†', 'đŸ‘‡', 'â˜ï¸', 'đŸ‘‹', 'đŸ¤', 'đŸ–ï¸', 'âœ‹', 'đŸ––', 'đŸ’ª', 'đŸ™'],
  'TrĂ¡i tim': ['â¤ï¸', 'đŸ§¡', 'đŸ’›', 'đŸ’', 'đŸ’™', 'đŸ’œ', 'đŸ–¤', 'đŸ¤', 'đŸ¤', 'đŸ’”', 'â£ï¸', 'đŸ’•', 'đŸ’', 'đŸ’“', 'đŸ’—', 'đŸ’–', 'đŸ’˜', 'đŸ’', 'đŸ’Ÿ'],
  'Hoáº¡t Ä‘á»™ng': ['đŸ‰', 'đŸ', 'đŸ‚', 'đŸ', 'đŸˆ', 'đŸ„', 'đŸƒ', 'đŸ—ï¸', 'đŸ†', 'đŸ¥‡', 'đŸ¥ˆ', 'đŸ¥‰', 'â½', 'đŸ€', 'đŸˆ', 'â¾', 'đŸ¾', 'đŸ', 'đŸ®', 'đŸ¯', 'đŸ²'],
  'Äá»“ Äƒn': ['đŸ•', 'đŸ”', 'đŸŸ', 'đŸŒ­', 'đŸ¿', 'đŸ§‚', 'đŸ¥“', 'đŸ¥', 'đŸ³', 'đŸ§‡', 'đŸ¥', 'đŸ§ˆ', 'đŸ', 'đŸ¥', 'đŸ¥–', 'đŸ¥¨', 'đŸ§€', 'đŸ¥—', 'đŸ±', 'đŸœ', 'đŸ', 'đŸ°', 'đŸ‚', 'đŸ©', 'đŸª', 'đŸ«', 'đŸ¬', 'â˜•', 'đŸµ', 'đŸ¥¤', 'đŸº', 'đŸ·'],
  'Tá»± nhiĂªn': ['đŸŒ¸', 'đŸŒº', 'đŸŒ»', 'đŸŒ¹', 'đŸŒ·', 'đŸŒ¼', 'đŸ’', 'đŸŒ±', 'đŸŒ²', 'đŸŒ³', 'đŸŒ´', 'đŸŒµ', 'đŸ€', 'đŸ', 'đŸ‚', 'đŸƒ', 'đŸŒ¿', 'â˜€ï¸', 'đŸŒ™', 'â­', 'đŸŒˆ', 'â˜ï¸', 'â›ˆï¸', 'â„ï¸', 'đŸ”¥', 'đŸ’§'],
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export const EmojiPicker = ({ onEmojiSelect }: EmojiPickerProps) => {
  const [selectedCategory, setSelectedCategory] = useState('Cáº£m xĂºc');
  const [isOpen, setIsOpen] = useState(false);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
          <Smile className="w-6 h-6 text-gold" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Category Tabs */}
        <div className="flex gap-1 p-2 border-b border-border overflow-x-auto scrollbar-none">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="text-xs whitespace-nowrap"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Emoji Grid */}
        <div className="p-2 grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {EMOJI_CATEGORIES[selectedCategory as keyof typeof EMOJI_CATEGORIES].map((emoji, index) => (
            <button
              key={index}
              onClick={() => handleEmojiClick(emoji)}
              className="w-8 h-8 flex items-center justify-center text-xl hover:bg-secondary rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

```

### FILE: src/modules/chat/components/BlockUserDialog.tsx
`$ext
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BlockUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  isBlocking: boolean;
  onConfirm: () => void;
  mode: 'block' | 'unblock';
}

export function BlockUserDialog({
  open,
  onOpenChange,
  username,
  isBlocking,
  onConfirm,
  mode,
}: BlockUserDialogProps) {
  const title = mode === 'block' ? 'Táº¡m ngá»«ng káº¿t ná»‘i' : 'Káº¿t ná»‘i láº¡i';
  const body =
    mode === 'block'
      ? `Báº¡n cĂ³ cháº¯c muá»‘n táº¡m ngá»«ng káº¿t ná»‘i vá»›i ${username}? Báº¡n sáº½ khĂ´ng thá»ƒ nháº¯n tin trá»±c tiáº¿p vá»›i nhau.`
      : `Báº¡n cĂ³ muá»‘n káº¿t ná»‘i láº¡i vá»›i ${username}?`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{body}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBlocking}>
            Há»§y
          </Button>
          <Button
            variant={mode === 'block' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isBlocking}
          >
            {isBlocking ? 'Äang xá»­ lĂ½...' : mode === 'block' ? 'Táº¡m ngá»«ng' : 'Káº¿t ná»‘i láº¡i'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/chat/components/CallControls.tsx
`$ext
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  Camera,
  SwitchCamera,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface CallControlsProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isVideoCall: boolean;
  hasMultipleCameras?: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchToVideo?: () => void;
  onFlipCamera?: () => void;
  onOpenSettings?: () => void;
  onEndCall: () => void;
}

export function CallControls({
  isMuted,
  isCameraOff,
  isVideoCall,
  hasMultipleCameras = false,
  onToggleMute,
  onToggleCamera,
  onSwitchToVideo,
  onFlipCamera,
  onOpenSettings,
  onEndCall,
}: CallControlsProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4 p-3 sm:p-4 bg-background/80 backdrop-blur-sm rounded-full">
      {/* Mute button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleMute}
        className={cn(
          'h-11 w-11 sm:h-12 sm:w-12 rounded-full',
          isMuted && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
        )}
      >
        {isMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
      </Button>

      {/* Camera toggle (for video calls) */}
      {isVideoCall && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCamera}
          className={cn(
            'h-11 w-11 sm:h-12 sm:w-12 rounded-full',
            isCameraOff && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
          )}
        >
          {isCameraOff ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
        </Button>
      )}

      {/* Flip camera button (only on mobile with multiple cameras) */}
      {isVideoCall && !isCameraOff && hasMultipleCameras && isMobile && onFlipCamera && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onFlipCamera}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <SwitchCamera className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* Settings button (on desktop or when multiple cameras available) */}
      {onOpenSettings && (!isMobile || (hasMultipleCameras && !isMobile)) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* Switch to video (for voice calls) */}
      {!isVideoCall && onSwitchToVideo && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSwitchToVideo}
          className="h-11 w-11 sm:h-12 sm:w-12 rounded-full"
        >
          <Camera className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      )}

      {/* End call button */}
      <Button
        variant="destructive"
        size="icon"
        onClick={onEndCall}
        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
      >
        <PhoneOff className="h-5 w-5 sm:h-6 sm:w-6" />
      </Button>
    </div>
  );
}

```

### FILE: src/modules/chat/components/CallRoom.tsx
`$ext
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallControls } from './CallControls';
import { VideoGrid } from './VideoGrid';
import { ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import { Phone, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CallState, CallType, RemoteUser } from '../types';

interface CallRoomProps {
  isOpen: boolean;
  callState: CallState;
  callType: CallType;
  callDuration: number;
  localVideoTrack: ICameraVideoTrack | null;
  remoteUsers: RemoteUser[];
  isMuted: boolean;
  isCameraOff: boolean;
  hasMultipleCameras?: boolean;
  localUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  remoteUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchToVideo?: () => void;
  onFlipCamera?: () => void;
  onOpenSettings?: () => void;
  onEndCall: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CallRoom({
  isOpen,
  callState,
  callType,
  callDuration,
  localVideoTrack,
  remoteUsers,
  isMuted,
  isCameraOff,
  hasMultipleCameras = false,
  localUserInfo,
  remoteUserInfo,
  onToggleMute,
  onToggleCamera,
  onSwitchToVideo,
  onFlipCamera,
  onOpenSettings,
  onEndCall,
}: CallRoomProps) {
  const isConnected = callState === 'connected';
  const isConnecting = callState === 'connecting' || callState === 'calling' || callState === 'ringing';
  const isVideoCall = callType === 'video';

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-none w-screen h-screen p-0 border-none bg-background [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative w-full h-full flex flex-col">
          {/* Top bar with call info */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-background/70 to-transparent">
            <div className="flex items-center gap-3">
              <div className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                isConnected ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'
              )}>
                {isConnected ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    {formatDuration(callDuration)}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {callState === 'ringing' ? 'Äang Ä‘á»• chuĂ´ng...' : 'Äang káº¿t ná»‘i...'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-foreground">
              {isVideoCall ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              <span className="text-sm">{isVideoCall ? 'Video Call' : 'Voice Call'}</span>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 relative">
            {isVideoCall && isConnected ? (
              <VideoGrid
                localVideoTrack={localVideoTrack}
                remoteUsers={remoteUsers}
                isLocalCameraOff={isCameraOff}
                isLocalMuted={isMuted}
                localUserInfo={localUserInfo}
                remoteUserInfo={remoteUserInfo}
              />
            ) : (
              // Voice call or connecting state - show avatars
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-muted to-background">
                {/* Remote user avatar */}
                <div className="relative">
                  {isConnecting && (
                    <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" style={{ width: '160px', height: '160px', margin: '-8px' }} />
                  )}
                  <Avatar className="h-36 w-36 ring-4 ring-background shadow-2xl">
                    <AvatarImage src={remoteUserInfo?.avatarUrl} />
                    <AvatarFallback className="text-5xl bg-primary text-primary-foreground">
                      {(remoteUserInfo?.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <h2 className="mt-6 text-2xl font-semibold text-foreground">
                  {remoteUserInfo?.username || 'NgÆ°á»i dĂ¹ng'}
                </h2>

                <p className="mt-2 text-muted-foreground">
                  {isConnected ? (
                    formatDuration(callDuration)
                  ) : callState === 'ringing' ? (
                    'Äang Ä‘á»• chuĂ´ng...'
                  ) : (
                    'Äang káº¿t ná»‘i...'
                  )}
                </p>

                {/* Show local user small avatar */}
                <div className="absolute bottom-32 right-6">
                  <Avatar className="h-20 w-20 ring-2 ring-background shadow-lg">
                    <AvatarImage src={localUserInfo?.avatarUrl} />
                    <AvatarFallback className="text-xl">
                      {(localUserInfo?.username || 'Me')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs bg-background/50 text-foreground px-2 py-0.5 rounded">
                    Báº¡n
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <CallControls
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isVideoCall={isVideoCall}
              hasMultipleCameras={hasMultipleCameras}
              onToggleMute={onToggleMute}
              onToggleCamera={onToggleCamera}
              onSwitchToVideo={!isVideoCall ? onSwitchToVideo : undefined}
              onFlipCamera={onFlipCamera}
              onOpenSettings={onOpenSettings}
              onEndCall={onEndCall}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/ChatInput.tsx
`$ext
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Paperclip, Send, X, Gift, Wallet, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadCommentMedia } from '@/utils/mediaUpload';
import { toast } from 'sonner';
import { EmojiPicker } from '@/components/feed/EmojiPicker';
import { SendCryptoModal } from './SendCryptoModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { rewriteChatAttachmentUrl } from '@/lib/urlFix';
import type { Message } from '../types';
import type { Sticker } from '../types';
import { StickerPicker } from './StickerPicker';
import { RedEnvelopeDialog } from './RedEnvelopeDialog';

interface ChatInputProps {
  onSend: (content: string, mediaUrls?: string[]) => Promise<void>;
  onSendSticker?: (sticker: Sticker) => Promise<void>;
  onCreateRedEnvelope?: (input: { token: 'CAMLY' | 'BNB'; totalAmount: number; totalCount: number }) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  replyTo: Message | null;
  onCancelReply: () => void;
  isSending: boolean;
  recipientWalletAddress?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAvatar?: string | null;
  conversationId?: string | null;
  isGroup?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function ChatInput({
  onSend,
  onSendSticker,
  onCreateRedEnvelope,
  onTyping,
  replyTo,
  onCancelReply,
  isSending,
  recipientWalletAddress,
  recipientUserId,
  recipientName,
  recipientAvatar,
  conversationId,
  isGroup = false,
  disabled = false,
  disabledReason,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [isCreatingEnvelope, setIsCreatingEnvelope] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isImageFile = (file: File | undefined) => {
    if (!file) return false;
    if (file.type.startsWith('image/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'].includes(ext || '');
  };

  const isVideoFile = (file: File | undefined) => {
    if (!file) return false;
    if (file.type.startsWith('video/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'mov', 'm4v'].includes(ext || '');
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onTyping(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 4 files
    const newFiles = files.slice(0, 4 - mediaFiles.length);
    if (files.length > newFiles.length) {
      toast.warning('Tá»‘i Ä‘a 4 file má»—i tin nháº¯n');
    }

    // Create previews for images/videos only
    const newPreviews = newFiles.map((file) =>
      isImageFile(file) || isVideoFile(file)
        ? URL.createObjectURL(file)
        : ''
    );
    
    setMediaFiles((prev) => [...prev, ...newFiles]);
    setMediaPreviews((prev) => [...prev, ...newPreviews]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    if (mediaPreviews[index]) {
      URL.revokeObjectURL(mediaPreviews[index]);
    }
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && mediaFiles.length === 0) return;

    try {
      setIsUploading(true);

      // Upload media files
      let uploadedUrls: string[] = [];
      if (mediaFiles.length > 0) {
        const uploadPromises = mediaFiles.map((file) => uploadCommentMedia(file));
        const results = await Promise.all(uploadPromises);
        uploadedUrls = results.map((r) => rewriteChatAttachmentUrl(r.url));
      }

      await onSend(trimmedContent, uploadedUrls.length > 0 ? uploadedUrls : undefined);

      // Clear input
      setContent('');
      setMediaFiles([]);
      mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
      setMediaPreviews([]);
      onTyping(false);

    } catch (error) {
      console.error('Error sending message:', error);
      if (error instanceof Error && error.message === 'FILE_TYPE_NOT_SUPPORTED') {
        toast.error('File nĂ y chÆ°a Ä‘Æ°á»£c há»— trá»£ hoáº·c thiáº¿u MIME. Vui lĂ²ng thá»­ láº¡i hoáº·c Ä‘á»•i Ä‘á»‹nh dáº¡ng.');
      } else {
        toast.error('KhĂ´ng thá»ƒ gá»­i tin nháº¯n');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = useCallback((emoji: string) => {
    setContent((prev) => prev + emoji);
    textareaRef.current?.focus();
  }, []);

  const isDisabled = isSending || isUploading;
  const canSend = (content.trim() || mediaFiles.length > 0) && !isDisabled && !disabled;

  return (
    <div className="border-t bg-card p-3">
      {disabled && disabledReason && (
        <div className="mb-2 text-xs text-destructive">{disabledReason}</div>
      )}
      {!isGroup && !recipientWalletAddress && (
        <div className="mb-2 text-xs text-muted-foreground">
          NgÆ°á»i dĂ¹ng chÆ°a cáº­p nháº­t vĂ­ Web3. KhĂ´ng thá»ƒ táº·ng tiá»n.
        </div>
      )}
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Tráº£ lá»i {replyTo.sender?.username}
            </p>
            <p className="text-sm truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Media previews */}
      {mediaPreviews.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
          {mediaPreviews.map((preview, index) => {
            const file = mediaFiles[index];
            const isImage = isImageFile(file);
            const isVideo = isVideoFile(file);
            return (
              <div key={index} className="relative flex-shrink-0">
                {isImage && preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="h-16 w-16 object-cover rounded-lg"
                  />
                ) : isVideo && preview ? (
                  <video
                    src={preview}
                    className="h-16 w-16 object-cover rounded-lg"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="h-16 w-32 rounded-lg border bg-muted flex items-center gap-2 px-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs truncate">{file?.name || 'File'}</span>
                  </div>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full"
                  onClick={() => removeMedia(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.apk"
          multiple
          className="hidden"
        />

        {/* Attach menu popup (Paperclip) */}
        <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-full"
              disabled={isDisabled || disabled}
              title="ÄĂ­nh kĂ¨m"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-52 p-1">
            <div className="flex flex-col">
              {/* ÄĂ­nh kĂ¨m file */}
              <button
                onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                disabled={mediaFiles.length >= 4}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ÄĂ­nh kĂ¨m file
              </button>

              {/* Stickers */}
              <button
                onClick={() => { setShowAttachMenu(false); setTimeout(() => setShowStickerPicker(true), 100); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left"
              >
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Stickers
              </button>

              {/* LĂ¬ xĂ¬ */}
              <button
                onClick={() => { setShowRedEnvelope(true); setShowAttachMenu(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left"
              >
                <Gift className="h-4 w-4 text-[#C9A84C] flex-shrink-0" />
                LĂ¬ xĂ¬
              </button>

              {/* Crypto Gift â€” chá»‰ hiá»‡n khi khĂ´ng pháº£i group */}
              {!isGroup && (
                <button
                  onClick={() => { setShowCryptoModal(true); setShowAttachMenu(false); }}
                  disabled={!recipientWalletAddress}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  Crypto Gift
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <EmojiPicker onEmojiSelect={handleEmojiSelect} />

        {/* StickerPicker controlled tá»« state */}
        <StickerPicker
          open={showStickerPicker}
          onOpenChange={setShowStickerPicker}
          disabled={isDisabled || disabled}
          onSelect={async (sticker) => {
            if (!onSendSticker) return;
            await onSendSticker(sticker);
            setShowStickerPicker(false);
          }}
        />

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Nháº­p tin nháº¯n..."
          className="min-h-[40px] max-h-[120px] resize-none flex-1"
          rows={1}
          disabled={isDisabled || disabled}
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'flex-shrink-0 transition-colors',
            canSend && 'bg-primary hover:bg-primary/90'
          )}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      <RedEnvelopeDialog
        open={showRedEnvelope}
        onOpenChange={setShowRedEnvelope}
        isCreating={isCreatingEnvelope}
        onCreate={async (input) => {
          if (!onCreateRedEnvelope) return;
          try {
            setIsCreatingEnvelope(true);
            await onCreateRedEnvelope(input);
            setShowRedEnvelope(false);
          } finally {
            setIsCreatingEnvelope(false);
          }
        }}
      />

      <SendCryptoModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        recipientAddress={recipientWalletAddress}
        recipientUserId={recipientUserId}
        recipientName={recipientName}
        recipientAvatar={recipientAvatar}
        conversationId={conversationId}
      />
    </div>
  );
}




```

### FILE: src/modules/chat/components/ChatSettingsDialog.tsx
`$ext
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings, Eye, Keyboard, Users } from 'lucide-react';
import { useChatSettings, type ChatSettings } from '../hooks/useChatSettings';
import { toast } from 'sonner';

interface ChatSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

export function ChatSettingsDialog({
  open,
  onOpenChange,
  userId,
}: ChatSettingsDialogProps) {
  const { settings, updateSettings, isLoading } = useChatSettings(userId);

  const handleUpdate = async (updates: Partial<ChatSettings>) => {
    try {
      await updateSettings.mutateAsync(updates);
      toast.success('ÄĂ£ cáº­p nháº­t cĂ i Ä‘áº·t');
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('KhĂ´ng thá»ƒ cáº­p nháº­t cĂ i Ä‘áº·t');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            CĂ i Ä‘áº·t tin nháº¯n
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Who can message */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label>Ai cĂ³ thá»ƒ nháº¯n tin cho báº¡n</Label>
            </div>
            <Select
              value={settings?.who_can_message || 'friends'}
              onValueChange={(value) => handleUpdate({ who_can_message: value })}
              disabled={isLoading || updateSettings.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Má»i ngÆ°á»i</SelectItem>
                <SelectItem value="friends">Chá»‰ báº¡n bĂ¨</SelectItem>
                <SelectItem value="nobody">KhĂ´ng ai</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              NgÆ°á»i ngoĂ i danh sĂ¡ch sáº½ khĂ´ng thá»ƒ gá»­i tin nháº¯n má»›i cho báº¡n
            </p>
          </div>

          <Separator />

          {/* Read receipts */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="read-receipts">XĂ¡c nháº­n Ä‘Ă£ Ä‘á»c</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Hiá»ƒn thá»‹ khi báº¡n Ä‘Ă£ xem tin nháº¯n
              </p>
            </div>
            <Switch
              id="read-receipts"
              checked={settings?.show_read_receipts ?? true}
              onCheckedChange={(checked) => handleUpdate({ show_read_receipts: checked })}
              disabled={isLoading || updateSettings.isPending}
            />
          </div>

          <Separator />

          {/* Typing indicator */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="typing-indicator">Tráº¡ng thĂ¡i Ä‘ang nháº­p</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Cho ngÆ°á»i khĂ¡c biáº¿t khi báº¡n Ä‘ang nháº­p
              </p>
            </div>
            <Switch
              id="typing-indicator"
              checked={settings?.show_typing_indicator ?? true}
              onCheckedChange={(checked) => handleUpdate({ show_typing_indicator: checked })}
              disabled={isLoading || updateSettings.isPending}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/ConversationList.tsx
`$ext
import { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { vi, enUS, zhCN, ja, ko, th, id, fr, es, de, pt, ru, ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { Users, Search } from 'lucide-react';
import type { Locale } from 'date-fns';
import type { Conversation, ConversationParticipant } from '../types';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  isSearching?: boolean;
}

const dateLocales: Record<string, Locale> = {
  vi, en: enUS, zh: zhCN, ja, ko, th, id, fr, es, de, pt, ru, ar
};
const conversationListScrollByUser = new Map<string, number>();

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  onSelect,
  isLoading,
  isSearching,
}: ConversationListProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();
  const dateLocale = dateLocales[language] || enUS;

  useEffect(() => {
    const root = scrollRootRef.current as any;
    if (!root) return;

    const viewport = root.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;

    const key = currentUserId || 'anonymous';
    const cachedTop = conversationListScrollByUser.get(key);
    if (typeof cachedTop === 'number') {
      viewport.scrollTop = cachedTop;
    }

    const onScroll = () => {
      conversationListScrollByUser.set(key, viewport.scrollTop);
    };

    viewport.addEventListener('scroll', onScroll);
    return () => {
      conversationListScrollByUser.set(key, viewport.scrollTop);
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [currentUserId]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-muted-foreground gap-2">
        {isSearching ? (
          <>
            <Search className="h-10 w-10 opacity-40" />
            <p className="text-sm">KhĂ´ng tĂ¬m tháº¥y há»™i thoáº¡i nĂ o</p>
          </>
        ) : (
          <p>{t('noConversations')}</p>
        )}
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRootRef} className="flex-1">
      <div className="p-2">
        {conversations.map((conversation) => {
          const isGroup = conversation.type === 'group';
          const otherParticipant = conversation.participants?.find(
            (p: ConversationParticipant) => p.user_id !== currentUserId && !p.left_at
          );
          const profile = otherParticipant?.profile;
          const participantCount = conversation.participants?.filter(
            (p: ConversationParticipant) => !p.left_at
          ).length || 0;

          const displayName = isGroup
            ? conversation.name
            : profile?.full_name || profile?.username || t('user');

          const avatarUrl = isGroup
            ? conversation.avatar_url
            : profile?.avatar_url;

          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-full text-left transition-all duration-300 border hover:bg-white hover:shadow-[0_0_12px_rgba(34,197,94,0.5)]',
                selectedId === conversation.id ? 'bg-primary/10 border-[#C9A84C]/60' : 'border-transparent hover:border-[#C9A84C]/40'
              )}
            >
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName || ''} />
                  <AvatarFallback>
                    {isGroup ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      (displayName || 'U')[0].toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                {isGroup && (
                  <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
                    <Users className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'truncate',
                      conversation.unread_count ? 'font-bold text-foreground' : 'font-medium'
                    )}>
                      {displayName}
                    </span>
                    {isGroup && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {participantCount}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {conversation.last_message_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conversation.last_message_at), {
                          addSuffix: false,
                          locale: dateLocale,
                        })}
                      </span>
                    )}
                    {conversation.unread_count && conversation.unread_count > 0 ? (
                      <span className="min-w-[20px] h-5 px-1.5 bg-destructive text-destructive-foreground text-[11px] font-bold rounded-full flex items-center justify-center leading-none">
                        {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                      </span>
                    ) : null}
                  </div>
                </div>
                {conversation.last_message_preview && (
                  <p className={cn(
                    'text-sm truncate',
                    conversation.unread_count ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {conversation.last_message_preview}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

```

### FILE: src/modules/chat/components/CreateGroupDialog.tsx
`$ext
import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, X, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  isCreating?: boolean;
}

interface User {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreateGroup,
  isCreating = false,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  // Fetch friends
  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends-for-group', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];

      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendIds = friendships?.map((f) =>
        f.user_id === currentUserId ? f.friend_id : f.user_id
      ) || [];

      if (friendIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', friendIds);

      return profiles || [];
    },
    enabled: open && !!currentUserId,
  });

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users-group', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', currentUserId)
        .or(`username.ilike.%${debouncedSearch}%,full_name.ilike.%${debouncedSearch}%`)
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const displayUsers = useMemo(() => {
    const users = debouncedSearch.length >= 2 ? searchResults || [] : friends || [];
    return users.filter((u) => !selectedUsers.some((s) => s.id === u.id));
  }, [debouncedSearch, friends, searchResults, selectedUsers]);

  const isLoading = friendsLoading || searchLoading;

  const handleSelectUser = (user: User) => {
    setSelectedUsers((prev) => [...prev, user]);
    setSearch('');
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = () => {
    if (groupName.trim() && selectedUsers.length >= 1) {
      onCreateGroup(groupName.trim(), selectedUsers.map((u) => u.id));
      // Reset state
      setGroupName('');
      setSelectedUsers([]);
      setSearch('');
    }
  };

  const canCreate = groupName.trim().length > 0 && selectedUsers.length >= 1 && !isCreating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Táº¡o nhĂ³m má»›i
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group name */}
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="TĂªn nhĂ³m..."
          />

          {/* Selected members */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {user.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{user.full_name || user.username}</span>
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ThĂªm thĂ nh viĂªn..."
              className="pl-9"
            />
          </div>

          {/* User list */}
          <ScrollArea className="h-[200px]">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : displayUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {debouncedSearch.length >= 2
                  ? 'KhĂ´ng tĂ¬m tháº¥y ngÆ°á»i dĂ¹ng'
                  : 'Chá»n báº¡n bĂ¨ Ä‘á»ƒ thĂªm vĂ o nhĂ³m'}
              </div>
            ) : (
              <div className="space-y-1">
                {displayUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
                      <AvatarFallback>
                        {user.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.full_name || user.username}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Há»§y
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Äang táº¡o...
              </>
            ) : (
              'Táº¡o nhĂ³m'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/CryptoGiftButton.tsx
`$ext
import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { SendCryptoModal } from './SendCryptoModal';

interface CryptoGiftButtonProps {
  recipientAddress?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAvatar?: string | null;
  conversationId?: string | null;
  disabled?: boolean;
}

class CryptoGiftErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    toast.error('Wallet system not ready. Please refresh or reconnect.');
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function CryptoGiftButton({ 
  recipientAddress, 
  recipientUserId,
  recipientName,
  recipientAvatar,
  conversationId,
  disabled,
}: CryptoGiftButtonProps) {
  const [open, setOpen] = useState(false);
  const isDisabled = disabled || !recipientAddress;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-full"
              onClick={() => setOpen(true)}
              disabled={isDisabled}
            >
              <Wallet className="h-5 w-5 text-gold" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Send crypto gift</TooltipContent>
      </Tooltip>

      <CryptoGiftErrorBoundary>
        <SendCryptoModal
          open={open}
          onOpenChange={setOpen}
          recipientAddress={recipientAddress}
          recipientUserId={recipientUserId}
          recipientName={recipientName}
          recipientAvatar={recipientAvatar}
          conversationId={conversationId}
        />
      </CryptoGiftErrorBoundary>
    </>
  );
}

```

### FILE: src/modules/chat/components/EditMessageDialog.tsx
`$ext
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface EditMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: string;
  isSaving: boolean;
  onSave: (next: string) => void;
}

export function EditMessageDialog({
  open,
  onOpenChange,
  initialValue,
  isSaving,
  onSave,
}: EditMessageDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sá»­a tin nháº¯n</DialogTitle>
        </DialogHeader>
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[100px]" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Há»§y
          </Button>
          <Button onClick={() => onSave(value)} disabled={isSaving || !value.trim()}>
            {isSaving ? 'Äang lÆ°u...' : 'LÆ°u'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/chat/components/GroupSettingsDialog.tsx
`$ext
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  UserMinus, 
  UserPlus, 
  LogOut, 
  Crown, 
  Loader2,
  ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Conversation, ConversationParticipant } from '../types';

interface GroupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  currentUserId: string | null;
  onUpdate: () => void;
  onLeave: () => void;
}

export function GroupSettingsDialog({
  open,
  onOpenChange,
  conversation,
  currentUserId,
  onUpdate,
  onLeave,
}: GroupSettingsDialogProps) {
  const [groupName, setGroupName] = useState(conversation.name || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const participants = conversation.participants?.filter((p) => !p.left_at) || [];
  const currentParticipant = participants.find((p) => p.user_id === currentUserId);
  const isAdmin = currentParticipant?.role === 'admin';

  const handleUpdateName = async () => {
    if (!groupName.trim() || groupName === conversation.name) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ name: groupName.trim() })
        .eq('id', conversation.id);

      if (error) throw error;
      toast.success('ÄĂ£ cáº­p nháº­t tĂªn nhĂ³m');
      onUpdate();
    } catch (error) {
      console.error('Error updating group name:', error);
      toast.error('KhĂ´ng thá»ƒ cáº­p nháº­t tĂªn nhĂ³m');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('user_id', userId);

      if (error) throw error;
      toast.success('ÄĂ£ xĂ³a thĂ nh viĂªn');
      onUpdate();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('KhĂ´ng thá»ƒ xĂ³a thĂ nh viĂªn');
    }
  };

  const handleLeaveGroup = async () => {
    setIsLeaving(true);
    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('user_id', currentUserId);

      if (error) throw error;
      toast.success('ÄĂ£ rá»i nhĂ³m');
      onLeave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('KhĂ´ng thá»ƒ rá»i nhĂ³m');
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            CĂ i Ä‘áº·t nhĂ³m
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={conversation.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {(conversation.name || 'G')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <button className="absolute bottom-0 right-0 p-1 bg-primary rounded-full text-primary-foreground hover:bg-primary/90">
                  <ImagePlus className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Group name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">TĂªn nhĂ³m</label>
            <div className="flex gap-2">
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                disabled={!isAdmin}
              />
              {isAdmin && (
                <Button
                  onClick={handleUpdateName}
                  disabled={isUpdating || !groupName.trim() || groupName === conversation.name}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'LÆ°u'}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">ThĂ nh viĂªn ({participants.length})</span>
              {isAdmin && (
                <Button variant="ghost" size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  ThĂªm
                </Button>
              )}
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {participants.map((participant) => {
                  const profile = participant.profile;
                  const isCurrentUser = participant.user_id === currentUserId;
                  const isMemberAdmin = participant.role === 'admin';

                  return (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {(profile?.username || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {profile?.full_name || profile?.username || 'NgÆ°á»i dĂ¹ng'}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">Báº¡n</Badge>
                          )}
                          {isMemberAdmin && (
                            <Crown className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          @{profile?.username}
                        </p>
                      </div>

                      {isAdmin && !isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(participant.user_id)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Leave group */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <LogOut className="h-4 w-4 mr-2" />
                Rá»i nhĂ³m
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rá»i khá»i nhĂ³m?</AlertDialogTitle>
                <AlertDialogDescription>
                  Báº¡n sáº½ khĂ´ng thá»ƒ xem tin nháº¯n má»›i trong nhĂ³m nĂ y sau khi rá»i Ä‘i.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Há»§y</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeaveGroup} disabled={isLeaving}>
                  {isLeaving ? 'Äang rá»i...' : 'Rá»i nhĂ³m'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/IncomingCallDialog.tsx
`$ext
import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { CallSession, CallType } from '../types';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface CallerInfo {
  username: string;
  full_name?: string;
  avatar_url?: string;
}

interface IncomingCallDialogProps {
  callSession: CallSession | null;
  onAnswer: () => void;
  onDecline: () => void;
}

export function IncomingCallDialog({
  callSession,
  onAnswer,
  onDecline,
}: IncomingCallDialogProps) {
  const [callerInfo, setCallerInfo] = useState<CallerInfo | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Fetch caller info
  useEffect(() => {
    if (!callSession) {
      setCallerInfo(null);
      return;
    }

    const fetchCaller = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', callSession.initiator_id)
        .single();

      if (data) {
        setCallerInfo(data);
      }
    };

    fetchCaller();
  }, [callSession]);

  // Play ringtone
  useEffect(() => {
    if (!callSession) {
      // Stop and cleanup ringtone
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        ringtoneRef.current = null;
      }
      return;
    }

    // Create and play ringtone
    const ringtone = new Audio('/sounds/ringtone.mp3');
    ringtone.loop = true;
    ringtone.volume = 0.7;
    ringtoneRef.current = ringtone;
    
    // Try to play (may fail if no user interaction yet)
    ringtone.play().catch(err => {
      console.log('[Ringtone] Autoplay blocked:', err.message);
    });

    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;
      ringtoneRef.current = null;
    };
  }, [callSession]);

  // Vibrate on mobile
  useEffect(() => {
    if (!callSession) return;

    if (navigator.vibrate) {
      const pattern = [200, 100, 200, 100, 200];
      navigator.vibrate(pattern);
      
      const interval = setInterval(() => {
        navigator.vibrate(pattern);
      }, 2000);

      return () => {
        clearInterval(interval);
        navigator.vibrate(0);
      };
    }
  }, [callSession]);

  if (!callSession) return null;

  const isVideoCall = callSession.call_type === 'video';

  return (
    <Dialog open={!!callSession} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md bg-gradient-to-b from-background to-muted border-none [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="incoming-call-description"
      >
        <VisuallyHidden>
          <DialogTitle>Cuá»™c gá»i Ä‘áº¿n</DialogTitle>
          <DialogDescription id="incoming-call-description">
            {callerInfo?.full_name || callerInfo?.username || 'NgÆ°á»i dĂ¹ng'} Ä‘ang gá»i cho báº¡n
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col items-center py-8 space-y-6">
          {/* Animated ring effect */}
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/30 h-28 w-28" />
            <div className="absolute inset-2 animate-ping animation-delay-150 rounded-full bg-primary/20 h-24 w-24" />
            <Avatar className="h-24 w-24 relative z-10 ring-4 ring-background">
              <AvatarImage src={callerInfo?.avatar_url} alt={callerInfo?.full_name || callerInfo?.username} />
              <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
                {(callerInfo?.full_name || callerInfo?.username || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Caller info */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold">
              {callerInfo?.full_name || callerInfo?.username || 'NgÆ°á»i dĂ¹ng'}
            </h3>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              {isVideoCall ? (
                <>
                  <Video className="h-4 w-4" />
                  Cuá»™c gá»i video Ä‘áº¿n...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Cuá»™c gá»i thoáº¡i Ä‘áº¿n...
                </>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-8 pt-4">
            {/* Decline button */}
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDecline();
                }}
                className="h-16 w-16 rounded-full shadow-lg hover:scale-105 transition-transform"
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
              <span className="text-sm text-muted-foreground">Tá»« chá»‘i</span>
            </div>

            {/* Answer button */}
            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnswer();
                }}
                className={cn(
                  'h-16 w-16 rounded-full shadow-lg hover:scale-105 transition-transform',
                  'bg-green-500 hover:bg-green-600'
                )}
              >
                {isVideoCall ? (
                  <Video className="h-7 w-7" />
                ) : (
                  <Phone className="h-7 w-7" />
                )}
              </Button>
              <span className="text-sm text-muted-foreground">Tráº£ lá»i</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/MessageBubble.tsx
`$ext
import { useState, useRef, useCallback, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LazyImage } from '@/components/ui/LazyImage';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { FileText, Reply, SmilePlus, Check, CheckCheck, MoreHorizontal, Pin, PinOff, Pencil, Trash2, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { R2_NEW_PUBLIC_URL, rewriteChatAttachmentUrl } from '@/lib/urlFix';
import type { Message } from '../types';
import { RedEnvelopeCard } from './RedEnvelopeCard';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  currentUserId: string | null;
  onReply: () => void;
  onReaction: (emoji: string, hasReacted: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onReport?: () => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  currentUserId,
  onReply,
  onReaction,
  onEdit,
  onDelete,
  onTogglePin,
  onReport,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback(() => {
    longPressRef.current = setTimeout(() => {
      setShowActions(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);
  const mediaUrls = Array.isArray(message.media_urls) ? message.media_urls as string[] : [];
  const normalizedMediaUrls = mediaUrls.map((url) => rewriteChatAttachmentUrl(url));

  const getExtension = (url: string) => {
    try {
      const pathname = new URL(url).pathname;
      const name = pathname.split('/').pop() || '';
      const ext = name.split('.').pop() || '';
      return ext.toLowerCase();
    } catch {
      const name = url.split('?')[0].split('#')[0].split('/').pop() || '';
      return name.split('.').pop()?.toLowerCase() || '';
    }
  };

  const isImageUrl = (url: string) => {
    const ext = getExtension(url);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'].includes(ext);
  };

  const isVideoUrl = (url: string) => {
    const ext = getExtension(url);
    return ['mp4', 'webm', 'mov', 'm4v'].includes(ext);
  };

  const getFilename = (url: string) => {
    try {
      const pathname = new URL(url).pathname;
      return decodeURIComponent(pathname.split('/').pop() || 'file');
    } catch {
      return decodeURIComponent(url.split('?')[0].split('#')[0].split('/').pop() || 'file');
    }
  };
  
  // Group reactions by emoji
  const reactionCounts = message.reactions?.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const userReactions = message.reactions
    ?.filter((r) => r.user_id === currentUserId)
    .map((r) => r.emoji) || [];

  const isRead = message.read_by && message.read_by.length > 0;
  const isPinned = !!message.pinned_at;
  const isDeleted = !!message.is_deleted;
  const messageType = (message.message_type || 'text') as string;
  const metadata: any = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};

  const createdAt = message.created_at ? new Date(message.created_at) : null;
  const canEditByTime = createdAt ? (Date.now() - createdAt.getTime()) <= 15 * 60 * 1000 : false;
  const canEdit = isOwn && !isDeleted && messageType === 'text' && canEditByTime;

  return (
    <div
      className={cn('flex gap-2 group', isOwn ? 'flex-row-reverse' : '')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Avatar */}
      <div className="w-8 flex-shrink-0">
        {showAvatar && !isOwn && message.sender && (
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={message.sender.avatar_url || undefined}
              alt={message.sender.username}
            />
            <AvatarFallback>
              {message.sender.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Message content */}
      <div className={cn('flex flex-col max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
        {/* Reply preview */}
        {message.reply_to && (
          <div className={cn(
            'text-xs px-3 py-1 rounded-t-lg bg-muted/50 border-l-2',
            isOwn ? 'border-primary' : 'border-muted-foreground'
          )}>
            <span className="text-muted-foreground">
              Trả lời {message.reply_to.sender?.username || 'tin nhắn'}
            </span>
            <p className="truncate">{message.reply_to.content}</p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2 rounded-2xl relative',
            messageType === 'system'
              ? 'bg-amber-50 text-foreground border border-amber-200'
              : isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted rounded-bl-md',
            message.reply_to && 'rounded-t-none'
          )}
        >
          {isDeleted ? (
            <p className="text-sm italic opacity-80">Tin nhắn đã được thu hồi / xóa</p>
          ) : messageType === 'sticker' ? (
            <div className="flex flex-col items-center">
              <img
                src={metadata?.sticker?.url || metadata?.stickerUrl || ''}
                alt={metadata?.sticker?.name || 'sticker'}
                className="w-32 h-32 object-contain"
              />
            </div>
          ) : messageType === 'red_envelope' ? (
            (metadata?.envelopeId || metadata?.envelope_id) ? (
              <RedEnvelopeCard
                envelopeId={metadata?.envelopeId || metadata?.envelope_id}
                conversationId={message.conversation_id}
                currentUserId={currentUserId}
                compact
              />
            ) : (
              <p className="text-sm">[Red Envelope]</p>
            )
          ) : (
            <>
              {/* Text content */}
              {message.content && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}

              {/* Media */}
              {normalizedMediaUrls.length > 0 && (
                <div className={cn('mt-2 grid gap-1', normalizedMediaUrls.length > 1 ? 'grid-cols-2' : '')}>
                  {normalizedMediaUrls.map((url, i) => {
                    if (isImageUrl(url)) {
                      const skipTransform = url.startsWith(R2_NEW_PUBLIC_URL);
                      return (
                        <LazyImage
                          key={i}
                          src={url}
                          alt=""
                          skipTransform={skipTransform}
                          className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90"
                        />
                      );
                    }

                    if (isVideoUrl(url)) {
                      return (
                        <video
                          key={i}
                          src={url}
                          controls
                          playsInline
                          preload="metadata"
                          className="rounded-lg max-w-full h-auto"
                        />
                      );
                    }

                    const filename = getFilename(url);
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{filename}</div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="text-xs text-primary hover:underline"
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Reactions display */}
          {Object.keys(reactionCounts).length > 0 && (
            <div className={cn(
              'absolute -bottom-3 flex gap-0.5 bg-card rounded-full px-1 py-0.5 shadow-sm border',
              isOwn ? 'right-2' : 'left-2'
            )}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <span key={emoji} className="text-xs">
                  {emoji}{count > 1 && <span className="text-muted-foreground">{count}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp & read status */}
        <div className="flex items-center gap-1 mt-1 px-2">
          <span className="text-[10px] text-muted-foreground">
            {message.created_at && format(new Date(message.created_at), 'HH:mm', { locale: vi })}
          </span>
          {!isDeleted && message.edited_at && (
            <span className="text-[10px] text-muted-foreground">(đã sửa)</span>
          )}
          {!isDeleted && isPinned && (
            <span className="text-[10px] text-muted-foreground">(ghim)</span>
          )}
          {isOwn && (
            <span className="text-muted-foreground">
              {isRead ? (
                <CheckCheck className="h-3 w-3 text-primary" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-center gap-1 opacity-0 transition-opacity',
          showActions && 'opacity-100'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onReply}
            >
              <Reply className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Trả lời</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <SmilePlus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="top">
            <div className="flex gap-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(emoji, userReactions.includes(emoji))}
                  className={cn(
                    'text-xl p-1 rounded hover:bg-accent transition-colors',
                    userReactions.includes(emoji) && 'bg-accent'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
            <DropdownMenuItem onClick={onTogglePin} disabled={!onTogglePin}>
              {isPinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
              {isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit} disabled={!canEdit || !onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Sửa tin nhắn
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} disabled={!isOwn || isDeleted || !onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Thu hồi / Xóa
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReport} disabled={!onReport}>
              <Flag className="h-4 w-4 mr-2" />
              Gửi phản hồi
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});


```

### FILE: src/modules/chat/components/MessageSearch.tsx
`$ext
import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, Loader2, MessageSquare } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface MessageSearchProps {
  conversationId: string;
  onSelectMessage?: (messageId: string) => void;
  onClose?: () => void;
  participants?: Array<{ id: string; username: string }>;
  excludedSenderIds?: string[];
}

interface SearchResult {
  id: string;
  content: string | null;
  created_at: string | null;
  sender_id: string;
  sender: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
}

export function MessageSearch({
  conversationId,
  onSelectMessage,
  onClose,
  participants,
  excludedSenderIds = [],
}: MessageSearchProps) {
  const [search, setSearch] = useState('');
  const [senderId, setSenderId] = useState<string>('all');
  const debouncedSearch = useDebounce(search, 400);
  const normalizedSearch = debouncedSearch.trim();
  const excludedSenderIdsKey = excludedSenderIds.slice().sort().join(',');

  const { data: results, isLoading } = useQuery({
    queryKey: ['message-search', conversationId, normalizedSearch, senderId, excludedSenderIdsKey],
    queryFn: async () => {
      if (!normalizedSearch || normalizedSearch.length < 2) return [];

      const escapeIlikePattern = (value: string) => value.replace(/[%_]/g, '\\$&');
      const pattern = `%${escapeIlikePattern(normalizedSearch)}%`;

      let query = supabase
        .from('messages')
        .select('id, content, created_at, sender_id')
        .eq('conversation_id', conversationId)
        .ilike('content', pattern);

      if (senderId !== 'all') {
        query = query.eq('sender_id', senderId);
      }

      const { data: messages, error } = await query
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!messages?.length) return [];

      const excluded = new Set(excludedSenderIds);
      const filteredMessages = messages.filter((m) => !excluded.has(m.sender_id));
      if (!filteredMessages.length) return [];

      // Fetch sender profiles
      const senderIds = [...new Set(filteredMessages.map((m) => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return filteredMessages.map((m) => ({
        ...m,
        sender: profileMap.get(m.sender_id) || null,
      })) as SearchResult[];
    },
    enabled: normalizedSearch.length >= 2,
  });

  const handleSelect = useCallback(
    (messageId: string) => {
      onSelectMessage?.(messageId);
    },
    [onSelectMessage]
  );

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightMatch = (text: string | null, query: string) => {
    if (!text) return null;
    const safe = escapeRegExp(query);
    const parts = text.split(new RegExp(`(${safe})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-primary/30 text-foreground rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm tin nhắn..."
            className="pl-9"
            autoFocus
          />
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sender filter */}
      <div className="flex items-center gap-2 p-3 border-b bg-card">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Người gửi</span>
        <Select value={senderId} onValueChange={setSenderId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {participants?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !normalizedSearch || normalizedSearch.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
            <p>Nhập từ khóa để tìm kiếm</p>
          </div>
        ) : results?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-12 w-12 mb-4 opacity-50" />
            <p>Không tìm thấy kết quả</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {results?.map((result) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result.id)}
                className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-accent text-left transition-colors"
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={result.sender?.avatar_url || undefined} />
                  <AvatarFallback>{(result.sender?.username || 'U')[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{result.sender?.username}</span>
                    {result.created_at && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(result.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {result.content
                      ? highlightMatch(result.content, normalizedSearch)
                      : '[Tin nhắn không có văn bản]'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

```

### FILE: src/modules/chat/components/MessageThread.tsx
`$ext
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMessages } from '../hooks/useMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useConversation } from '../hooks/useConversations';
import { useAgoraCall } from '../hooks/useAgoraCall';
import { usePins } from '../hooks/usePins';
import { useBlocks } from '../hooks/useBlocks';
import { useReports } from '../hooks/useReports';
import { useAngelInline } from '../hooks/useAngelInline';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { MessageSearch } from './MessageSearch';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import { IncomingCallDialog } from './IncomingCallDialog';
import { CallRoom } from './CallRoom';
import { EditMessageDialog } from './EditMessageDialog';
import { ReportDialog } from './ReportDialog';
import { BlockUserDialog } from './BlockUserDialog';

import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Search, Settings, Users, Phone, Video, MoreHorizontal, Pin, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message, ConversationParticipant } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MessageThreadProps {
  conversationId: string;
  userId: string | null;
  username: string | null;
}

export function MessageThread({ conversationId, userId, username }: MessageThreadProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false)
  const { data: conversation, refetch: refetchConversation } = useConversation(conversationId);
  const {
    messages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    sendMessage,
    markAsRead,
    addReaction,
    removeReaction,
    editMessage,
    softDeleteMessage,
  } = useMessages(conversationId, userId);

  const { typingUsers, sendTyping } = useTypingIndicator(conversationId, userId, username);

  // Agora call hook
  const {
    callState,
    callType,
    remoteUsers,
    isMuted,
    isCameraOff,
    incomingCall,
    callDuration,
    localVideoTrack,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchToVideo,
  } = useAgoraCall({ conversationId, userId });

  // Get other participant for header
  const otherParticipant = conversation?.participants?.find(
    (p: ConversationParticipant) => p.user_id !== userId && !p.left_at
  );
  const headerProfile = otherParticipant?.profile;
  const isGroup = conversation?.type === 'group';
  const participantCount = conversation?.participants?.filter((p: ConversationParticipant) => !p.left_at).length || 0;

  const { pinnedMessage, pinMessage, unpinMessage } = usePins(conversationId);
  const { blockedIds, blockedByIds, blockUser, unblockUser } = useBlocks(userId);
  const { createReport } = useReports(userId);
  const { invokeAngel } = useAngelInline();
  
  const headerName = isGroup
    ? conversation?.name
    : headerProfile?.full_name || headerProfile?.username || 'NgÆ°á»i dĂ¹ng';
  const headerAvatar = isGroup
    ? conversation?.avatar_url
    : headerProfile?.avatar_url;
  const recipientUserId = !isGroup ? otherParticipant?.user_id || null : null;
  // Chat gift should only read the single source of truth from Profile (web3_wallet_address).
  const recipientWalletAddress = !isGroup ? headerProfile?.wallet_address || null : null;

  const dmOtherUserId = !isGroup ? recipientUserId : null;
  const isDmBlockedByMe = !!dmOtherUserId && blockedIds.has(dmOtherUserId);
  const isDmBlockedMe = !!dmOtherUserId && blockedByIds.has(dmOtherUserId);
  const isDmBlocked = isDmBlockedByMe || isDmBlockedMe;

  const visibleMessages = messages.filter((m) => {
    if (!userId) return true;
    if (m.sender_id === userId) return true;
    return !blockedIds.has(m.sender_id);
  });

  const getViewportEl = () => scrollRootRef.current;
  const scheduleScrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
      scrollRafRef.current = null;
    });
  };

  // Track whether the user is near the bottom; used to avoid yanking scroll when loading older messages.
  useEffect(() => {
    const viewport = getViewportEl();
    if (!viewport) return;

    const onScroll = () => {
      const thresholdPx = 80;
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isAtBottomRef.current = distanceFromBottom <= thresholdPx;
      setShowJumpToLatest(!isAtBottomRef.current);
      if (isAtBottomRef.current) {
        setNewMessagesCount(0);
      }
    };

    onScroll();
    viewport.addEventListener('scroll', onScroll);
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll to bottom on initial load, and when new messages arrive while user is at bottom.
  useEffect(() => {
    if (isLoading) return;
    if (!bottomRef.current) return;
    const previousCount = previousMessageCountRef.current;
    const incomingCount = Math.max(messages.length - previousCount, 0);
    previousMessageCountRef.current = messages.length;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scheduleScrollToBottom();
      setShowJumpToLatest(false);
      setNewMessagesCount(0);
      return;
    }
    if (isAtBottomRef.current) {
      scheduleScrollToBottom();
      setShowJumpToLatest(false);
      setNewMessagesCount(0);
    } else {
      if (incomingCount > 0) {
        setShowJumpToLatest(true);
        setNewMessagesCount((prev) => prev + incomingCount);
      }
    }
  }, [isLoading, messages.length]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // Mark messages as read
  useEffect(() => {
    if (!userId || messages.length === 0) return;

    const unreadIds = messages
      .filter(
      (m) => m.sender_id !== userId && !m.read_by?.includes(userId)
      )
      .map((m) => m.id)
      .filter((id) => !pendingReadIdsRef.current.has(id));

    if (!unreadIds.length) return;

    unreadIds.forEach((id) => pendingReadIdsRef.current.add(id));
    markAsRead(unreadIds)
      .catch(() => undefined)
      .finally(() => {
        unreadIds.forEach((id) => pendingReadIdsRef.current.delete(id));
      });
  }, [messages, userId, markAsRead]);

  const handleSend = async (content: string, mediaUrls?: string[]) => {
    const trimmed = (content || '').trim();
    await sendMessage.mutateAsync({
      content,
      mediaUrls,
      replyToId: replyTo?.id,
    });
    setReplyTo(null);

    if (trimmed.toLowerCase().startsWith('@angel')) {
      const prompt = trimmed.replace(/^@angel\s*/i, '').trim();
      if (!prompt) return;
      invokeAngel.mutate(
        { conversationId, prompt },
        {
          onError: (e: any) => {
            toast.error(e?.message || 'Angel AI pháº£n há»“i tháº¥t báº¡i');
          },
        }
      );
    }
  };

  const handleSendSticker = async (sticker: any) => {
    await sendMessage.mutateAsync({
      content: '[Sticker]',
      mediaUrls: [],
      replyToId: replyTo?.id,
      messageType: 'sticker',
      metadata: { sticker },
    });
    setReplyTo(null);
  };

  const handleCreateRedEnvelope = async (input: { token: 'CAMLY' | 'BNB'; totalAmount: number; totalCount: number }) => {
    if (!userId) throw new Error('Not authenticated');
    // Create envelope row
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: envelope, error: envErr } = await supabase
      .from('red_envelopes')
      .insert({
        creator_id: userId,
        conversation_id: conversationId,
        token: input.token,
        total_amount: input.totalAmount,
        total_count: input.totalCount,
        remaining_amount: input.totalAmount,
        remaining_count: input.totalCount,
        expires_at: expiresAt,
        status: 'active',
      })
      .select('id')
      .single();
    if (envErr) throw envErr;

    // Send envelope message
    const msg = await sendMessage.mutateAsync({
      content: '[Red Envelope]',
      mediaUrls: [],
      replyToId: replyTo?.id,
      messageType: 'red_envelope',
      metadata: { envelopeId: envelope.id },
    });
    setReplyTo(null);

    // Best-effort link message_id back to envelope
    if ((msg as any)?.id) {
      supabase.from('red_envelopes').update({ message_id: (msg as any).id }).eq('id', envelope.id).then(() => undefined);
    }
  };

  const handleReaction = (messageId: string, emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      removeReaction.mutate({ messageId, emoji });
    } else {
      addReaction.mutate({ messageId, emoji });
    }
  };

  const handleGroupUpdate = () => {
    refetchConversation();
    queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
  };

  const handleLeaveGroup = () => {
    navigate('/chat');
  };

  const scrollToMessage = async (messageId: string) => {
    // Best-effort: try to locate the message in DOM; if not loaded, fetch older pages.
    const tryScroll = () => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightMessageId(messageId);
        window.setTimeout(() => {
          setHighlightMessageId((current) => (current === messageId ? null : current));
        }, 1800);
        return true;
      }
      return false;
    };

    if (tryScroll()) return true;

    // Try fetching older pages a few times.
    for (let i = 0; i < 8; i++) {
      if (!hasNextPage || isFetchingNextPage) break;
      await fetchNextPage();
      // Let React render.
      await new Promise((r) => setTimeout(r, 50));
      if (tryScroll()) return true;
    }

    toast.warning('KhĂ´ng tĂ¬m tháº¥y tin nháº¯n trong lá»‹ch sá»­ Ä‘Ă£ táº£i.');
    return false;
  };

  const handleJumpToLatest = () => {
    scheduleScrollToBottom('smooth');
    setShowJumpToLatest(false);
    setNewMessagesCount(0);
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : ''}`}>
              <Skeleton className={`h-12 ${i % 2 === 0 ? 'w-48' : 'w-64'} rounded-2xl`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (showSearch) {
    const participants =
      conversation?.participants
        ?.filter((p: ConversationParticipant) => !p.left_at)
        .map((p: ConversationParticipant) => ({
          id: p.user_id,
          username: p.profile?.full_name || p.profile?.username || 'NgÆ°á»i dĂ¹ng',
        })) || [];
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <MessageSearch
          conversationId={conversationId}
          participants={participants}
          excludedSenderIds={Array.from(blockedIds)}
          onClose={() => setShowSearch(false)}
          onSelectMessage={async (messageId) => {
            await scrollToMessage(messageId);
            setShowSearch(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={headerAvatar || undefined} alt={headerName || ''} />
            <AvatarFallback>{(headerName || 'U')[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{headerName}</p>
            {isGroup ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participantCount} thĂ nh viĂªn
              </p>
            ) : typingUsers.length > 0 ? (
              <p className="text-xs text-muted-foreground">Äang nháº­p...</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Call buttons */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => startCall('voice')}
            disabled={callState !== 'idle' || (!isGroup && isDmBlocked)}
            title="Gá»i thoáº¡i"
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => startCall('video')}
            disabled={callState !== 'idle' || (!isGroup && isDmBlocked)}
            title="Gá»i video"
          >
            <Video className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)}>
            <Search className="h-5 w-5" />
          </Button>
          {isGroup && (
            <Button variant="ghost" size="icon" onClick={() => setShowGroupSettings(true)}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
          {!isGroup && dmOtherUserId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowBlockDialog(true)} disabled={isDmBlockedMe && !isDmBlockedByMe}>
                  {isDmBlockedMe && !isDmBlockedByMe
                    ? 'Báº¡n Ä‘Ă£ bá»‹ táº¡m ngá»«ng káº¿t ná»‘i'
                    : isDmBlockedByMe
                      ? 'Káº¿t ná»‘i láº¡i'
                      : 'Táº¡m ngá»«ng káº¿t ná»‘i'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  XĂ³a cuá»™c trĂ² chuyá»‡n
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Pinned banner */}
      {pinnedMessage && (
        <div className="px-4 py-2 border-b bg-card flex items-center justify-between gap-2">
          <button
            onClick={() => scrollToMessage(pinnedMessage.id)}
            className="flex items-center gap-2 min-w-0 text-left"
            title="Äi Ä‘áº¿n tin nháº¯n Ä‘Ă£ ghim"
          >
            <Pin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate">
              {pinnedMessage.content || '(Tin nháº¯n Ä‘Ă£ ghim)'}
            </span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => unpinMessage.mutate(pinnedMessage.id)}
            disabled={unpinMessage.isPending}
          >
            {unpinMessage.isPending ? '...' : 'Bá» ghim'}
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRootRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="space-y-4">
          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Äang táº£i...' : 'Táº£i tin nháº¯n cÅ© hÆ¡n'}
              </Button>
            </div>
          )}

          {visibleMessages.map((message, index) => {
            const isOwn = message.sender_id === userId;
            const showAvatar = !isOwn && (
              index === 0 || visibleMessages[index - 1]?.sender_id !== message.sender_id
            );

            return (
              <div
                key={message.id}
                id={`msg-${message.id}`}
                className={cn(
                  'rounded-md transition-colors',
                  highlightMessageId === message.id && 'bg-primary/10 ring-1 ring-primary/30'
                )}
              >
                <MessageBubble
                message={message}
                isOwn={isOwn}
                showAvatar={showAvatar}
                currentUserId={userId}
                onReply={() => setReplyTo(message)}
                onReaction={(emoji, hasReacted) => handleReaction(message.id, emoji, hasReacted)}
                onTogglePin={() => {
                  if (message.pinned_at) {
                    unpinMessage.mutate(message.id);
                  } else {
                    pinMessage.mutate(message.id);
                  }
                }}
                onEdit={() => setEditingMessage(message)}
                onDelete={() => {
                  if (!isOwn) return;
                  if (window.confirm('Thu há»“i / xĂ³a tin nháº¯n nĂ y?')) {
                    softDeleteMessage.mutate({ messageId: message.id });
                  }
                }}
                onReport={() => {
                  setReportTarget(message);
                  setShowReport(true);
                }}
              />
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <TypingIndicator users={typingUsers} />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showJumpToLatest && (
        <div className="absolute right-4 z-20 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-24">
          <Button size="sm" onClick={handleJumpToLatest} className="rounded-full shadow-lg">
            {newMessagesCount > 0 ? `Tin má»›i nháº¥t (${newMessagesCount})` : 'Tin má»›i nháº¥t'}
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 z-10 bg-card pb-[env(safe-area-inset-bottom)]">
        <ChatInput
          onSend={handleSend}
          onSendSticker={handleSendSticker}
          onCreateRedEnvelope={handleCreateRedEnvelope}
          onTyping={sendTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          isSending={sendMessage.isPending}
          recipientWalletAddress={recipientWalletAddress}
          recipientUserId={recipientUserId}
          recipientName={headerName}
          recipientAvatar={headerAvatar}
          conversationId={conversationId}
          isGroup={isGroup}
          disabled={!isGroup && isDmBlocked}
          disabledReason={
            !isGroup && isDmBlocked
              ? isDmBlockedByMe
                ? 'Báº¡n Ä‘Ă£ táº¡m ngá»«ng káº¿t ná»‘i. KhĂ´ng thá»ƒ nháº¯n tin trá»±c tiáº¿p.'
                : 'NgÆ°á»i dĂ¹ng nĂ y Ä‘Ă£ táº¡m ngá»«ng káº¿t ná»‘i vá»›i báº¡n. KhĂ´ng thá»ƒ nháº¯n tin trá»±c tiáº¿p.'
              : undefined
          }
        />
      </div>

      <EditMessageDialog
        open={!!editingMessage}
        onOpenChange={(open) => {
          if (!open) setEditingMessage(null);
        }}
        initialValue={editingMessage?.content || ''}
        isSaving={editMessage.isPending}
        onSave={async (next) => {
          if (!editingMessage) return;
          try {
            await editMessage.mutateAsync({ messageId: editingMessage.id, content: next });
            setEditingMessage(null);
            toast.success('ÄĂ£ cáº­p nháº­t');
          } catch (e: any) {
            toast.error(e?.message || 'KhĂ´ng thá»ƒ sá»­a tin nháº¯n');
          }
        }}
      />

      <ReportDialog
        open={showReport}
        onOpenChange={(open) => {
          setShowReport(open);
          if (!open) setReportTarget(null);
        }}
        isSubmitting={createReport.isPending}
        onSubmit={async ({ reason, details }) => {
          if (!reportTarget) return;
          try {
            await createReport.mutateAsync({
              reportedUserId: reportTarget.sender_id,
              conversationId,
              messageId: reportTarget.id,
              reason,
              details,
            });
            toast.success('ÄĂ£ gá»­i pháº£n há»“i');
            setShowReport(false);
            setReportTarget(null);
          } catch (e: any) {
            toast.error(e?.message || 'KhĂ´ng thá»ƒ gá»­i pháº£n há»“i');
          }
        }}
      />

      {!isGroup && dmOtherUserId && (
        <BlockUserDialog
          open={showBlockDialog}
          onOpenChange={setShowBlockDialog}
          username={headerName}
          mode={isDmBlockedByMe ? 'unblock' : 'block'}
          isBlocking={blockUser.isPending || unblockUser.isPending}
          onConfirm={async () => {
            try {
              if (isDmBlockedByMe) {
                await unblockUser.mutateAsync(dmOtherUserId);
                toast.success('ÄĂ£ káº¿t ná»‘i láº¡i');
              } else {
                await blockUser.mutateAsync(dmOtherUserId);
                toast.success('ÄĂ£ táº¡m ngá»«ng káº¿t ná»‘i');
              }
              setShowBlockDialog(false);
            } catch (e: any) {
              toast.error(e?.message || 'KhĂ´ng thá»ƒ thá»±c hiá»‡n');
            }
          }}
        />
      )}

      {/* Group Settings Dialog */}
      {isGroup && conversation && (
        <GroupSettingsDialog
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          conversation={conversation}
          currentUserId={userId}
          onUpdate={handleGroupUpdate}
          onLeave={handleLeaveGroup}
        />
      )}

      {/* Incoming Call Dialog */}
      <IncomingCallDialog
        callSession={incomingCall}
        onAnswer={answerCall}
        onDecline={declineCall}
      />

      {/* Active Call Room */}
      <CallRoom
        isOpen={callState !== 'idle' && !incomingCall}
        callState={callState}
        callType={callType}
        callDuration={callDuration}
        localVideoTrack={localVideoTrack}
        remoteUsers={remoteUsers}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        localUserInfo={{
          username: username || undefined,
          avatarUrl: undefined,
        }}
        remoteUserInfo={{
          username: headerProfile?.full_name || headerProfile?.username,
          avatarUrl: headerProfile?.avatar_url,
        }}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onSwitchToVideo={switchToVideo}
        onEndCall={endCall}
      />

      {/* Delete Conversation Confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>XĂ³a cuá»™c trĂ² chuyá»‡n?</AlertDialogTitle>
            <AlertDialogDescription>
              Cuá»™c trĂ² chuyá»‡n sáº½ bá»‹ xĂ³a khá»i danh sĂ¡ch cá»§a báº¡n. Báº¡n cĂ³ thá»ƒ báº¯t Ä‘áº§u cuá»™c trĂ² chuyá»‡n má»›i báº¥t cá»© lĂºc nĂ o.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Há»§y</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!userId) return;
                setIsDeleting(true);
                try {
                  const { error } = await supabase
                    .from('conversation_participants')
                    .update({ left_at: new Date().toISOString() })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', userId);
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
                  toast.success('ÄĂ£ xĂ³a cuá»™c trĂ² chuyá»‡n');
                  navigate('/chat');
                } catch (err: any) {
                  toast.error(err?.message || 'KhĂ´ng thá»ƒ xĂ³a cuá»™c trĂ² chuyá»‡n');
                } finally {
                  setIsDeleting(false);
                  setShowDeleteConfirm(false);
                }
              }}
            >
              {isDeleting ? 'Äang xĂ³a...' : 'XĂ³a'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


```

### FILE: src/modules/chat/components/NewConversationDialog.tsx
`$ext
import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  onSelectUser: (userId: string) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  currentUserId,
  onSelectUser,
}: NewConversationDialogProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Fetch friends first
  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends-for-chat', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];

      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendIds = friendships?.map((f) =>
        f.user_id === currentUserId ? f.friend_id : f.user_id
      ) || [];

      if (friendIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', friendIds);

      return profiles || [];
    },
    enabled: open && !!currentUserId,
  });

  // Search all users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users-chat', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', currentUserId)
        .or(`username.ilike.%${debouncedSearch}%,full_name.ilike.%${debouncedSearch}%`)
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const displayUsers = useMemo(() => {
    if (debouncedSearch.length >= 2) {
      return searchResults || [];
    }
    return friends || [];
  }, [debouncedSearch, friends, searchResults]);

  const isLoading = friendsLoading || (debouncedSearch.length >= 2 && searchLoading);

  const handleSelect = (userId: string) => {
    onSelectUser(userId);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cuá»™c trĂ² chuyá»‡n má»›i</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="TĂ¬m kiáº¿m ngÆ°á»i dĂ¹ng..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {debouncedSearch.length >= 2
                ? 'KhĂ´ng tĂ¬m tháº¥y ngÆ°á»i dĂ¹ng'
                : 'Báº¡n chÆ°a cĂ³ báº¡n bĂ¨ nĂ o'}
            </div>
          ) : (
            <div className="space-y-1">
              {!debouncedSearch && friends && friends.length > 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">Báº¡n bĂ¨</p>
              )}
              {displayUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url || undefined} alt={user.username} />
                    <AvatarFallback>
                      {user.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user.full_name || user.username}</p>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/PreCallSettings.tsx
`$ext
/**
 * Pre-Call Settings Dialog
 * Allows users to select camera, microphone, and preview video before joining a call
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mic, MicOff, Video, VideoOff, Phone, RefreshCw, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AgoraRTC, { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useMediaDevices, MediaDevice } from '../hooks/useMediaDevices';
import type { CallType } from '../types';

interface PreCallSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onStartCall: (type: CallType) => void;
  callType: CallType;
  userInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  recipientInfo?: {
    username?: string;
    avatarUrl?: string;
  };
}

export function PreCallSettings({
  isOpen,
  onClose,
  onStartCall,
  callType,
  userInfo,
  recipientInfo,
}: PreCallSettingsProps) {
  const [previewVideoTrack, setPreviewVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [previewAudioTrack, setPreviewAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const {
    devices,
    isEnumerating,
    audioLevel,
    hasMultipleCameras,
    selectCamera,
    selectMicrophone,
    flipCamera,
    startAudioLevelMonitor,
    stopAudioLevelMonitor,
  } = useMediaDevices({
    videoTrack: previewVideoTrack,
    audioTrack: previewAudioTrack,
  });

  // Create preview tracks when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const createTracks = async () => {
      setIsLoading(true);
      try {
        if (callType === 'video') {
          const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks();
          setPreviewAudioTrack(audio);
          setPreviewVideoTrack(video);
        } else {
          const audio = await AgoraRTC.createMicrophoneAudioTrack();
          setPreviewAudioTrack(audio);
        }
      } catch (error) {
        console.error('[PreCallSettings] Failed to create tracks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    createTracks();

    return () => {
      // Cleanup tracks when dialog closes
      previewVideoTrack?.close();
      previewAudioTrack?.close();
      setPreviewVideoTrack(null);
      setPreviewAudioTrack(null);
      stopAudioLevelMonitor();
    };
  }, [isOpen, callType]);

  // Play video in container
  useEffect(() => {
    if (previewVideoTrack && videoContainerRef.current && !isCameraOff) {
      previewVideoTrack.play(videoContainerRef.current);
    }
    return () => {
      previewVideoTrack?.stop();
    };
  }, [previewVideoTrack, isCameraOff]);

  // Start audio level monitoring
  useEffect(() => {
    if (previewAudioTrack && !isMuted) {
      startAudioLevelMonitor();
    }
    return () => {
      stopAudioLevelMonitor();
    };
  }, [previewAudioTrack, isMuted, startAudioLevelMonitor, stopAudioLevelMonitor]);

  const handleToggleMute = useCallback(async () => {
    if (previewAudioTrack) {
      await previewAudioTrack.setEnabled(isMuted);
      setIsMuted(!isMuted);
    }
  }, [previewAudioTrack, isMuted]);

  const handleToggleCamera = useCallback(async () => {
    if (previewVideoTrack) {
      await previewVideoTrack.setEnabled(isCameraOff);
      setIsCameraOff(!isCameraOff);
    }
  }, [previewVideoTrack, isCameraOff]);

  const handleStartCall = useCallback(() => {
    // Close preview tracks before starting real call
    previewVideoTrack?.close();
    previewAudioTrack?.close();
    setPreviewVideoTrack(null);
    setPreviewAudioTrack(null);
    onStartCall(callType);
    onClose();
  }, [previewVideoTrack, previewAudioTrack, onStartCall, callType, onClose]);

  const handleCameraChange = useCallback(async (deviceId: string) => {
    await selectCamera(deviceId);
  }, [selectCamera]);

  const handleMicrophoneChange = useCallback(async (deviceId: string) => {
    await selectMicrophone(deviceId);
  }, [selectMicrophone]);

  const handleClose = useCallback(() => {
    previewVideoTrack?.close();
    previewAudioTrack?.close();
    setPreviewVideoTrack(null);
    setPreviewAudioTrack(null);
    onClose();
  }, [previewVideoTrack, previewAudioTrack, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            CĂ i Ä‘áº·t cuá»™c gá»i
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient info */}
          {recipientInfo && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Avatar className="h-10 w-10">
                <AvatarImage src={recipientInfo.avatarUrl} />
                <AvatarFallback>
                  {(recipientInfo.username || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{recipientInfo.username || 'NgÆ°á»i dĂ¹ng'}</p>
                <p className="text-sm text-muted-foreground">
                  {callType === 'video' ? 'Video call' : 'Voice call'}
                </p>
              </div>
            </div>
          )}

          {/* Video Preview */}
          {callType === 'video' && (
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : isCameraOff ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={userInfo?.avatarUrl} />
                    <AvatarFallback className="text-2xl">
                      {(userInfo?.username || 'Me')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="mt-2 text-sm text-muted-foreground">Camera Ä‘Ă£ táº¯t</p>
                </div>
              ) : (
                <div ref={videoContainerRef} className="w-full h-full" />
              )}

              {/* Overlay controls */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleMute}
                  className={cn(
                    'h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm',
                    isMuted && 'bg-destructive/20 text-destructive'
                  )}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleCamera}
                  className={cn(
                    'h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm',
                    isCameraOff && 'bg-destructive/20 text-destructive'
                  )}
                >
                  {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </Button>

                {hasMultipleCameras && !isCameraOff && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={flipCamera}
                    className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Audio only preview */}
          {callType === 'voice' && (
            <div className="flex items-center justify-center p-6 bg-muted rounded-lg">
              <Avatar className="h-20 w-20">
                <AvatarImage src={userInfo?.avatarUrl} />
                <AvatarFallback className="text-3xl">
                  {(userInfo?.username || 'Me')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          {/* Device Selection */}
          <div className="space-y-3">
            {/* Camera Selection */}
            {callType === 'video' && devices.cameras.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Camera</Label>
                <Select
                  value={devices.selectedCamera || undefined}
                  onValueChange={handleCameraChange}
                  disabled={isEnumerating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chá»n camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.cameras.map((camera) => (
                      <SelectItem key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Microphone Selection */}
            {devices.microphones.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Microphone</Label>
                <Select
                  value={devices.selectedMicrophone || undefined}
                  onValueChange={handleMicrophoneChange}
                  disabled={isEnumerating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chá»n microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.microphones.map((mic) => (
                      <SelectItem key={mic.deviceId} value={mic.deviceId}>
                        {mic.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Audio Level Indicator */}
            {!isMuted && (
              <div className="space-y-1.5">
                <Label className="text-sm">Kiá»ƒm tra micro</Label>
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <Progress value={audioLevel} className="flex-1 h-2" />
                </div>
                <p className="text-xs text-muted-foreground">
                  NĂ³i Ä‘á»ƒ kiá»ƒm tra microphone
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Huá»·
          </Button>
          <Button onClick={handleStartCall} disabled={isLoading}>
            <Phone className="h-4 w-4 mr-2" />
            {callType === 'video' ? 'Gá»i Video' : 'Gá»i thoáº¡i'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/RedEnvelopeCard.tsx
`$ext
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRedEnvelope } from '../hooks/useRedEnvelope';
import { RedEnvelopeClaimDialog } from './RedEnvelopeClaimDialog';

interface RedEnvelopeCardProps {
  envelopeId: string;
  conversationId: string;
  currentUserId: string | null;
  compact?: boolean;
}

export function RedEnvelopeCard({
  envelopeId,
  conversationId,
  currentUserId,
  compact,
}: RedEnvelopeCardProps) {
  const [openDetails, setOpenDetails] = useState(false);
  const { envelope, claims, isLoading, claim } = useRedEnvelope(envelopeId, conversationId);

  const hasClaimed = useMemo(() => {
    if (!currentUserId) return false;
    return claims.some((c) => c.claimer_id === currentUserId);
  }, [claims, currentUserId]);

  const isActive = envelope?.status === 'active' && new Date(envelope.expires_at) > new Date();
  const canClaim = !!currentUserId && isActive && !hasClaimed && (envelope?.remaining_count || 0) > 0;

  return (
    <>
      <div
        className={cn(
          'rounded-xl border bg-gradient-to-br from-[#C62828] via-[#B71C1C] to-[#7f1d1d] text-white p-3 shadow-sm',
          compact && 'p-2'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">LĂ¬ xĂ¬</div>
            <div className="text-xs text-white/80">
              {isLoading || !envelope
                ? 'Äang táº£i...'
                : `${envelope.remaining_count}/${envelope.total_count} cĂ²n láº¡i`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpenDetails(true)}
              className="bg-white/15 hover:bg-white/20 text-white border-white/20"
            >
              Xem
            </Button>
            <Button
              size="sm"
              onClick={() => claim.mutate()}
              disabled={!canClaim || claim.isPending}
              className="bg-[#FFD700] hover:bg-[#FFC107] text-[#2E2A1F]"
            >
              {claim.isPending ? '...' : hasClaimed ? 'ÄĂ£ nháº­n' : 'Nháº­n'}
            </Button>
          </div>
        </div>
        {!isLoading && envelope && (
          <div className="mt-2 text-xs text-white/80">
            CĂ²n láº¡i: {envelope.remaining_amount} {envelope.token}
          </div>
        )}
        {!isLoading && envelope && !isActive && (
          <div className="mt-2 text-xs text-white/80">ÄĂ£ háº¿t háº¡n hoáº·c Ä‘Ă£ háº¿t.</div>
        )}
      </div>

      <RedEnvelopeClaimDialog
        open={openDetails}
        onOpenChange={setOpenDetails}
        envelope={envelope}
        claims={claims}
      />
    </>
  );
}


```

### FILE: src/modules/chat/components/RedEnvelopeClaimDialog.tsx
`$ext
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RedEnvelope, RedEnvelopeClaim } from '../types';

interface RedEnvelopeClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envelope: RedEnvelope | null;
  claims: RedEnvelopeClaim[];
}

export function RedEnvelopeClaimDialog({
  open,
  onOpenChange,
  envelope,
  claims,
}: RedEnvelopeClaimDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiáº¿t lĂ¬ xĂ¬</DialogTitle>
        </DialogHeader>

        {!envelope ? (
          <div className="text-sm text-muted-foreground">KhĂ´ng tĂ¬m tháº¥y lĂ¬ xĂ¬.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex justify-between">
                <span>Tá»•ng</span>
                <span className="font-medium">
                  {envelope.total_amount} {envelope.token}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ÄĂ£ nháº­n</span>
                <span className="font-medium">
                  {envelope.total_count - envelope.remaining_count}/{envelope.total_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span>CĂ²n láº¡i</span>
                <span className="font-medium">
                  {envelope.remaining_amount} {envelope.token}
                </span>
              </div>
            </div>

            <div className="text-sm font-medium">Danh sĂ¡ch nháº­n</div>
            <ScrollArea className="h-48 rounded-md border">
              <div className="p-2 space-y-1">
                {claims.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">ChÆ°a cĂ³ ai nháº­n.</div>
                ) : (
                  claims.map((c) => (
                    <div key={c.id} className="flex justify-between text-sm rounded-md px-2 py-1 hover:bg-accent">
                      <span className="font-mono text-xs">{c.claimer_id.slice(0, 8)}...</span>
                      <span className="font-medium">
                        {c.amount} {envelope.token}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ÄĂ³ng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/chat/components/RedEnvelopeDialog.tsx
`$ext
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RedEnvelopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  onCreate: (input: { token: 'CAMLY' | 'BNB'; totalAmount: number; totalCount: number }) => void;
}

export function RedEnvelopeDialog({ open, onOpenChange, isCreating, onCreate }: RedEnvelopeDialogProps) {
  const [token, setToken] = useState<'CAMLY' | 'BNB'>('CAMLY');
  const [amount, setAmount] = useState('10');
  const [count, setCount] = useState('5');

  useEffect(() => {
    if (open) {
      setToken('CAMLY');
      setAmount('10');
      setCount('5');
    }
  }, [open]);

  const handleCreate = () => {
    const totalAmount = Number(amount);
    const totalCount = Number(count);
    if (!totalAmount || totalAmount <= 0) return;
    if (!totalCount || totalCount <= 0) return;
    onCreate({ token, totalAmount, totalCount });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>LĂ¬ xĂ¬</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Token</Label>
            <Select value={token} onValueChange={(v) => setToken(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAMLY">CAMLY</SelectItem>
                <SelectItem value="BNB">BNB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tá»•ng sá»‘ tiá»n</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.0001" />
          </div>

          <div className="space-y-2">
            <Label>Sá»‘ ngÆ°á»i nháº­n</Label>
            <Input value={count} onChange={(e) => setCount(e.target.value)} type="number" min="1" step="1" />
          </div>

          <div className="text-xs text-muted-foreground">
            PhĂ¢n phá»‘i ngáº«u nhiĂªn, háº¿t háº¡n sau 24 giá».
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Há»§y
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Äang táº¡o...' : 'Táº¡o lĂ¬ xĂ¬'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/chat/components/ReportDialog.tsx
`$ext
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const REASONS = [
  { value: 'spam', label: 'Spam / Quáº£ng cĂ¡o' },
  { value: 'harassment', label: 'Quáº¥y rá»‘i / xĂºc pháº¡m' },
  { value: 'scam', label: 'Lá»«a Ä‘áº£o' },
  { value: 'hate', label: 'KĂ­ch Ä‘á»™ng thĂ¹ ghĂ©t' },
  { value: 'other', label: 'KhĂ¡c' },
];

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  onSubmit: (input: { reason: string; details: string | null }) => void;
}

export function ReportDialog({ open, onOpenChange, isSubmitting, onSubmit }: ReportDialogProps) {
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');

  const handleSubmit = () => {
    onSubmit({ reason, details: details.trim() ? details.trim() : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gá»­i pháº£n há»“i</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>LĂ½ do</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Chá»n lĂ½ do" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Chi tiáº¿t (tĂ¹y chá»n)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="MĂ´ táº£ thĂªm Ä‘á»ƒ Ä‘á»™i ngÅ© hiá»ƒu rĂµ hÆ¡n..."
              className="min-h-[90px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Há»§y
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Äang gá»­i...' : 'Gá»­i'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


```

### FILE: src/modules/chat/components/SendCryptoModal.tsx
`$ext
import { useState } from 'react';
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { bsc } from 'wagmi/chains';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle2, Wallet, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { config as wagmiConfig } from '@/config/web3';
import {
  FUN_TESTNET_NOTE,
  isTokenInImplementation,
  mapSendError,
  SEND_TRANSFER_NOTE,
  sendAsset,
  type SendToken,
  type WriteContractFn,
  validateSendInput,
} from '@/modules/wallet/services/sendAsset';

// Token logos
import bnbLogo from '@/assets/tokens/bnb-logo.webp';
import btcbLogo from '@/assets/tokens/btcb-logo.webp';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import usdtLogo from '@/assets/tokens/usdt-logo.webp';
import funWalletLogo from '@/assets/fun-wallet-logo.png';

type TokenSymbol = SendToken;

interface SendCryptoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientAddress?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAvatar?: string | null;
  conversationId?: string | null;
}

const TOKEN_LOGOS: Record<TokenSymbol, string> = {
  BNB: bnbLogo,
  BTCB: btcbLogo,
  CAMLY: camlyLogo,
  FUN: funWalletLogo,
  USDT: usdtLogo,
};

const TOKEN_LABEL: Record<TokenSymbol, string> = {
  BNB: 'BNB',
  BTCB: 'BTCB',
  CAMLY: 'CAMLY',
  FUN: 'FUN (Testnet - dang trien khai)',
  USDT: 'USDT',
};

const TokenOption = ({ token }: { token: TokenSymbol }) => (
  <div className="flex items-center gap-2">
    <img src={TOKEN_LOGOS[token]} alt={token} className="h-6 w-6 rounded-full" />
    <span className="font-medium text-[#2E2A1F]">{TOKEN_LABEL[token]}</span>
  </div>
);

// Helper to shorten wallet address
const shortenAddress = (address: string) => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Decorative SVG Components
const ApricotFlower = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="30" cy="12" rx="8" ry="12" fill="#FFD54F" opacity="0.9" />
    <ellipse cx="30" cy="48" rx="8" ry="12" fill="#FFD54F" opacity="0.9" />
    <ellipse cx="12" cy="30" rx="8" ry="12" fill="#FFD54F" opacity="0.9" transform="rotate(90 12 30)" />
    <ellipse cx="48" cy="30" rx="8" ry="12" fill="#FFD54F" opacity="0.9" transform="rotate(90 48 30)" />
    <ellipse cx="17" cy="17" rx="7" ry="11" fill="#FFD54F" opacity="0.85" transform="rotate(45 17 17)" />
    <ellipse cx="43" cy="43" rx="7" ry="11" fill="#FFD54F" opacity="0.85" transform="rotate(45 43 43)" />
    <ellipse cx="43" cy="17" rx="7" ry="11" fill="#FFD54F" opacity="0.85" transform="rotate(-45 43 17)" />
    <ellipse cx="17" cy="43" rx="7" ry="11" fill="#FFD54F" opacity="0.85" transform="rotate(-45 17 43)" />
    <circle cx="30" cy="30" r="6" fill="#D32F2F" />
    <circle cx="28" cy="28" r="1.5" fill="#FFEB3B" />
    <circle cx="32" cy="28" r="1.5" fill="#FFEB3B" />
    <circle cx="30" cy="32" r="1.5" fill="#FFEB3B" />
  </svg>
);

const PeachBlossom = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="40" cy="15" rx="10" ry="14" fill="#F8BBD9" opacity="0.9" />
    <ellipse cx="40" cy="65" rx="10" ry="14" fill="#F8BBD9" opacity="0.9" />
    <ellipse cx="15" cy="40" rx="10" ry="14" fill="#F8BBD9" opacity="0.9" transform="rotate(90 15 40)" />
    <ellipse cx="65" cy="40" rx="10" ry="14" fill="#F8BBD9" opacity="0.9" transform="rotate(90 65 40)" />
    <ellipse cx="22" cy="22" rx="9" ry="13" fill="#F8BBD9" opacity="0.85" transform="rotate(45 22 22)" />
    <ellipse cx="58" cy="58" rx="9" ry="13" fill="#F8BBD9" opacity="0.85" transform="rotate(45 58 58)" />
    <ellipse cx="58" cy="22" rx="9" ry="13" fill="#F8BBD9" opacity="0.85" transform="rotate(-45 58 22)" />
    <ellipse cx="22" cy="58" rx="9" ry="13" fill="#F8BBD9" opacity="0.85" transform="rotate(-45 22 58)" />
    <circle cx="40" cy="40" r="8" fill="#EC407A" />
    <circle cx="37" cy="37" r="2" fill="#FFEB3B" />
    <circle cx="43" cy="37" r="2" fill="#FFEB3B" />
    <circle cx="40" cy="43" r="2" fill="#FFEB3B" />
  </svg>
);

const RedEnvelope = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Main envelope body */}
    <rect x="10" y="20" width="100" height="110" rx="8" fill="#C62828" />
    <rect x="10" y="20" width="100" height="110" rx="8" stroke="#FFD700" strokeWidth="2" />
    
    {/* Top flap */}
    <path d="M10 28 L60 60 L110 28" fill="#B71C1C" />
    <path d="M10 28 L60 60 L110 28" stroke="#FFD700" strokeWidth="2" fill="none" />
    
    {/* Gold circle decoration */}
    <circle cx="60" cy="85" r="25" fill="#FFD700" />
    <circle cx="60" cy="85" r="20" fill="#FFC107" />
    <circle cx="60" cy="85" r="15" fill="#FFD700" />
    
    {/* Inner square hole pattern */}
    <rect x="52" y="77" width="16" height="16" rx="2" fill="#C62828" />
    
    {/* Decorative patterns */}
    <circle cx="35" cy="50" r="4" fill="#FFD700" opacity="0.6" />
    <circle cx="85" cy="50" r="4" fill="#FFD700" opacity="0.6" />
  </svg>
);

const Firecracker = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 40 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* String */}
    <path d="M20 0 C20 10, 15 15, 20 20" stroke="#8B4513" strokeWidth="2" fill="none" />
    
    {/* Firecracker body */}
    <rect x="8" y="20" width="24" height="35" rx="3" fill="#C62828" />
    <rect x="8" y="20" width="24" height="35" rx="3" stroke="#FFD700" strokeWidth="1" />
    
    {/* Gold bands */}
    <rect x="8" y="25" width="24" height="4" fill="#FFD700" />
    <rect x="8" y="46" width="24" height="4" fill="#FFD700" />
    
    {/* Second firecracker */}
    <rect x="12" y="58" width="20" height="30" rx="2" fill="#D32F2F" />
    <rect x="12" y="62" width="20" height="3" fill="#FFD700" />
    <rect x="12" y="81" width="20" height="3" fill="#FFD700" />
    
    {/* Small decorative dots */}
    <circle cx="20" cy="37" r="2" fill="#FFD700" />
    <circle cx="22" cy="73" r="1.5" fill="#FFD700" />
  </svg>
);

const Sparkle = ({ className, delay = 0 }: { className?: string; delay?: number }) => (
  <div 
    className={`absolute ${className}`}
    style={{
      animation: `sparkle 2s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 0 L7 4.5 L12 6 L7 7.5 L6 12 L5 7.5 L0 6 L5 4.5 Z" fill="#FFD700" />
    </svg>
  </div>
);

export function SendCryptoModal({ 
  open, 
  onOpenChange, 
  recipientAddress,
  recipientUserId,
  recipientName,
  recipientAvatar,
  conversationId,
}: SendCryptoModalProps) {
  const { isConnected, address: senderAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSendingNative } = useSendTransaction();
  const { writeContractAsync, isPending: isWritingContract } = useWriteContract();
  const [token, setToken] = useState<TokenSymbol>('BNB');
  const [amount, setAmount] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const isBusy = isConfirming || isSendingNative || isWritingContract;
  const hasRecipientWallet = !!recipientAddress;
  const isTokenDisabled = isTokenInImplementation(token);

  const resetForm = () => {
    setToken('BNB');
    setAmount('');
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (!recipientAddress) {
      toast.error('Thieu dia chi vi nguoi nhan.');
      return;
    }

    if (!recipientUserId) {
      toast.error('Thieu thong tin nguoi nhan.');
      return;
    }

    const normalizedAmount = amount.trim();

    if (!isConnected) {
      toast.error('Vui long ket noi vi truoc.');
      return;
    }

    const validation = validateSendInput({
      recipient: recipientAddress,
      amount: normalizedAmount,
      token,
      chainId,
    });

    if (!validation.ok) {
      toast.error((validation as { ok: false; error: string }).error);
      if (chainId && chainId !== bsc.id) {
        switchChain(
          { chainId: bsc.id },
          {
            onSuccess: () => toast.success('Da chuyen sang BNB Smart Chain. Vui long xac nhan lai.'),
            onError: () => toast.error('Vui long chuyen sang BNB Smart Chain de tiep tuc.'),
          }
        );
      }
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (!currentUserId) {
      toast.error('Phien dang nhap da het han. Vui long dang nhap lai.');
      return;
    }

    let giftId: string | null = null;
    try {
      setIsConfirming(true);

      const { data: giftRow, error: insertError } = await supabase
        .from('crypto_gifts')
        .insert({
          from_user_id: currentUserId,
          to_user_id: recipientUserId,
          to_address: recipientAddress,
          token,
          amount_numeric: Number(normalizedAmount),
          conversation_id: conversationId ?? null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError || !giftRow?.id) {
        throw new Error(insertError?.message || 'Khong the tao ban ghi tang qua.');
      }

      giftId = giftRow.id as string;

      const updateGift = async (patch: Record<string, any>) => {
        await supabase
          .from('crypto_gifts')
          .update(patch)
          .eq('id', giftId);
      };

      const activeChainId: 1 | 56 = (chainId === 56 || chainId === 97) ? 56 : bsc.id;

      const writeContractWrapper: WriteContractFn = (params) => {
        return writeContractAsync(params as any);
      };

      const { hash } = await sendAsset({
        token,
        recipient: recipientAddress as `0x${string}`,
        amount: normalizedAmount,
        chainId: activeChainId,
        account: senderAddress || undefined,
        sendNative: sendTransactionAsync,
        writeContract: writeContractWrapper,
      });

      await updateGift({ tx_hash: hash, status: 'pending', error: null });
      toast.success('Da gui giao dich.');

      try {
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: activeChainId,
          confirmations: 1,
        });

        const receiptStatus = (receipt as any)?.status;
        if (receiptStatus && receiptStatus !== 'success') {
          await updateGift({ status: 'failed', error: 'Giao dich bi revert.' });
          toast.error('Giao dich bi revert.');
          return;
        }

        await updateGift({ status: 'confirmed', error: null });
        toast.success('Tang qua thanh cong.');
        handleClose(false);
      } catch (e) {
        await updateGift({ status: 'pending', error: mapSendError(e) });
        toast.warning('Giao dich da gui. Dang cho xac nhan.');
        handleClose(false);
      }
    } catch (error) {
      const message = mapSendError(error);
      if (giftId) {
        await supabase
          .from('crypto_gifts')
          .update({ status: 'failed', error: message || 'Khong the tang qua.' })
          .eq('id', giftId);
      }
      toast.error(message || 'Khong the tang qua.');
    }
    finally {
      setIsConfirming(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 border-2 border-[#E7C76A]/60 bg-gradient-to-br from-[#FFFBF3] via-[#FFF7E6] to-[#FFF3DA] shadow-2xl overflow-hidden">
        {/* Sparkle animation keyframes */}
        <style>{`
          @keyframes sparkle {
            0%, 100% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* Decorative elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Hoa mai - gĂ³c trĂ¡i trĂªn */}
          <ApricotFlower className="absolute -top-2 -left-2 w-16 h-16 opacity-80" />
          <ApricotFlower className="absolute top-8 left-6 w-10 h-10 opacity-60" />
          
          {/* Hoa Ä‘Ă o - gĂ³c pháº£i trĂªn */}
          <PeachBlossom className="absolute -top-4 -right-4 w-20 h-20 opacity-70" />
          <PeachBlossom className="absolute top-10 right-8 w-12 h-12 opacity-50" />
          
          {/* Hoa mai - gĂ³c trĂ¡i dÆ°á»›i */}
          <ApricotFlower className="absolute -bottom-3 -left-3 w-14 h-14 opacity-70" />
          <ApricotFlower className="absolute bottom-10 left-4 w-8 h-8 opacity-50" />
          
          {/* PhĂ¡o - gĂ³c pháº£i dÆ°á»›i */}
          <Firecracker className="absolute -bottom-2 right-4 w-8 h-20 opacity-80" />
          <Firecracker className="absolute bottom-8 -right-1 w-6 h-16 opacity-60" />
          
          {/* Sparkles */}
          <Sparkle className="top-16 left-20" delay={0} />
          <Sparkle className="top-24 right-16" delay={0.5} />
          <Sparkle className="bottom-20 left-16" delay={1} />
          <Sparkle className="bottom-28 right-20" delay={1.5} />
          <Sparkle className="top-1/2 left-8" delay={0.8} />
          <Sparkle className="top-1/3 right-10" delay={1.2} />
          
          {/* Gradient overlays */}
          <div className="absolute -top-10 -left-12 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,213,79,0.25),transparent_70%)]" />
          <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-[radial-gradient(circle_at_70%_70%,rgba(255,182,193,0.25),transparent_70%)]" />
          
          {/* Top border gradient */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FFD54F] via-[#E7C76A] to-[#FFD54F]" />
        </div>

        {/* Close button */}
        <button
          onClick={() => handleClose(false)}
          className="absolute right-4 top-4 z-10 rounded-full p-1 hover:bg-[#E7C76A]/20 transition-colors"
        >
          <X className="h-5 w-5 text-[#5A4F3B]" />
        </button>

        {/* Content */}
        <div className="relative z-10 p-6 pt-8">
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-[#2E2A1F] mb-1">Táº·ng quĂ  crypto</h2>
            <p className="text-sm text-[#5A4F3B]">
              Chia sáº» mĂ³n quĂ  token vá»›i hÆ°Æ¡ng vá»‹ Táº¿t áº¥m Ă¡p.
            </p>
          </div>

          {/* Red Envelope Icon */}
          <div className="flex justify-center mb-5">
            <RedEnvelope className="w-20 h-24" />
          </div>

          {/* Recipient Card */}
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 mb-5 border border-[#E7C76A]/40 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-[#E7C76A]/50">
                <AvatarImage src={recipientAvatar || undefined} alt={recipientName || 'Recipient'} />
                <AvatarFallback className="bg-gradient-to-br from-[#FFD54F] to-[#E7C76A] text-[#2E2A1F] font-semibold">
                  {(recipientName || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#8B7355] font-medium">NgÆ°á»i nháº­n</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-[#2E2A1F] truncate">
                    {recipientName || 'User'}
                  </p>
                  <span className="text-[#8B7355]">â€º</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  {hasRecipientWallet ? (
                    <span className="text-xs text-[#8B7355] font-mono">
                      {shortenAddress(recipientAddress || '')}
                    </span>
                  ) : (
                    <span className="text-xs text-rose-700">
                      NgÆ°á»i dĂ¹ng chÆ°a cáº­p nháº­t vĂ­ Web3
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#E7C76A]/20 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-[#8B7355]" />
                </div>
              </div>
            </div>
          </div>

          {/* Token Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[#4E4433]">Token</Label>
              <Select value={token} onValueChange={(value) => setToken(value as TokenSymbol)}>
                <SelectTrigger className="h-12 border-[#E7C76A]/60 bg-white/70 text-[#2E2A1F] focus-visible:ring-[#E7C76A]/60">
                  <SelectValue placeholder="Select token">
                    <div className="flex items-center justify-between w-full">
                      <TokenOption token={token} />
                      <span className="text-[#8B7355] text-sm ml-auto mr-2">0.0 {token}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="BNB">
                  <TokenOption token="BNB" />
                </SelectItem>
                <SelectItem value="BTCB">
                  <TokenOption token="BTCB" />
                </SelectItem>
                <SelectItem value="FUN">
                  <TokenOption token="FUN" />
                </SelectItem>
                  <SelectItem value="CAMLY">
                    <TokenOption token="CAMLY" />
                  </SelectItem>
                  <SelectItem value="USDT">
                    <TokenOption token="USDT" />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="crypto-amount" className="text-sm font-semibold text-[#4E4433]">
                Sá»‘ lÆ°á»£ng
              </Label>
              <Input
                id="crypto-amount"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 border-[#E7C76A]/60 bg-white/70 text-base font-semibold text-[#2E2A1F] focus-visible:ring-[#E7C76A]/60"
              />
              <p className="text-xs text-[#6B5A3A]">
                {isTokenDisabled ? FUN_TESTNET_NOTE : SEND_TRANSFER_NOTE}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <Button 
              variant="outline" 
              onClick={() => handleClose(false)} 
              disabled={isBusy} 
              className="flex-1 h-11 border-2 border-[#D9C184] text-[#4E4433] bg-white/50 hover:bg-[#E7C76A]/20 font-semibold"
            >
              Há»§y
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isBusy || !hasRecipientWallet || isTokenDisabled}
              className="flex-1 h-11 bg-[#1B5E20] hover:bg-[#2E7D32] text-white font-semibold shadow-lg transition-all duration-150 hover:shadow-[0_0_16px_rgba(27,94,32,0.4)]"
            >
              {isBusy ? 'Äang gá»­i...' : 'XĂ¡c nháº­n'}
            </Button>
          </div>
          {!hasRecipientWallet && (
            <div className="mt-2 text-xs text-rose-700 text-center">
              NgÆ°á»i nháº­n chÆ°a cáº­p nháº­t vĂ­ Web3, nĂªn chÆ°a thá»ƒ thá»±c hiá»‡n táº·ng tiá»n.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

```

### FILE: src/modules/chat/components/StickerPicker.tsx
`$ext
import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useStickers } from '../hooks/useStickers';
import type { Sticker, StickerPack } from '../types';

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function StickerPicker({ onSelect, disabled, open, onOpenChange }: StickerPickerProps) {
  const { packs, stickersByPack, isLoading } = useStickers();

  const defaultPackId = useMemo(() => packs[0]?.id || 'default', [packs]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {!onOpenChange && (
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="flex-shrink-0 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-full px-3"
            title="Stickers"
          >
            Stickers
          </Button>
        </PopoverTrigger>
      )}
      {onOpenChange && <PopoverTrigger asChild><span /></PopoverTrigger>}
      <PopoverContent className="w-80 p-0" side="top" align="start">
        <div className="border-b px-3 py-2 text-sm font-medium">Stickers</div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : packs.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">ChĂ†Â°a cÄ‚Â³ bĂ¡Â»â„¢ sticker</div>
        ) : (
          <Tabs defaultValue={defaultPackId} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto">
              {packs.map((p: StickerPack) => (
                <TabsTrigger key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {packs.map((p: StickerPack) => {
              const stickers = stickersByPack.get(p.id) || [];
              return (
                <TabsContent key={p.id} value={p.id} className="m-0">
                  <ScrollArea className="h-64">
                    <div className="grid grid-cols-3 gap-2 p-3">
                      {stickers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => onSelect(s)}
                          className="rounded-lg border bg-card hover:bg-accent transition-colors p-2"
                          title={s.name}
                        >
                          <img src={s.url} alt={s.name} className="w-full h-20 object-contain" />
                        </button>
                      ))}
                      {stickers.length === 0 && (
                        <div className="col-span-3 text-sm text-muted-foreground">BĂ¡Â»â„¢ nÄ‚Â y chĂ†Â°a cÄ‚Â³ sticker</div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}

```

### FILE: src/modules/chat/components/TypingIndicator.tsx
`$ext
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { TypingUser } from '../types';

interface TypingIndicatorProps {
  users: TypingUser[];
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const displayText = users.length === 1
    ? `${users[0].username} Ä‘ang nháº­p...`
    : users.length === 2
    ? `${users[0].username} vĂ  ${users[1].username} Ä‘ang nháº­p...`
    : `${users[0].username} vĂ  ${users.length - 1} ngÆ°á»i khĂ¡c Ä‘ang nháº­p...`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {users.slice(0, 3).map((user) => (
          <Avatar key={user.userId} className="h-6 w-6 border-2 border-background">
            <AvatarImage src={user.avatar_url} alt={user.username} />
            <AvatarFallback className="text-xs">
              {user.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      
      <div className="bg-muted rounded-2xl px-4 py-2 flex items-center gap-1">
        <span className="text-sm text-muted-foreground">{displayText}</span>
        <div className="flex gap-0.5 ml-1">
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

```

### FILE: src/modules/chat/components/VideoGrid.tsx
`$ext
import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ICameraVideoTrack } from 'agora-rtc-sdk-ng';
import { cn } from '@/lib/utils';
import { MicOff, VideoOff } from 'lucide-react';
import type { RemoteUser } from '../types';

interface VideoGridProps {
  localVideoTrack: ICameraVideoTrack | null;
  remoteUsers: RemoteUser[];
  isLocalCameraOff: boolean;
  isLocalMuted?: boolean;
  localUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
  remoteUserInfo?: {
    username?: string;
    avatarUrl?: string;
  };
}

function VideoPlayer({ videoTrack, className }: { videoTrack: any; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && videoTrack) {
      videoTrack.play(containerRef.current);
    }
    return () => {
      videoTrack?.stop();
    };
  }, [videoTrack]);

  return <div ref={containerRef} className={cn('w-full h-full', className)} />;
}

// PiP dimensions
const PIP_W = 128;
const PIP_H = 180;

export function VideoGrid({
  localVideoTrack,
  remoteUsers,
  isLocalCameraOff,
  isLocalMuted = false,
  localUserInfo,
  remoteUserInfo,
}: VideoGridProps) {
  const [isSwapped, setIsSwapped] = useState(false);
  // null = default position (bottom-right corner)
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    dragging: false,
    startPointerX: 0,
    startPointerY: 0,
    startElemX: 0,
    startElemY: 0,
    moved: false,
  });

  const totalParticipants = remoteUsers.length + 1;

  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-cols-1';
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2';
    if (totalParticipants <= 4) return 'grid-cols-2';
    if (totalParticipants <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-3 md:grid-cols-4';
  };

  const isOneOnOne = remoteUsers.length === 1;

  const handleSwap = useCallback(() => {
    setIsSwapped(prev => !prev);
    setPipPosition(null); // reset to corner on swap
  }, []);

  const getDefaultPipPosition = useCallback(() => {
    if (!containerRef.current) return { x: 16, y: 16 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: rect.width - PIP_W - 16,
      y: rect.height - PIP_H - 16,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const currentPos = pipPosition ?? getDefaultPipPosition();

    dragState.current = {
      dragging: true,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startElemX: currentPos.x,
      startElemY: currentPos.y,
      moved: false,
    };
    setIsDragging(true);
  }, [pipPosition, getDefaultPipPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;

    const dx = e.clientX - dragState.current.startPointerX;
    const dy = e.clientY - dragState.current.startPointerY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragState.current.moved = true;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = rect.width - PIP_W;
    const maxY = rect.height - PIP_H;

    const newX = Math.max(0, Math.min(maxX, dragState.current.startElemX + dx));
    const newY = Math.max(0, Math.min(maxY, dragState.current.startElemY + dy));

    setPipPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragState.current.moved) {
      handleSwap();
    }
    dragState.current.dragging = false;
    setIsDragging(false);
  }, [handleSwap]);

  if (isOneOnOne) {
    const remoteUser = remoteUsers[0];

    const mainVideoTrack = isSwapped ? localVideoTrack : (remoteUser.hasVideo ? remoteUser.videoTrack : null);
    const mainCameraOff = isSwapped ? isLocalCameraOff : !remoteUser.hasVideo;
    const mainUserInfo = isSwapped ? localUserInfo : remoteUserInfo;
    const mainLabel = isSwapped ? 'Báº¡n' : (remoteUserInfo?.username || 'User');
    const mainMuted = isSwapped ? isLocalMuted : !remoteUser.hasAudio;

    const pipVideoTrack = isSwapped ? (remoteUser.hasVideo ? remoteUser.videoTrack : null) : localVideoTrack;
    const pipCameraOff = isSwapped ? !remoteUser.hasVideo : isLocalCameraOff;
    const pipUserInfo = isSwapped ? remoteUserInfo : localUserInfo;
    const pipLabel = isSwapped ? (remoteUserInfo?.username || 'User') : 'Báº¡n';
    const pipMuted = isSwapped ? !remoteUser.hasAudio : isLocalMuted;

    const pos = pipPosition ?? getDefaultPipPosition();

    return (
      <div ref={containerRef} className="relative w-full h-full bg-muted overflow-hidden">
        {/* Main video - full screen */}
        {!mainCameraOff && mainVideoTrack ? (
          <VideoPlayer videoTrack={mainVideoTrack} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Avatar className="h-32 w-32">
              <AvatarImage src={mainUserInfo?.avatarUrl} />
              <AvatarFallback className="text-4xl">
                {(mainUserInfo?.username || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}

        {/* Main user indicators */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
          <span className="text-sm text-primary-foreground bg-background/50 px-2 py-1 rounded backdrop-blur-sm">
            {mainLabel}
          </span>
          {mainMuted && (
            <div className="bg-destructive/80 p-1 rounded-full">
              <MicOff className="h-4 w-4 text-destructive-foreground" />
            </div>
          )}
        </div>

        {/* PiP video - draggable */}
        <div
          ref={pipRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            width: PIP_W,
            height: PIP_H,
            touchAction: 'none',
          }}
          className={cn(
            'rounded-xl overflow-hidden shadow-lg border-2 border-white/30 group transition-shadow',
            isDragging
              ? 'cursor-grabbing shadow-2xl opacity-90 scale-105'
              : 'cursor-grab hover:border-primary/60 hover:shadow-xl'
          )}
        >
          {!pipCameraOff && pipVideoTrack ? (
            <VideoPlayer videoTrack={pipVideoTrack} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Avatar className="h-12 w-12">
                <AvatarImage src={pipUserInfo?.avatarUrl} />
                <AvatarFallback>
                  {(pipUserInfo?.username || 'Me')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          {/* PiP overlay info */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span className="text-xs text-primary-foreground bg-background/50 px-1 py-0.5 rounded">
              {pipLabel}
            </span>
            <div className="flex items-center gap-1">
              {pipCameraOff && (
                <div className="bg-destructive/80 p-0.5 rounded-full">
                  <VideoOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
              {pipMuted && (
                <div className="bg-destructive/80 p-0.5 rounded-full">
                  <MicOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Hint overlay */}
          <div className={cn(
            'absolute inset-0 bg-background/40 flex items-center justify-center transition-opacity',
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}>
            <span className="text-xs text-foreground font-medium text-center px-2">
              {isDragging ? 'Äang di chuyá»ƒnâ€¦' : 'Giá»¯ Ä‘á»ƒ di chuyá»ƒn Â· Click Ä‘á»ƒ swap'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Grid layout for group calls or when no remote users
  return (
    <div className={cn('w-full h-full grid gap-2 p-2', getGridClass())}>
      {/* Local user */}
      <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
        {!isLocalCameraOff && localVideoTrack ? (
          <VideoPlayer videoTrack={localVideoTrack} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={localUserInfo?.avatarUrl} />
              <AvatarFallback className="text-2xl">
                {(localUserInfo?.username || 'Me')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <span className="text-xs text-primary-foreground bg-background/50 px-2 py-1 rounded">
            Báº¡n
          </span>
          {isLocalMuted && (
            <div className="bg-destructive/80 p-0.5 rounded-full">
              <MicOff className="h-3 w-3 text-destructive-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Remote users */}
      {remoteUsers.map((user) => (
        <div key={String(user.uid)} className="relative rounded-lg overflow-hidden bg-muted aspect-video">
          {user.hasVideo && user.videoTrack ? (
            <VideoPlayer videoTrack={user.videoTrack} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl">U</AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="text-xs text-primary-foreground bg-background/50 px-2 py-1 rounded">
              User {user.uid}
            </span>
            {!user.hasAudio && (
              <div className="bg-destructive/80 p-0.5 rounded-full">
                <MicOff className="h-3 w-3 text-destructive-foreground" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

```

### FILE: src/modules/chat/hooks/useAgoraCall.ts
`$ext
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  IAgoraRTCRemoteUser,
  UID,
} from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createAgoraRtcClient, getAgoraRtcToken } from '@/lib/agoraRtc';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallSession {
  id: string;
  conversation_id: string;
  initiator_id: string;
  call_type: CallType;
  status: string;
  channel_name: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}

export interface RemoteUser {
  uid: UID;
  audioTrack?: any;
  videoTrack?: any;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface UseAgoraCallOptions {
  conversationId?: string;
  userId: string | null;
}

// Call timeout in milliseconds (45 seconds)
const CALL_TIMEOUT_MS = 45000;

export function useAgoraCall({ conversationId, userId }: UseAgoraCallOptions) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('voice');
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isAutoAnswering, setIsAutoAnswering] = useState(false);

  // Refs
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const callInProgressRef = useRef(false);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAnswerProcessedRef = useRef<string | null>(null);
  
  // Refs to avoid closure issues in event handlers
  const callStateRef = useRef<CallState>('idle');
  const endCallRef = useRef<(() => Promise<void>) | null>(null);

  // Generate unique channel name
  const generateChannelName = useCallback(() => {
    return `call_${conversationId}_${Date.now()}`;
  }, [conversationId]);

  // Get Agora token from Cloudflare Worker
  const getToken = useCallback(async (channelName: string) => {
    return getAgoraRtcToken(channelName, 'host');
  }, []);

  // Initialize Agora client
  const initClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = createAgoraRtcClient('rtc');
      
      // Event handlers
      clientRef.current.on('user-published', async (user, mediaType) => {
        await clientRef.current?.subscribe(user, mediaType);
        
        setRemoteUsers(prev => {
          const existing = prev.find(u => u.uid === user.uid);
          if (existing) {
            return prev.map(u => 
              u.uid === user.uid 
                ? { 
                    ...u, 
                    [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: user[mediaType === 'audio' ? 'audioTrack' : 'videoTrack'],
                    [mediaType === 'audio' ? 'hasAudio' : 'hasVideo']: true 
                  }
                : u
            );
          }
          return [...prev, {
            uid: user.uid,
            audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
            videoTrack: mediaType === 'video' ? user.videoTrack : undefined,
            hasAudio: mediaType === 'audio',
            hasVideo: mediaType === 'video',
          }];
        });

        // Play audio track
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }
      });

      clientRef.current.on('user-unpublished', (user, mediaType) => {
        setRemoteUsers(prev => 
          prev.map(u => 
            u.uid === user.uid 
              ? { 
                  ...u, 
                  [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: undefined,
                  [mediaType === 'audio' ? 'hasAudio' : 'hasVideo']: false 
                }
              : u
          )
        );
      });

      clientRef.current.on('user-left', (user, reason) => {
        console.log('[Agora] Remote user left:', user.uid, 'reason:', reason);
        
        setRemoteUsers(prev => {
          const newUsers = prev.filter(u => u.uid !== user.uid);
          
          // In 1-on-1 calls, if no remote users left, auto-end the call
          if (newUsers.length === 0) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => {
              if (callStateRef.current === 'connected') {
                console.log('[Agora] All remote users left, auto-ending call');
                endCallRef.current?.();
              }
            }, 100);
          }
          
          return newUsers;
        });
      });

      // Listen for connection state changes
      clientRef.current.on('connection-state-change', (curState, prevState, reason) => {
        console.log('[Agora] Connection state:', prevState, '->', curState, 'reason:', reason);
        
        if (curState === 'DISCONNECTED' && reason === 'LEAVE') {
          // Already disconnected, ensure cleanup
          if (callStateRef.current !== 'idle') {
            console.log('[Agora] Disconnected via LEAVE, cleaning up');
            endCallRef.current?.();
          }
        }
      });
    }
    return clientRef.current;
  }, []);

  // Start a call
  const startCall = useCallback(async (type: CallType) => {
    if (!conversationId || !userId) return;
    if (callInProgressRef.current) return;
    callInProgressRef.current = true;

    try {
      // Check DB for existing ringing/active call from the other user
      const { data: existingCall } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['ringing', 'active'])
        .neq('initiator_id', userId)
        .maybeSingle();

      if (existingCall) {
        // The other person already called us - answer their call instead
        const typedSession: CallSession = { ...existingCall, call_type: existingCall.call_type as CallType };
        setIncomingCall(typedSession);
        callInProgressRef.current = false;
        return;
      }

      setCallState('calling');
      setCallType(type);

      // CRITICAL: Request media FIRST - must be in direct user gesture context
      let audioTrack: IMicrophoneAudioTrack;
      let videoTrack: ICameraVideoTrack | null = null;
      
      if (type === 'video') {
        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        audioTrack = tracks[0];
        videoTrack = tracks[1];
      } else {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }
      
      localAudioTrackRef.current = audioTrack;
      localVideoTrackRef.current = videoTrack;

      const channelName = generateChannelName();

      // Create call session in database
      const { data: session, error: sessionError } = await supabase
        .from('call_sessions')
        .insert({
          conversation_id: conversationId,
          initiator_id: userId,
          call_type: type,
          status: 'ringing',
          channel_name: channelName,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      
      // Type assertion for the session
      const typedSession: CallSession = {
        ...session,
        call_type: session.call_type as CallType,
      };
      setCurrentSession(typedSession);

      // Add self as participant
      await supabase.from('call_participants').insert({
        call_session_id: session.id,
        user_id: userId,
        joined_at: new Date().toISOString(),
        is_video_off: type === 'voice',
      });

      // Get token and join channel
      const tokenData = await getToken(channelName);
      
      // Cleanup existing client before joining
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch {}
        clientRef.current = null;
      }
      const client = initClient();
      await client.join(tokenData.appId, channelName, tokenData.token, tokenData.userAccount);

      // Publish pre-created tracks
      if (videoTrack) {
        await client.publish([audioTrack, videoTrack]);
      } else {
        await client.publish(audioTrack);
      }

      setCallState('ringing');

      // Set auto-timeout for missed call
      callTimeoutRef.current = setTimeout(async () => {
        console.log('[Agora] Call timeout - marking as missed');
        try {
          await supabase
            .from('call_sessions')
            .update({ status: 'missed', ended_at: new Date().toISOString() })
            .eq('id', session.id);
          
          toast({
            title: 'KhĂ´ng cĂ³ pháº£n há»“i',
            description: 'NgÆ°á»i nháº­n khĂ´ng tráº£ lá»i cuá»™c gá»i',
          });
          
          // Cleanup
          localAudioTrackRef.current?.close();
          localVideoTrackRef.current?.close();
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          await clientRef.current?.leave();
          clientRef.current = null;
          
          setCallState('idle');
          setCurrentSession(null);
        } catch (err) {
          console.error('[Agora] Failed to mark call as missed:', err);
        }
      }, CALL_TIMEOUT_MS);

    } catch (error: any) {
      console.error('Failed to start call:', error);
      toast({
        title: 'Lá»—i',
        description: error.message || 'KhĂ´ng thá»ƒ báº¯t Ä‘áº§u cuá»™c gá»i',
        variant: 'destructive',
      });
      // Clean up any created tracks on error
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      setCallState('idle');
    } finally {
      callInProgressRef.current = false;
    }
  }, [conversationId, userId, generateChannelName, getToken, initClient, toast]);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall || !userId) return;

    try {
      setCallState('connecting');
      setCallType(incomingCall.call_type);
      setCurrentSession(incomingCall);

      // CRITICAL: Request media FIRST - must be in direct user gesture context
      // Browser security requires getUserMedia to be called immediately on user interaction
      let audioTrack: IMicrophoneAudioTrack;
      let videoTrack: ICameraVideoTrack | null = null;
      
      if (incomingCall.call_type === 'video') {
        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        audioTrack = tracks[0];
        videoTrack = tracks[1];
      } else {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }
      
      localAudioTrackRef.current = audioTrack;
      localVideoTrackRef.current = videoTrack;

      // Now perform async operations (token fetch, join channel)
      const tokenData = await getToken(incomingCall.channel_name);
      
      // Cleanup existing client before joining
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch {}
        clientRef.current = null;
      }
      const client = initClient();
      await client.join(tokenData.appId, incomingCall.channel_name, tokenData.token, tokenData.userAccount);

      // Publish pre-created tracks
      if (videoTrack) {
        await client.publish([audioTrack, videoTrack]);
      } else {
        await client.publish(audioTrack);
      }

      // Add self as participant
      await supabase.from('call_participants').insert({
        call_session_id: incomingCall.id,
        user_id: userId,
        joined_at: new Date().toISOString(),
        is_video_off: incomingCall.call_type === 'voice',
      });

      // Update session status
      await supabase
        .from('call_sessions')
        .update({ 
          status: 'active',
          started_at: new Date().toISOString()
        })
        .eq('id', incomingCall.id);

      setCallState('connected');
      setIncomingCall(null);

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

    } catch (error: any) {
      console.error('Failed to answer call:', error);
      toast({
        title: 'Lá»—i',
        description: error.message || 'KhĂ´ng thá»ƒ tráº£ lá»i cuá»™c gá»i',
        variant: 'destructive',
      });
      // Clean up any created tracks on error
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      setCallState('idle');
    }
  }, [incomingCall, userId, getToken, initClient, toast]);

  // Decline incoming call
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', incomingCall.id);

      setIncomingCall(null);
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }, [incomingCall]);

  // End call
  const endCall = useCallback(async () => {
    try {
      // Clear call timeout if exists
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      // Stop tracks
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;

      // Leave channel
      await clientRef.current?.leave();
      clientRef.current = null;

      // Update database
      if (currentSession) {
        const endTime = new Date().toISOString();
        await supabase
          .from('call_sessions')
          .update({ 
            status: 'ended',
            ended_at: endTime,
            duration_seconds: callDuration
          })
          .eq('id', currentSession.id);

        await supabase
          .from('call_participants')
          .update({ left_at: endTime })
          .eq('call_session_id', currentSession.id)
          .eq('user_id', userId);
      }

      // Clear timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Reset state
      setCallState('idle');
      setCurrentSession(null);
      setRemoteUsers([]);
      setCallDuration(0);
      setIsMuted(false);
      setIsCameraOff(false);

    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [currentSession, callDuration, userId]);

  // Sync refs to avoid closure issues
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (localAudioTrackRef.current) {
      const newMuted = !isMuted;
      await localAudioTrackRef.current.setEnabled(!newMuted);
      setIsMuted(newMuted);

      // Update participant status
      if (currentSession && userId) {
        await supabase
          .from('call_participants')
          .update({ is_muted: newMuted })
          .eq('call_session_id', currentSession.id)
          .eq('user_id', userId);
      }
    }
  }, [isMuted, currentSession, userId]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    if (localVideoTrackRef.current) {
      const newOff = !isCameraOff;
      await localVideoTrackRef.current.setEnabled(!newOff);
      setIsCameraOff(newOff);

      // Update participant status
      if (currentSession && userId) {
        await supabase
          .from('call_participants')
          .update({ is_video_off: newOff })
          .eq('call_session_id', currentSession.id)
          .eq('user_id', userId);
      }
    }
  }, [isCameraOff, currentSession, userId]);

  // Switch to video (during voice call)
  const switchToVideo = useCallback(async () => {
    if (callType === 'video' || !clientRef.current) return;

    try {
      const videoTrack = await AgoraRTC.createCameraVideoTrack();
      localVideoTrackRef.current = videoTrack;
      await clientRef.current.publish(videoTrack);
      setCallType('video');
      setIsCameraOff(false);
    } catch (error) {
      console.error('Failed to switch to video:', error);
    }
  }, [callType]);

  // Handle auto-answer from URL parameter (when accepting call from another page)
  useEffect(() => {
    const answerCallId = searchParams.get('answer');
    
    // Skip if no answer param, no user, already processing, or already answered this call
    if (!answerCallId || !userId || !conversationId || isAutoAnswering) return;
    if (autoAnswerProcessedRef.current === answerCallId) return;
    if (callState !== 'idle') return;

    console.log('[Agora] Auto-answer triggered for call:', answerCallId);
    autoAnswerProcessedRef.current = answerCallId;
    
    const autoAnswerCall = async () => {
      try {
        setIsAutoAnswering(true);
        
        // Fetch the call session from database
        const { data: session, error } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', answerCallId)
          .eq('conversation_id', conversationId)
          .eq('status', 'ringing')
          .single();

        if (error || !session) {
          console.log('[Agora] Call session not found or not ringing:', error?.message);
          // Clear the URL parameter
          setSearchParams({}, { replace: true });
          setIsAutoAnswering(false);
          return;
        }

        console.log('[Agora] Found call session, auto-answering:', session.id);
        
        // Set the incoming call and trigger answer
        const typedSession: CallSession = {
          ...session,
          call_type: session.call_type as CallType,
        };
        
        // Set incoming call first
        setIncomingCall(typedSession);
        
        // Clear the URL parameter
        setSearchParams({}, { replace: true });
        
        // Small delay to ensure state is updated, then answer
        setTimeout(async () => {
          // Now manually trigger the answer logic since we have the session
          try {
            setCallState('connecting');
            setCallType(typedSession.call_type);
            setCurrentSession(typedSession);

            // Request media
            let audioTrack: IMicrophoneAudioTrack;
            let videoTrack: ICameraVideoTrack | null = null;
            
            if (typedSession.call_type === 'video') {
              const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
              audioTrack = tracks[0];
              videoTrack = tracks[1];
            } else {
              audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            }
            
            localAudioTrackRef.current = audioTrack;
            localVideoTrackRef.current = videoTrack;

            // Get token and join
            const tokenData = await getToken(typedSession.channel_name);
            // Cleanup existing client before joining
            if (clientRef.current) {
              try { await clientRef.current.leave(); } catch {}
              clientRef.current = null;
            }
            const client = initClient();
            await client.join(tokenData.appId, typedSession.channel_name, tokenData.token, tokenData.userAccount);

            // Publish tracks
            if (videoTrack) {
              await client.publish([audioTrack, videoTrack]);
            } else {
              await client.publish(audioTrack);
            }

            // Add self as participant
            await supabase.from('call_participants').insert({
              call_session_id: typedSession.id,
              user_id: userId,
              joined_at: new Date().toISOString(),
              is_video_off: typedSession.call_type === 'voice',
            });

            // Update session status
            await supabase
              .from('call_sessions')
              .update({ 
                status: 'active',
                started_at: new Date().toISOString()
              })
              .eq('id', typedSession.id);

            setCallState('connected');
            setIncomingCall(null);
            setIsAutoAnswering(false);

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
              setCallDuration(prev => prev + 1);
            }, 1000);

            console.log('[Agora] Auto-answer successful, connected!');
          } catch (err: any) {
            console.error('[Agora] Auto-answer failed:', err);
            toast({
              title: 'Lá»—i',
              description: err.message || 'KhĂ´ng thá»ƒ tráº£ lá»i cuá»™c gá»i',
              variant: 'destructive',
            });
            // Cleanup
            localAudioTrackRef.current?.close();
            localVideoTrackRef.current?.close();
            localAudioTrackRef.current = null;
            localVideoTrackRef.current = null;
            setCallState('idle');
            setIsAutoAnswering(false);
          }
        }, 100);
        
      } catch (err) {
        console.error('[Agora] Auto-answer error:', err);
        setSearchParams({}, { replace: true });
        setIsAutoAnswering(false);
      }
    };

    autoAnswerCall();
  }, [searchParams, userId, conversationId, callState, isAutoAnswering, getToken, initClient, toast, setSearchParams]);

  // Subscribe to incoming calls via realtime
  useEffect(() => {
    if (!userId || !conversationId) return;

    const channel = supabase
      .channel(`calls-${conversationId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const session = payload.new as any;
          // Don't show incoming call if we initiated it
          if (session.initiator_id !== userId && session.status === 'ringing') {
            const typedSession: CallSession = {
              ...session,
              call_type: session.call_type as CallType,
            };
            setIncomingCall(typedSession);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const session = payload.new as any;
          console.log('[Agora] Realtime session update:', session.id, session.status);
          
          // If call became active and we're the caller, update state
          if (currentSession?.id === session.id) {
            if (session.status === 'active' && callState === 'ringing') {
              // Clear the timeout since call was answered
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              
              setCallState('connected');
              durationIntervalRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
              }, 1000);
            }
            // If call was declined/missed/ended
            if (['declined', 'missed', 'ended'].includes(session.status) && callState !== 'idle') {
              console.log('[Agora] Session ended via realtime, cleaning up');
              // Clear the timeout
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              endCall();
            }
          }

          // If incoming call was cancelled
          if (incomingCall?.id === session.id && ['ended', 'declined', 'missed'].includes(session.status)) {
            setIncomingCall(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, conversationId, currentSession, callState, incomingCall, endCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      clientRef.current?.leave();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
    };
  }, []);

  // Flip camera (switch between front/back)
  const flipCamera = useCallback(async () => {
    if (!localVideoTrackRef.current) return false;

    try {
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) return false;

      const currentLabel = localVideoTrackRef.current.getTrackLabel();
      const currentIndex = cameras.findIndex(c => c.label === currentLabel);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextDevice = cameras[nextIndex];

      await localVideoTrackRef.current.setDevice(nextDevice.deviceId);
      return true;
    } catch (error) {
      console.error('[Agora] Failed to flip camera:', error);
      return false;
    }
  }, []);

  return {
    // State
    callState,
    callType,
    currentSession,
    remoteUsers,
    isMuted,
    isCameraOff,
    incomingCall,
    callDuration,
    localVideoTrack: localVideoTrackRef.current,
    localAudioTrack: localAudioTrackRef.current,
    
    // Actions
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchToVideo,
    flipCamera,
  };
}

```

### FILE: src/modules/chat/hooks/useAngelInline.ts
`$ext
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAngelInline() {
  const invokeAngel = useMutation({
    mutationFn: async (input: { conversationId: string; prompt: string }) => {
      const { data, error } = await supabase.functions.invoke('angel-inline', {
        body: {
          conversation_id: input.conversationId,
          prompt: input.prompt,
        },
      });
      if (error) throw error;
      return data;
    },
  });

  return { invokeAngel };
}


```

### FILE: src/modules/chat/hooks/useBlocks.ts
`$ext
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { UserBlock } from '../types';

export function useBlocks(currentUserId: string | null) {
  const queryClient = useQueryClient();

  const myBlocksQuery = useQuery({
    queryKey: ['chat-blocks', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [] as UserBlock[];
      const { data, error } = await supabase
        .from('user_blocks')
        .select('id, blocker_id, blocked_id, created_at')
        .eq('blocker_id', currentUserId);
      if (error) throw error;
      return (data || []) as UserBlock[];
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
  });

  const blockedByOthersQuery = useQuery({
    queryKey: ['chat-blocked-by-others', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [] as UserBlock[];
      const { data, error } = await supabase
        .from('user_blocks')
        .select('id, blocker_id, blocked_id, created_at')
        .eq('blocked_id', currentUserId);
      if (error) throw error;
      return (data || []) as UserBlock[];
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
  });

  const blockedIds = new Set((myBlocksQuery.data || []).map((b) => b.blocked_id));
  const blockedByIds = new Set((blockedByOthersQuery.data || []).map((b) => b.blocker_id));

  const blockUser = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: currentUserId, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-blocks', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['chat-blocked-by-others', currentUserId] });
    },
  });

  const unblockUser = useMutation({
    mutationFn: async (blockedId: string) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-blocks', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['chat-blocked-by-others', currentUserId] });
    },
  });

  return {
    blocks: myBlocksQuery.data || [],
    blockedIds,
    blockedByIds,
    isLoading: myBlocksQuery.isLoading || blockedByOthersQuery.isLoading,
    error: myBlocksQuery.error || blockedByOthersQuery.error,
    blockUser,
    unblockUser,
  };
}

```

### FILE: src/modules/chat/hooks/useChatNotifications.ts
`$ext
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NotificationOptions {
  enabled?: boolean;
  showToast?: boolean;
  playSound?: boolean;
}

export function useChatNotifications(
  userId: string | null,
  currentConversationId: string | null,
  options: NotificationOptions = {}
) {
  const { enabled = true, showToast = true, playSound = true } = options;

  const playNotificationSound = useCallback(() => {
    if (!playSound) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      // Silently fail if audio context is not available
      console.debug('Audio notification not available');
    }
  }, [playSound]);

  useEffect(() => {
    if (!userId || !enabled) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Scope notifications to conversations the user is currently in.
      // This avoids subscribing to all messages globally.
      const { data: rows, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (cancelled) return;
      if (error) {
        console.error('[chat-notifications] Failed to load conversation ids:', error);
        return;
      }

      const conversationIds = (rows || []).map((r: any) => r.conversation_id).filter(Boolean);
      if (!conversationIds.length) return;

      const inFilter = `conversation_id=in.(${conversationIds.join(',')})`;

      channel = supabase
        .channel(`chat-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: inFilter,
          },
          async (payload) => {
            const message = payload.new as any;

            if (message.sender_id === userId) return;
            if (message.conversation_id === currentConversationId) return;

            const { data: sender } = await supabase
              .from('profiles')
              .select('username, full_name, avatar_url')
              .eq('id', message.sender_id)
              .maybeSingle();

            playNotificationSound();

            const senderName = sender?.full_name || sender?.username || 'Ai đó';
            const content = (message.content || '').toString();
            const description = content ? content.substring(0, 50) : 'Đã gửi một tệp đính kèm';

            if (showToast) {
              toast.info(`${senderName} đã gửi tin nhắn`, {
                description,
                duration: 4000,
              });
            }

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Tin nhắn từ ${senderName}`, {
                body: content ? content.substring(0, 100) : 'Bạn nhận được một tệp đính kèm',
                icon: sender?.avatar_url || '/fun-profile-logo-128.webp',
                tag: message.conversation_id,
              });
            }
          }
        )
        .subscribe();
    })();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, currentConversationId, enabled, showToast, playNotificationSound]);

  return null;
}

```

### FILE: src/modules/chat/hooks/useChatSettings.ts
`$ext
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ChatSettings } from '../types';

export type { ChatSettings };

const DEFAULT_SETTINGS: Omit<ChatSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  who_can_message: 'friends',
  show_read_receipts: true,
  show_typing_indicator: true,
};

export function useChatSettings(userId: string | null) {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['chat-settings', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('chat_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      // Return settings with defaults
      if (!data) {
        return {
          user_id: userId,
          ...DEFAULT_SETTINGS,
        } as ChatSettings;
      }

      return data;
    },
    enabled: !!userId,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<ChatSettings>) => {
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('chat_settings')
        .upsert(
          {
            user_id: userId,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-settings', userId] });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    updateSettings,
  };
}

// Check if a user can message another user
export async function canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
  // Get receiver's chat settings
  const { data: settings } = await supabase
    .from('chat_settings')
    .select('who_can_message')
    .eq('user_id', receiverId)
    .maybeSingle();

  const whoCanMessage = settings?.who_can_message || 'friends';

  switch (whoCanMessage) {
    case 'everyone':
      return true;
    case 'nobody':
      return false;
    case 'friends':
    default:
      // Check if they are friends
      const { data: friendship } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(user_id.eq.${senderId},friend_id.eq.${receiverId}),and(user_id.eq.${receiverId},friend_id.eq.${senderId})`)
        .eq('status', 'accepted')
        .limit(1);

      return (friendship?.length || 0) > 0;
  }
}

```

### FILE: src/modules/chat/hooks/useConversations.ts
`$ext
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import type { Conversation, ConversationParticipant } from '../types';

export type { Conversation, ConversationParticipant };

export function useConversations(userId: string | null) {
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: ['conversations', userId],
    queryFn: async () => {
      if (!userId) return [];

      // Get conversations where user is a participant
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (participantError) throw participantError;
      if (!participantData?.length) return [];

      const conversationIds = participantData.map(p => p.conversation_id);

      // Get full conversation data with participants
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          *,
          conversation_participants (
            id,
            user_id,
            role,
            nickname,
            joined_at,
            left_at
          )
        `)
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch profiles for participants
      const allUserIds = new Set<string>();
      conversations?.forEach(conv => {
        conv.conversation_participants?.forEach((p: ConversationParticipant) => {
          if (p.user_id && !p.left_at) allUserIds.add(p.user_id);
        });
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, external_wallet_address, custodial_wallet_address, wallet_address')
        .in('id', Array.from(allUserIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch unread counts in batch (2-step approach since Supabase JS doesn't support subqueries)
      const [readResult, unreadResult] = await Promise.all([
        supabase
          .from('message_reads')
          .select('message_id')
          .eq('user_id', userId),
        supabase
          .from('messages')
          .select('id, conversation_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', userId)
          .or('is_deleted.is.null,is_deleted.eq.false'),
      ]);

      const readMessageIds = new Set(readResult.data?.map(r => r.message_id) || []);

      const unreadCountMap = new Map<string, number>();
      unreadResult.data?.forEach(msg => {
        if (!readMessageIds.has(msg.id)) {
          unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1);
        }
      });

      // Map profiles to participants and attach unread counts
      return conversations?.map(conv => ({
        ...conv,
        unread_count: unreadCountMap.get(conv.id) || 0,
        participants: conv.conversation_participants?.map((p: ConversationParticipant) => ({
          ...p,
          profile: profileMap.get(p.user_id)
        }))
      })) || [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  const conversationIdsForRealtime = (conversationsQuery.data || []).map((c: any) => c.id).filter(Boolean);
  const conversationIdsKey = conversationIdsForRealtime.join(',');

  // Realtime subscription for conversation updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`conversations-changes:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      );

    // Subscribe to conversations table only when we already have conversation ids.
    // Keep participants subscription always-on so first conversation appears in realtime.
    if (conversationIdsForRealtime.length) {
      const convFilter = `id=in.(${conversationIdsForRealtime.join(',')})`;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: convFilter },
        () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
      );
    }

    // Invalidate when user reads messages (badge should disappear)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reads', filter: `user_id=eq.${userId}` },
      () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
    );

    // Invalidate when new messages arrive (badge should appear/increment)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      () => queryClient.invalidateQueries({ queryKey: ['conversations', userId] })
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, conversationIdsKey]);

  // Create direct conversation
  const createDirectConversation = useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!userId) throw new Error('User not authenticated');

      // Block enforcement (Phase 1): prevent creating DM if you blocked the other user.
      const { data: myBlock } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', userId)
        .eq('blocked_id', otherUserId)
        .maybeSingle();
      if (myBlock?.id) {
        throw new Error('Báº¡n Ä‘Ă£ táº¡m ngá»«ng káº¿t ná»‘i vá»›i ngÆ°á»i dĂ¹ng nĂ y.');
      }

      // Also prevent creating DM if the other user has blocked you.
      const { data: blockedByOther } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', otherUserId)
        .eq('blocked_id', userId)
        .maybeSingle();
      if (blockedByOther?.id) {
        throw new Error('NgÆ°á»i dĂ¹ng nĂ y Ä‘Ă£ táº¡m ngá»«ng káº¿t ná»‘i vá»›i báº¡n.');
      }

      // Check if conversation already exists
      const { data: existingParticipants } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (existingParticipants?.length) {
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', otherUserId)
          .in('conversation_id', existingParticipants.map(p => p.conversation_id))
          .is('left_at', null);

        if (otherParticipants?.length) {
          // Check if it's a direct (2-person) conversation
          for (const op of otherParticipants) {
            const { data: allParticipants } = await supabase
              .from('conversation_participants')
              .select('user_id')
              .eq('conversation_id', op.conversation_id)
              .is('left_at', null);

            if (allParticipants?.length === 2) {
              // Found existing direct conversation
              const { data: conv } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', op.conversation_id)
                .eq('type', 'direct')
                .single();

              if (conv) return conv;
            }
          }
        }
      }

      // Create new conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'direct',
          created_by: userId,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add both participants
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conversation.id, user_id: userId, role: 'member' },
          { conversation_id: conversation.id, user_id: otherUserId, role: 'member' },
        ]);

      if (partError) throw partError;

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
    },
  });

  return {
    conversations: conversationsQuery.data || [],
    isLoading: conversationsQuery.isLoading,
    error: conversationsQuery.error,
    createDirectConversation,
  };
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          conversation_participants (
            id,
            user_id,
            role,
            nickname,
            joined_at,
            left_at
          )
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      // Fetch profiles for participants
      const userIds = data.conversation_participants
        ?.filter((p: ConversationParticipant) => !p.left_at)
        .map((p: ConversationParticipant) => p.user_id) || [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name, external_wallet_address, custodial_wallet_address, wallet_address')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return {
        ...data,
        participants: data.conversation_participants?.map((p: ConversationParticipant) => ({
          ...p,
          profile: profileMap.get(p.user_id)
        }))
      };
    },
    enabled: !!conversationId,
  });
}

```

### FILE: src/modules/chat/hooks/useGroupConversations.ts
`$ext
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGroupConversations(userId: string | null) {
  const queryClient = useQueryClient();

  // Create group conversation
  const createGroupConversation = useMutation({
    mutationFn: async ({
      name,
      memberIds,
    }: {
      name: string;
      memberIds: string[];
    }) => {
      if (!userId) throw new Error('User not authenticated');
      if (memberIds.length < 1) throw new Error('At least 1 member required');

      // Create conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          name,
          created_by: userId,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add all participants (including creator as admin)
      const participants = [
        { conversation_id: conversation.id, user_id: userId, role: 'admin' },
        ...memberIds.map((id) => ({
          conversation_id: conversation.id,
          user_id: id,
          role: 'member',
        })),
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) throw partError;

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('ÄĂ£ táº¡o nhĂ³m má»›i');
    },
    onError: (error) => {
      console.error('Error creating group:', error);
      toast.error('KhĂ´ng thá»ƒ táº¡o nhĂ³m');
    },
  });

  // Add member to group
  const addMember = useMutation({
    mutationFn: async ({
      conversationId,
      memberId,
    }: {
      conversationId: string;
      memberId: string;
    }) => {
      const { error } = await supabase.from('conversation_participants').insert({
        conversation_id: conversationId,
        user_id: memberId,
        role: 'member',
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      toast.success('ÄĂ£ thĂªm thĂ nh viĂªn');
    },
  });

  // Remove member from group
  const removeMember = useMutation({
    mutationFn: async ({
      conversationId,
      memberId,
    }: {
      conversationId: string;
      memberId: string;
    }) => {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', memberId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      toast.success('ÄĂ£ xĂ³a thĂ nh viĂªn');
    },
  });

  // Update group settings
  const updateGroup = useMutation({
    mutationFn: async ({
      conversationId,
      updates,
    }: {
      conversationId: string;
      updates: { name?: string; avatar_url?: string };
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['conversation', variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('ÄĂ£ cáº­p nháº­t nhĂ³m');
    },
  });

  // Leave group
  const leaveGroup = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('conversation_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      toast.success('ÄĂ£ rá»i nhĂ³m');
    },
  });

  return {
    createGroupConversation,
    addMember,
    removeMember,
    updateGroup,
    leaveGroup,
  };
}

```

### FILE: src/modules/chat/hooks/useMediaDevices.ts
`$ext
/**
 * Hook to manage media devices (cameras, microphones, speakers)
 * Provides device enumeration, selection, and switching capabilities
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface MediaDevicesState {
  cameras: MediaDevice[];
  microphones: MediaDevice[];
  speakers: MediaDevice[];
  selectedCamera: string | null;
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
}

interface UseMediaDevicesOptions {
  videoTrack?: ICameraVideoTrack | null;
  audioTrack?: IMicrophoneAudioTrack | null;
}

export function useMediaDevices({ videoTrack, audioTrack }: UseMediaDevicesOptions = {}) {
  const [devices, setDevices] = useState<MediaDevicesState>({
    cameras: [],
    microphones: [],
    speakers: [],
    selectedCamera: null,
    selectedMicrophone: null,
    selectedSpeaker: null,
  });
  const [isEnumerating, setIsEnumerating] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    setIsEnumerating(true);
    try {
      // Request permissions first to get proper device labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => {});
      
      const [cameras, microphones] = await Promise.all([
        AgoraRTC.getCameras(),
        AgoraRTC.getMicrophones(),
      ]);
      
      // Get speakers if available (not all browsers support)
      let speakers: MediaDevice[] = [];
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        speakers = allDevices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
            kind: 'audiooutput' as const,
          }));
      } catch (e) {
        console.log('[MediaDevices] Speakers enumeration not supported');
      }

      setDevices(prev => ({
        ...prev,
        cameras: cameras.map(c => ({
          deviceId: c.deviceId,
          label: c.label || `Camera ${c.deviceId.slice(0, 4)}`,
          kind: 'videoinput' as const,
        })),
        microphones: microphones.map(m => ({
          deviceId: m.deviceId,
          label: m.label || `Microphone ${m.deviceId.slice(0, 4)}`,
          kind: 'audioinput' as const,
        })),
        speakers,
        // Set defaults if not already set
        selectedCamera: prev.selectedCamera || (cameras.length > 0 ? cameras[0].deviceId : null),
        selectedMicrophone: prev.selectedMicrophone || (microphones.length > 0 ? microphones[0].deviceId : null),
        selectedSpeaker: prev.selectedSpeaker || (speakers.length > 0 ? speakers[0].deviceId : null),
      }));
    } catch (error) {
      console.error('[MediaDevices] Failed to enumerate devices:', error);
    } finally {
      setIsEnumerating(false);
    }
  }, []);

  // Switch camera (for flip camera feature)
  const flipCamera = useCallback(async () => {
    if (!videoTrack || devices.cameras.length < 2) return false;

    try {
      const currentDeviceId = videoTrack.getTrackLabel();
      const currentIndex = devices.cameras.findIndex(c => c.label === currentDeviceId || c.deviceId === devices.selectedCamera);
      const nextIndex = (currentIndex + 1) % devices.cameras.length;
      const nextDevice = devices.cameras[nextIndex];

      await videoTrack.setDevice(nextDevice.deviceId);
      setDevices(prev => ({ ...prev, selectedCamera: nextDevice.deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to flip camera:', error);
      return false;
    }
  }, [videoTrack, devices.cameras, devices.selectedCamera]);

  // Select specific camera
  const selectCamera = useCallback(async (deviceId: string) => {
    if (!videoTrack) return false;

    try {
      await videoTrack.setDevice(deviceId);
      setDevices(prev => ({ ...prev, selectedCamera: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select camera:', error);
      return false;
    }
  }, [videoTrack]);

  // Select specific microphone
  const selectMicrophone = useCallback(async (deviceId: string) => {
    if (!audioTrack) return false;

    try {
      await audioTrack.setDevice(deviceId);
      setDevices(prev => ({ ...prev, selectedMicrophone: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select microphone:', error);
      return false;
    }
  }, [audioTrack]);

  // Select speaker (playback device)
  const selectSpeaker = useCallback(async (deviceId: string) => {
    try {
      // Note: Speaker selection typically needs to be applied to audio elements
      // This is more of a stored preference
      setDevices(prev => ({ ...prev, selectedSpeaker: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select speaker:', error);
      return false;
    }
  }, []);

  // Monitor audio level for mic test
  const startAudioLevelMonitor = useCallback(() => {
    if (!audioTrack) return;

    audioLevelIntervalRef.current = setInterval(() => {
      const level = audioTrack.getVolumeLevel();
      setAudioLevel(level * 100); // Convert to percentage
    }, 100);
  }, [audioTrack]);

  const stopAudioLevelMonitor = useCallback(() => {
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Check if device has multiple cameras (for showing flip button)
  const hasMultipleCameras = devices.cameras.length > 1;

  // Get front/back camera info
  const getFrontCamera = useCallback(() => {
    return devices.cameras.find(c => 
      c.label.toLowerCase().includes('front') || 
      c.label.toLowerCase().includes('facetime') ||
      c.label.toLowerCase().includes('user')
    );
  }, [devices.cameras]);

  const getBackCamera = useCallback(() => {
    return devices.cameras.find(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('environment')
    );
  }, [devices.cameras]);

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopAudioLevelMonitor();
    };
  }, [enumerateDevices, stopAudioLevelMonitor]);

  return {
    // State
    devices,
    isEnumerating,
    audioLevel,
    hasMultipleCameras,

    // Actions
    enumerateDevices,
    flipCamera,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    startAudioLevelMonitor,
    stopAudioLevelMonitor,

    // Helpers
    getFrontCamera,
    getBackCamera,
  };
}

```

### FILE: src/modules/chat/hooks/useMessages.ts
`$ext
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useCallback } from 'react';
import type { Message, MessageReaction } from '../types';

export type { Message, MessageReaction };

const PAGE_SIZE = 30;

export function useMessages(conversationId: string | null, userId: string | null) {
  const queryClient = useQueryClient();
  const messagesQueryKey = ['messages', conversationId] as const;

  const patchMessageInCache = useCallback(
    (messageId: string, updater: (message: any) => any) => {
      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.map((m: any) => (m.id === messageId ? updater(m) : m)),
          })),
        };
      });
    },
    [queryClient, conversationId]
  );

  const removeMessageFromCache = useCallback(
    (messageId: string) => {
      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.filter((m: any) => m.id !== messageId),
          })),
        };
      });
    },
    [queryClient, conversationId]
  );

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!conversationId) return { messages: [], nextCursor: null };

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          message_reactions (
            id,
            user_id,
            emoji,
            created_at
          )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Fetch sender profiles
      const senderIds = new Set(messages?.map(m => m.sender_id) || []);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name')
        .in('id', Array.from(senderIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Fetch reply messages if any
      const replyIds = messages?.filter(m => m.reply_to_id).map(m => m.reply_to_id) || [];
      let replyMap = new Map();
      if (replyIds.length > 0) {
        const { data: replies } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', replyIds);

        replies?.forEach(r => {
          replyMap.set(r.id, { ...r, sender: profileMap.get(r.sender_id) });
        });
      }

      // Fetch read receipts
      const messageIds = messages?.map(m => m.id) || [];
      const { data: reads } = await supabase
        .from('message_reads')
        .select('message_id, user_id')
        .in('message_id', messageIds);

      const readMap = new Map<string, string[]>();
      reads?.forEach(r => {
        const existing = readMap.get(r.message_id) || [];
        existing.push(r.user_id);
        readMap.set(r.message_id, existing);
      });

      const enrichedMessages = messages?.map(m => ({
        ...m,
        sender: profileMap.get(m.sender_id),
        reply_to: replyMap.get(m.reply_to_id) || null,
        reactions: m.message_reactions || [],
        read_by: readMap.get(m.id) || [],
      })) || [];

      return {
        // Keep page in DESC order; we'll reverse after flattening all pages.
        messages: enrichedMessages,
        nextCursor: messages?.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // Realtime subscription for message INSERT/UPDATE/DELETE in current conversation.
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, full_name')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage: any = {
            ...payload.new,
            sender: profile,
            reactions: [],
            read_by: [],
          };

          // Add to cache with dedupe (can happen around optimistic updates + refetch).
          queryClient.setQueryData(messagesQueryKey, (old: any) => {
            if (!old?.pages?.length) return old;
            const firstPage = old.pages[0];
            const alreadyExists = old.pages.some((page: any) =>
              (page.messages || []).some((m: any) => m.id === newMessage.id)
            );
            if (alreadyExists) return old;
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  // Pages are stored in DESC order, so newest goes first.
                  messages: [newMessage, ...firstPage.messages],
                },
                ...old.pages.slice(1),
              ],
            };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          patchMessageInCache(updated.id, (m) => ({ ...m, ...updated }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deleted = payload.old as any;
          if (!deleted?.id) return;
          removeMessageFromCache(deleted.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, patchMessageInCache, queryClient, removeMessageFromCache]);

  // Realtime subscriptions for reactions/reads scoped to messages currently loaded in this thread.
  // This avoids subscribing to all reactions/reads globally.
  const subscribedMessageIds =
    messagesQuery.data?.pages
      .flatMap((p: any) => p.messages || [])
      .map((m: any) => m?.id)
      .filter((id: any) => typeof id === 'string' && !id.startsWith('temp-')) || [];

  const messageIdsForFilter = subscribedMessageIds.slice(0, 200);
  const messageIdsKey = messageIdsForFilter.join(',');

  useEffect(() => {
    if (!conversationId) return;
    if (!messageIdsForFilter.length) return;

    const inFilter = `message_id=in.(${messageIdsForFilter.join(',')})`;

    const channel = supabase
      .channel(`message-meta:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: inFilter },
        (payload) => {
          const reaction = (payload.new || payload.old) as any;
          const messageId = reaction?.message_id as string | undefined;
          if (!messageId) return;

          if (payload.eventType === 'INSERT') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              const exists = reactions.some((r: any) => r.id === reaction.id);
              if (exists) return m;
              return { ...m, reactions: [...reactions, reaction] };
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              return {
                ...m,
                reactions: reactions.map((r: any) => (r.id === reaction.id ? { ...r, ...reaction } : r)),
              };
            });
            return;
          }

          if (payload.eventType === 'DELETE') {
            patchMessageInCache(messageId, (m) => {
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              return {
                ...m,
                reactions: reactions.filter((r: any) => r.id !== reaction.id),
              };
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads', filter: inFilter },
        (payload) => {
          const read = payload.new as any;
          const messageId = read?.message_id as string | undefined;
          const readUserId = read?.user_id as string | undefined;
          if (!messageId || !readUserId) return;

          patchMessageInCache(messageId, (m) => {
            const readBy = Array.isArray(m.read_by) ? m.read_by : [];
            if (readBy.includes(readUserId)) return m;
            return { ...m, read_by: [...readBy, readUserId] };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, messageIdsKey, patchMessageInCache]);

  // Send message mutation with optimistic update
  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      mediaUrls,
      replyToId,
      messageType,
      metadata,
    }: {
      content?: string;
      mediaUrls?: string[];
      replyToId?: string;
      messageType?: string;
      metadata?: any;
    }) => {
      if (!conversationId || !userId) throw new Error('Invalid state');
      if (!content?.trim() && !mediaUrls?.length) throw new Error('Message is empty');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: content?.trim() || null,
          media_urls: mediaUrls || [],
          reply_to_id: replyToId || null,
          message_type: messageType || 'text',
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    // Optimistic update - show message immediately
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(messagesQueryKey);

      // Optimistically update to the new value
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: userId,
        content: variables.content?.trim() || null,
        media_urls: variables.mediaUrls || [],
        reply_to_id: variables.replyToId || null,
        message_type: (variables as any).messageType || 'text',
        metadata: (variables as any).metadata || {},
        edited_at: null,
        pinned_at: null,
        pinned_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
        deleted_at: null,
        sender: { id: userId, username: 'Báº¡n', avatar_url: null, full_name: null },
        reactions: [],
        read_by: [],
        reply_to: null,
      };

      queryClient.setQueryData(messagesQueryKey, (old: any) => {
        if (!old?.pages?.length) {
          return {
            pages: [{ messages: [optimisticMessage], nextCursor: null }],
            pageParams: [0],
          };
        }
        const firstPage = old.pages[0];
        return {
          ...old,
          pages: [
            {
              ...firstPage,
              // Pages are stored in DESC order, so newest goes first.
              messages: [optimisticMessage, ...firstPage.messages],
            },
            ...old.pages.slice(1),
          ],
        };
      });

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
      console.error('Failed to send message:', err);
    },
    onSettled: () => {
      // Refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  // Mark message as read
  const markAsRead = useCallback(
    async (messageIds: string | string[]) => {
      if (!userId) return;
      const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (!uniqueIds.length) return;

      await supabase.from('message_reads').upsert(
        uniqueIds.map((messageId) => ({ message_id: messageId, user_id: userId })),
        { onConflict: 'message_id,user_id' }
      );
    },
    [userId]
  );

  // Add reaction
  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase.from('message_reactions').upsert(
        { message_id: messageId, user_id: userId, emoji },
        { onConflict: 'message_id,user_id,emoji' }
      );

      if (error) throw error;
    },
  });

  // Remove reaction
  const removeReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);

      if (error) throw error;
    },
  });

  const editMessage = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const next = content.trim();
      if (!next) throw new Error('Message is empty');
      const { error } = await supabase
        .from('messages')
        .update({ content: next, edited_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      return { messageId, content: next };
    },
    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previousMessages = queryClient.getQueryData(messagesQueryKey);
      patchMessageInCache(messageId, (m) => ({
        ...m,
        content: content.trim(),
        edited_at: new Date().toISOString(),
      }));
      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  const softDeleteMessage = useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          content: null,
          media_urls: [],
        })
        .eq('id', messageId);
      if (error) throw error;
      return { messageId };
    },
    onMutate: async ({ messageId }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previousMessages = queryClient.getQueryData(messagesQueryKey);
      patchMessageInCache(messageId, (m) => ({
        ...m,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        content: null,
        media_urls: [],
      }));
      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesQueryKey, context.previousMessages);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  // Flatten all messages (pages are DESC); reverse once to render ASC
  const allMessagesDesc = messagesQuery.data?.pages.flatMap((p) => p.messages) || [];
  const allMessages = allMessagesDesc.slice().reverse();

  return {
    messages: allMessages,
    isLoading: messagesQuery.isLoading,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    hasNextPage: messagesQuery.hasNextPage,
    fetchNextPage: messagesQuery.fetchNextPage,
    error: messagesQuery.error,
    sendMessage,
    markAsRead,
    addReaction,
    removeReaction,
    editMessage,
    softDeleteMessage,
  };
}

```

### FILE: src/modules/chat/hooks/usePins.ts
`$ext
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '../types';

export function usePins(conversationId: string | null) {
  const queryClient = useQueryClient();

  const pinnedQuery = useQuery({
    queryKey: ['chat-pinned', conversationId],
    queryFn: async () => {
      if (!conversationId) return null as Message | null;
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, pinned_at, pinned_by, created_at')
        .eq('conversation_id', conversationId)
        .not('pinned_at', 'is', null)
        .order('pinned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as Message | null;
    },
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });

  // Realtime: invalidate on any messages update in the conversation (simple + reliable)
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`pins:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const pinMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('pin_message', { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const unpinMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('unpin_message', { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-pinned', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  return {
    pinnedMessage: pinnedQuery.data || null,
    isLoading: pinnedQuery.isLoading,
    pinMessage,
    unpinMessage,
  };
}


```

### FILE: src/modules/chat/hooks/useRedEnvelope.ts
`$ext
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RedEnvelope, RedEnvelopeClaim } from '../types';

export function useRedEnvelope(envelopeId: string | null, conversationId: string | null) {
  const queryClient = useQueryClient();

  const envelopeQuery = useQuery({
    queryKey: ['chat-red-envelope', envelopeId],
    queryFn: async () => {
      if (!envelopeId) return null as RedEnvelope | null;
      const { data, error } = await supabase
        .from('red_envelopes')
        .select('*')
        .eq('id', envelopeId)
        .maybeSingle();
      if (error) throw error;
      return data as any as RedEnvelope | null;
    },
    enabled: !!envelopeId,
    staleTime: 5 * 1000,
  });

  const claimsQuery = useQuery({
    queryKey: ['chat-red-envelope-claims', envelopeId],
    queryFn: async () => {
      if (!envelopeId) return [] as RedEnvelopeClaim[];
      const { data, error } = await supabase
        .from('red_envelope_claims')
        .select('*')
        .eq('envelope_id', envelopeId)
        .order('claimed_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any as RedEnvelopeClaim[];
    },
    enabled: !!envelopeId,
    staleTime: 5 * 1000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`red-envelope:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'red_envelopes', filter: `conversation_id=eq.${conversationId}` },
        () => {
          if (envelopeId) queryClient.invalidateQueries({ queryKey: ['chat-red-envelope', envelopeId] });
        }
      )
      .on(
        'postgres_changes',
        envelopeId
          ? { event: '*', schema: 'public', table: 'red_envelope_claims', filter: `envelope_id=eq.${envelopeId}` }
          : { event: '*', schema: 'public', table: 'red_envelope_claims' },
        () => {
          if (envelopeId) queryClient.invalidateQueries({ queryKey: ['chat-red-envelope-claims', envelopeId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, envelopeId, queryClient]);

  const claim = useMutation({
    mutationFn: async () => {
      if (!envelopeId) throw new Error('Missing envelope');
      const { data, error } = await supabase.rpc('claim_red_envelope', { p_envelope_id: envelopeId });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      if (envelopeId) {
        queryClient.invalidateQueries({ queryKey: ['chat-red-envelope', envelopeId] });
        queryClient.invalidateQueries({ queryKey: ['chat-red-envelope-claims', envelopeId] });
      }
    },
  });

  return {
    envelope: envelopeQuery.data || null,
    claims: claimsQuery.data || [],
    isLoading: envelopeQuery.isLoading || claimsQuery.isLoading,
    claim,
  };
}

```

### FILE: src/modules/chat/hooks/useReports.ts
`$ext
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useReports(currentUserId: string | null) {
  const createReport = useMutation({
    mutationFn: async (input: {
      reportedUserId?: string | null;
      conversationId?: string | null;
      messageId?: string | null;
      reason: string;
      details?: string | null;
    }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      const { error } = await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_user_id: input.reportedUserId ?? null,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      });
      if (error) throw error;
    },
  });

  return { createReport };
}


```

### FILE: src/modules/chat/hooks/useStickers.ts
`$ext
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Sticker, StickerPack } from '../types';

export function useStickers() {
  const packsQuery = useQuery({
    queryKey: ['chat-sticker-packs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sticker_packs')
        .select('id, name, description, preview_url, is_free, is_active, sort_order, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as StickerPack[];
    },
    staleTime: 60 * 1000,
  });

  const stickersQuery = useQuery({
    queryKey: ['chat-stickers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stickers')
        .select('id, pack_id, name, url, is_animated, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as Sticker[];
    },
    staleTime: 60 * 1000,
  });

  const packs = packsQuery.data || [];
  const stickers = stickersQuery.data || [];

  const stickersByPack = new Map<string, Sticker[]>();
  for (const s of stickers) {
    const arr = stickersByPack.get(s.pack_id) || [];
    arr.push(s);
    stickersByPack.set(s.pack_id, arr);
  }

  return {
    packs,
    stickersByPack,
    isLoading: packsQuery.isLoading || stickersQuery.isLoading,
    error: packsQuery.error || stickersQuery.error,
  };
}


```

### FILE: src/modules/chat/hooks/useTypingIndicator.ts
`$ext
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TypingUser } from '../types';

export type { TypingUser };

export function useTypingIndicator(conversationId: string | null, userId: string | null, username: string | null) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Cleanup typing users after timeout
  const cleanupTypingUser = useCallback((userIdToRemove: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userIdToRemove));
  }, []);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        presence: { key: userId },
      },
    });

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId: typingUserId, username: typingUsername, avatar_url, isTyping } = payload.payload;

        if (typingUserId === userId) return; // Ignore own typing

        if (isTyping) {
          setTypingUsers((prev) => {
            const exists = prev.find((u) => u.userId === typingUserId);
            if (exists) return prev;
            return [...prev, { userId: typingUserId, username: typingUsername, avatar_url }];
          });

          // Auto-remove after 3 seconds
          setTimeout(() => cleanupTypingUser(typingUserId), 3000);
        } else {
          cleanupTypingUser(typingUserId);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, userId, cleanupTypingUser]);

  // Send typing indicator (debounced)
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !userId || !username) return;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, username, isTyping },
      });

      // Auto-stop typing after 2 seconds of no input
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, username, isTyping: false },
          });
        }, 2000);
      }
    },
    [userId, username]
  );

  return {
    typingUsers: typingUsers.filter((u) => u.userId !== userId),
    sendTyping,
  };
}

```

### FILE: src/modules/chat/index.ts
`$ext
/**
 * Chat Module
 * 
 * Provides messaging and video/voice calling functionality.
 */

// Page
export { default as ChatPage } from './pages/Chat';

// Components
export { CallRoom } from './components/CallRoom';
export { CallControls } from './components/CallControls';
export { ChatInput } from './components/ChatInput';
export { ChatSettingsDialog } from './components/ChatSettingsDialog';
export { ConversationList } from './components/ConversationList';
export { CreateGroupDialog } from './components/CreateGroupDialog';
export { CryptoGiftButton } from './components/CryptoGiftButton';
export { GroupSettingsDialog } from './components/GroupSettingsDialog';
export { IncomingCallDialog } from './components/IncomingCallDialog';
export { MessageBubble } from './components/MessageBubble';
export { MessageSearch } from './components/MessageSearch';
export { MessageThread } from './components/MessageThread';
export { NewConversationDialog } from './components/NewConversationDialog';
export { PreCallSettings } from './components/PreCallSettings';
export { SendCryptoModal } from './components/SendCryptoModal';
export { TypingIndicator } from './components/TypingIndicator';
export { VideoGrid } from './components/VideoGrid';

// Hooks
export { useAgoraCall } from './hooks/useAgoraCall';
export { useChatNotifications } from './hooks/useChatNotifications';
export { useChatSettings, canSendMessage } from './hooks/useChatSettings';
export { useConversations, useConversation } from './hooks/useConversations';
export { useGroupConversations } from './hooks/useGroupConversations';
export { useMediaDevices } from './hooks/useMediaDevices';
export { useMessages } from './hooks/useMessages';
export { useTypingIndicator } from './hooks/useTypingIndicator';

// Types
export type {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReaction,
  CallState,
  CallType,
  CallSession,
  RemoteUser,
  MediaDevice,
  NetworkQuality,
  ChatSettings,
  TypingUser,
  UserProfile,
} from './types';

```

### FILE: src/modules/chat/pages/Chat.tsx
`$ext
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useConversations } from '../hooks/useConversations';
import { useGroupConversations } from '../hooks/useGroupConversations';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { NewConversationDialog } from '../components/NewConversationDialog';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { ChatSettingsDialog } from '../components/ChatSettingsDialog';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { ArrowLeft, MessageSquarePlus, Users, Settings, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Conversation } from '../types';

const getDisplayName = (conv: Conversation, uid: string | null): string => {
  if (conv.type === 'group') return conv.name || 'NhĂ³m chat';
  const other = conv.participants?.find(p => p.user_id !== uid && !p.left_at);
  return other?.profile?.full_name || other?.profile?.username || 'NgÆ°á»i dĂ¹ng';
};

export default function Chat() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const isMobileOrTablet = useIsMobileOrTablet();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarSettingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const sidebarComposeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedSidebarControlRef = useRef<'settings' | 'compose' | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      setUsername(profile?.username || null);
    };

    checkAuth();
  }, [navigate]);

  const { conversations, isLoading, createDirectConversation } = useConversations(userId);
  const { createGroupConversation } = useGroupConversations(userId);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(conv => {
      const name = getDisplayName(conv, userId).toLowerCase();
      const preview = (conv.last_message_preview || '').toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, searchQuery, userId]);

  useChatNotifications(userId, conversationId || null);

  const handleSelectConversation = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleBack = () => {
    navigate('/chat');
  };

  const handleNewConversation = async (otherUserId: string) => {
    const result = await createDirectConversation.mutateAsync(otherUserId);
    if (result) {
      navigate(`/chat/${result.id}`);
    }
    setShowNewConversation(false);
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const result = await createGroupConversation.mutateAsync({ name, memberIds });
    if (result) {
      navigate(`/chat/${result.id}`);
    }
    setShowCreateGroup(false);
  };

  useEffect(() => {
    if (isMobileOrTablet) return;
    const control = lastFocusedSidebarControlRef.current;
    const target =
      control === 'settings'
        ? sidebarSettingsBtnRef.current
        : control === 'compose'
          ? sidebarComposeBtnRef.current
          : null;
    target?.focus({ preventScroll: true });
  }, [conversationId, isMobileOrTablet]);

  if (isMobileOrTablet) {
    return (
      <div className="h-screen overflow-hidden bg-background flex flex-col">
        <FacebookNavbar />
        <main className="flex-1 pt-14 pb-20 overflow-hidden">
          {conversationId ? (
            <div className="h-full min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 p-3 border-b bg-card">
                <Button variant="ghost" size="icon" onClick={handleBack}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <span className="font-medium">Tin nháº¯n</span>
              </div>
              <MessageThread conversationId={conversationId} userId={userId} username={username} />
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h1 className="text-xl font-bold">Tin nháº¯n</h1>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSettings(true)}
                    className="border border-transparent hover:border-[#C9A84C]/40 rounded-full"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="border border-transparent hover:border-[#C9A84C]/40 rounded-full"
                      >
                        <MessageSquarePlus className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowNewConversation(true)}>
                        <MessageSquarePlus className="h-4 w-4 mr-2" />
                        Tin nháº¯n má»›i
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowCreateGroup(true)}>
                        <Users className="h-4 w-4 mr-2" />
                        Táº¡o nhĂ³m
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Search bar - mobile */}
              <div className="px-4 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="TĂ¬m kiáº¿m há»™i thoáº¡i..."
                    className="pl-9 pr-8 h-9 rounded-full bg-muted border-none text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <ConversationList
                conversations={filteredConversations}
                selectedId={null}
                currentUserId={userId}
                onSelect={handleSelectConversation}
                isLoading={isLoading}
                isSearching={!!searchQuery.trim()}
              />
            </div>
          )}
        </main>
        <MobileBottomNav />

        <NewConversationDialog
          open={showNewConversation}
          onOpenChange={setShowNewConversation}
          currentUserId={userId}
          onSelectUser={handleNewConversation}
        />
        <CreateGroupDialog
          open={showCreateGroup}
          onOpenChange={setShowCreateGroup}
          currentUserId={userId}
          onCreateGroup={handleCreateGroup}
          isCreating={createGroupConversation.isPending}
        />
        <ChatSettingsDialog open={showSettings} onOpenChange={setShowSettings} userId={userId} />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <FacebookNavbar />
      <main className="flex-1 pt-14 overflow-hidden">
        <div className="h-full flex overflow-hidden">
          <aside className="w-80 flex-shrink-0 h-full border-r bg-card overflow-hidden">
            <div className="h-full min-h-0 flex flex-col">
              <div className="sticky top-0 z-10 bg-card flex items-center justify-between p-4 border-b">
                <h1 className="text-xl font-bold">Tin nháº¯n</h1>
                <div className="flex items-center gap-1">
                  <Button
                    ref={sidebarSettingsBtnRef}
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSettings(true)}
                    onFocus={() => {
                      lastFocusedSidebarControlRef.current = 'settings';
                    }}
                    className="border border-transparent hover:border-[#C9A84C]/40 rounded-full"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        ref={sidebarComposeBtnRef}
                        variant="ghost"
                        size="icon"
                        onFocus={() => {
                          lastFocusedSidebarControlRef.current = 'compose';
                        }}
                        className="border border-transparent hover:border-[#C9A84C]/40 rounded-full"
                      >
                        <MessageSquarePlus className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowNewConversation(true)}>
                        <MessageSquarePlus className="h-4 w-4 mr-2" />
                        Tin nháº¯n má»›i
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowCreateGroup(true)}>
                        <Users className="h-4 w-4 mr-2" />
                        Táº¡o nhĂ³m
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Search bar - desktop */}
              <div className="px-4 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="TĂ¬m kiáº¿m há»™i thoáº¡i..."
                    className="pl-9 pr-8 h-9 rounded-full bg-muted border-none text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <ConversationList
                conversations={filteredConversations}
                selectedId={conversationId || null}
                currentUserId={userId}
                onSelect={handleSelectConversation}
                isLoading={isLoading}
                isSearching={!!searchQuery.trim()}
              />
            </div>
          </aside>

          <section className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
            {conversationId ? (
              <MessageThread conversationId={conversationId} userId={userId} username={username} />
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquarePlus className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Chá»n cuá»™c trĂ² chuyá»‡n Ä‘á»ƒ báº¯t Ä‘áº§u</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        currentUserId={userId}
        onSelectUser={handleNewConversation}
      />
      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        currentUserId={userId}
        onCreateGroup={handleCreateGroup}
        isCreating={createGroupConversation.isPending}
      />
      <ChatSettingsDialog open={showSettings} onOpenChange={setShowSettings} userId={userId} />
    </div>
  );
}

```

### FILE: src/modules/chat/types/index.ts
`$ext
/**
 * Chat Module Types
 * Centralized type definitions for the chat feature
 */

import { Json } from '@/integrations/supabase/types';

// User profile type
export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  external_wallet_address?: string | null;
  custodial_wallet_address?: string | null;
  wallet_address?: string | null;
}

// Conversation types
export interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string | null;
  updated_at: string | null;
  participants?: ConversationParticipant[];
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string | null;
  nickname: string | null;
  joined_at: string | null;
  left_at: string | null;
  muted_until?: string | null;
  profile?: UserProfile;
}

// Message types
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_urls: Json | null;
  reply_to_id: string | null;
  message_type?: 'text' | 'sticker' | 'red_envelope' | 'system' | string;
  metadata?: Json | null;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  sender?: UserProfile;
  reply_to?: Message | null;
  reactions?: MessageReaction[];
  read_by?: string[];
}

export interface MessageReaction {
  id: string;
  message_id?: string;
  user_id: string;
  emoji: string;
  created_at?: string | null;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  is_free: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
}

export interface Sticker {
  id: string;
  pack_id: string;
  name: string;
  url: string;
  is_animated: boolean;
  sort_order: number;
}

export interface RedEnvelope {
  id: string;
  creator_id: string;
  conversation_id: string;
  message_id: string | null;
  token: 'CAMLY' | 'BNB' | string;
  total_amount: number;
  total_count: number;
  remaining_amount: number;
  remaining_count: number;
  expires_at: string;
  status: 'active' | 'expired' | 'fully_claimed' | string;
  created_at: string | null;
}

export interface RedEnvelopeClaim {
  id: string;
  envelope_id: string;
  claimer_id: string;
  amount: number;
  claimed_at: string;
}

// Call types
export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallSession {
  id: string;
  conversation_id: string;
  initiator_id: string;
  call_type: CallType;
  status: string;
  channel_name: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}

export interface RemoteUser {
  uid: import('agora-rtc-sdk-ng').UID;
  audioTrack?: any;
  videoTrack?: any;
  hasAudio: boolean;
  hasVideo: boolean;
}

// Media devices
export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface NetworkQuality {
  uplink: number; // 0-5 (0=unknown, 1=excellent, 5=bad)
  downlink: number;
}

// Chat settings
export interface ChatSettings {
  id: string;
  user_id: string;
  who_can_message: string | null;
  show_read_receipts: boolean | null;
  show_typing_indicator: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Typing indicator
export interface TypingUser {
  userId: string;
  username: string;
  avatar_url?: string;
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

### FILE: supabase/functions/angel-inline/index.ts
`$ext
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AngelInlineRequest = {
  conversation_id: string;
  prompt: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractTextFromCompletion(data: any): string {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    // Some providers return array segments
    return c.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('').trim();
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Missing authorization header' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const angelBotUserId = Deno.env.get('ANGEL_BOT_USER_ID');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json(500, { error: 'Supabase env not configured' });
    }
    if (!angelBotUserId) {
      return json(500, { error: 'ANGEL_BOT_USER_ID not configured' });
    }
    if (!lovableKey) {
      return json(500, { error: 'LOVABLE_API_KEY not configured' });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });
    const userId = userData.user.id;

    const body = (await req.json()) as AngelInlineRequest;
    const conversationId = body?.conversation_id;
    const prompt = (body?.prompt || '').trim();

    if (!conversationId || !prompt) return json(400, { error: 'Missing conversation_id or prompt' });
    if (prompt.length > 2000) return json(400, { error: 'Prompt too long' });

    // Verify membership
    const { data: participant, error: partErr } = await supabaseAdmin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();
    if (partErr) return json(500, { error: partErr.message });
    if (!participant) return json(403, { error: 'Not a conversation participant' });

    // Basic rate-limit: 1 request / 5s per user per conversation
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from('messages')
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_id', angelBotUserId)
      .gte('created_at', new Date(Date.now() - 5000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentErr) return json(500, { error: recentErr.message });
    if (recent && recent.length > 0) {
      return json(429, { error: 'Rate limited' });
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You are Angel AI for FUN Profile. Reply helpfully and concisely. Use Vietnamese unless user asks otherwise.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => '');
      return json(502, { error: 'AI request failed', details: text.slice(0, 400) });
    }

    const aiData = await aiRes.json();
    const reply = extractTextFromCompletion(aiData).trim();
    if (!reply) return json(502, { error: 'Empty AI response' });

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: angelBotUserId,
        content: reply,
        media_urls: [],
        reply_to_id: null,
        message_type: 'system',
        metadata: { bot: 'angel', prompt },
      })
      .select('id')
      .single();

    if (insertErr) return json(500, { error: insertErr.message });

    return json(200, { ok: true, message_id: inserted.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[angel-inline]', msg);
    return json(500, { error: msg });
  }
});


```

### FILE: supabase/functions/get-upload-url/index.ts
`$ext
/**
 * Get Upload URL Edge Function
 * 
 * Táº¡o presigned URL Ä‘á»ƒ client upload trá»±c tiáº¿p lĂªn R2
 * - CĂ³ authentication check (khĂ´ng cáº§n admin)
 * - Validate file type vĂ  size
 * - Cache-Control headers cho cache vÄ©nh viá»…n (vĂ¬ filename cĂ³ hash)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Allowed content types - comprehensive list for all file types
const ALLOWED_CONTENT_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
  // Videos
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/x-msvideo', 'video/mpeg',
  'video/ogg', 'video/3gpp', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv',
  // Documents - Office
  'application/pdf',
  'application/msword', 'application/vnd.ms-word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/x-msexcel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/html', 'text/xml',
  // Archives - all variants browsers may send
  'application/zip', 'application/x-zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/vnd.rar', 'application/rar',
  'application/x-7z-compressed', 'application/x-tar', 'application/gzip', 'application/x-gzip',
  // Mobile / APK
  'application/vnd.android.package-archive',
  // Fallback for unknown types
  'application/octet-stream',
];

// Max sizes
const MAX_IMAGE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const MAX_DOCUMENT_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

const ALLOWED_KEY_BUCKETS = new Set(['avatars', 'covers', 'posts', 'videos', 'comment-media']);

function inferContentTypeFromKey(key: string): string | null {
  const ext = key.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'txt':
      return 'text/plain';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/x-rar-compressed';
    case 'apk':
      return 'application/vnd.android.package-archive';
    default:
      return null;
  }
}

function isValidKeyForUser(key: string, userId: string): { ok: boolean; reason?: string } {
  if (!key || typeof key !== 'string') return { ok: false, reason: 'Missing key' };
  if (key.includes('..') || key.startsWith('/') || key.includes('//') || key.includes('\\')) {
    return { ok: false, reason: 'Invalid file path' };
  }

  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2) return { ok: false, reason: 'Invalid file path' };

  const bucket = parts[0];
  if (!ALLOWED_KEY_BUCKETS.has(bucket)) return { ok: false, reason: 'Invalid bucket' };

  const second = parts[1] || '';
  // Enforce per-user prefix to prevent IDOR overwrites:
  // - <bucket>/<userId>/... (folder scoping)
  // - <bucket>/<userId>_... (filename prefix scoping)
  const scoped =
    second === userId ||
    second.startsWith(`${userId}_`);

  if (!scoped) return { ok: false, reason: 'Invalid key scope' };
  return { ok: true };
}

// HMAC-SHA256 helper
async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

// Get signing key for AWS Signature V4
async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // âœ… AUTHENTICATION CHECK
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Unauthorized:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { key, contentType, fileSize } = await req.json();

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Missing key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid fileSize' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedContentType =
      (typeof contentType === 'string' && contentType.trim()) ||
      inferContentTypeFromKey(key) ||
      'application/octet-stream';

    // âœ… VALIDATE CONTENT TYPE (strip codec params like "video/webm;codecs=vp9,opus")
    const baseContentType = normalizedContentType.split(';')[0].trim();
    if (!ALLOWED_CONTENT_TYPES.includes(baseContentType)) {
      console.error(`Invalid content type: ${normalizedContentType}`);
      return new Response(
        JSON.stringify({ error: 'File type not allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // âœ… VALIDATE KEY FORMAT + SCOPE (prevent path traversal + IDOR overwrites)
    const { data: isAdmin } = await supabaseUser.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });

    if (!isAdmin) {
      const scopeCheck = isValidKeyForUser(key, user.id);
      if (!scopeCheck.ok) {
        return new Response(
          JSON.stringify({ error: scopeCheck.reason || 'Invalid file path' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Even admins: keep basic path traversal protection + bucket allowlist.
      if (key.includes('..') || key.startsWith('/') || key.includes('//') || key.includes('\\')) {
        return new Response(
          JSON.stringify({ error: 'Invalid file path' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const bucket = key.split('/').filter(Boolean)[0];
      if (!bucket || !ALLOWED_KEY_BUCKETS.has(bucket)) {
        return new Response(
          JSON.stringify({ error: 'Invalid bucket' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // âœ… VALIDATE FILE SIZE
    const isVideo = baseContentType.startsWith('video/');
    const isImage = baseContentType.startsWith('image/');
    const maxSize = isImage ? MAX_IMAGE_SIZE : (isVideo ? MAX_VIDEO_SIZE : MAX_DOCUMENT_SIZE);
    if (fileSize > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return new Response(
        JSON.stringify({ error: `File too large. Max ${maxSizeMB}MB for ${isVideo ? 'videos' : (isImage ? 'images' : 'documents')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // R2 credentials
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
    const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!;
    // NOTE: Ensure CLOUDFLARE_R2_PUBLIC_URL is set to the new public bucket:
    // https://pub-fe745f8832684f4198a9b0e88e8d451a.r2.dev
    const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error('Missing R2 configuration');
    }

    // AWS Signature V4 for presigned URL
    const region = 'auto';
    const service = 's3';
    const host = `${accountId}.r2.cloudflarestorage.com`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    
    // URL expires in 15 minutes
    const expiresIn = 900;

    const method = 'PUT';
    const canonicalUri = `/${bucketName}/${key}`;
    const signedHeaders = 'host';
    
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const credential = `${accessKeyId}/${credentialScope}`;
    
    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': algorithm,
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': signedHeaders,
    });
    
    queryParams.sort();
    const canonicalQueryString = queryParams.toString();
    const canonicalHeaders = `host:${host}\n`;
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const canonicalRequestHash = toHex(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
    );
    
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    queryParams.append('X-Amz-Signature', signature);
    const uploadUrl = `https://${host}${canonicalUri}?${queryParams.toString()}`;
    const filePublicUrl = `${publicUrl}/${key}`;
    const warning =
      !publicUrl || publicUrl.includes('media.fun.rich')
        ? 'CLOUDFLARE_R2_PUBLIC_URL is missing or points to media.fun.rich'
        : undefined;
    if (warning) {
      console.warn(`[get-upload-url] ${warning}`);
    }

    console.log(`Generated presigned URL for ${key} by user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        uploadUrl,
        publicUrl: filePublicUrl,
        key,
        contentType: baseContentType,
        size: fileSize,
        warning,
        expiresIn,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating upload URL:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});







```

### FILE: supabase/migrations/20260112145038_b700216f-a256-4fe4-b957-b9559580c085.sql
`$ext
-- =============================================
-- FUN CHAT - FULL MESSENGER DATABASE SCHEMA
-- =============================================

-- 1. Conversations table (Direct & Group chats)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name TEXT, -- Group name (NULL for direct chat)
  avatar_url TEXT, -- Group avatar
  created_by UUID,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_preview TEXT, -- Preview of last message for list
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Conversation participants
CREATE TABLE public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  nickname TEXT, -- Nickname in group
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ, -- NULL if still in conversation
  muted_until TIMESTAMPTZ, -- Mute notifications until
  last_read_at TIMESTAMPTZ DEFAULT now(), -- For unread count
  UNIQUE(conversation_id, user_id)
);

-- 3. Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT, -- Text content
  media_urls JSONB DEFAULT '[]'::jsonb, -- Array of media URLs
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Message reads (for read receipts)
CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- 5. Message reactions
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 6. Chat settings (privacy)
CREATE TABLE public.chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  who_can_message TEXT DEFAULT 'friends' CHECK (who_can_message IN ('everyone', 'friends', 'nobody')),
  show_read_receipts BOOLEAN DEFAULT true,
  show_typing_indicator BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversation_participants_user ON public.conversation_participants(user_id) WHERE left_at IS NULL;
CREATE INDEX idx_conversation_participants_conversation ON public.conversation_participants(conversation_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_reply ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_message_reads_message ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user ON public.message_reads(user_id);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is participant of conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = check_user_id
      AND left_at IS NULL
  )
$$;

-- Helper function: Check if user is admin of conversation
CREATE OR REPLACE FUNCTION public.is_conversation_admin(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = check_user_id
      AND role = 'admin'
      AND left_at IS NULL
  )
$$;

-- CONVERSATIONS POLICIES
CREATE POLICY "Users can view their conversations"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_participant(id, auth.uid()));

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update conversations"
  ON public.conversations FOR UPDATE
  USING (public.is_conversation_admin(id, auth.uid()));

-- CONVERSATION_PARTICIPANTS POLICIES
CREATE POLICY "Users can view participants of their conversations"
  ON public.conversation_participants FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can add participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (
      -- Creator adds themselves or others to new conversation
      user_id = auth.uid() OR
      public.is_conversation_admin(conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can remove participants"
  ON public.conversation_participants FOR DELETE
  USING (
    user_id = auth.uid() OR
    public.is_conversation_admin(conversation_id, auth.uid())
  );

-- MESSAGES POLICIES
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());

-- MESSAGE_READS POLICIES
CREATE POLICY "Users can view read receipts in their conversations"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

-- MESSAGE_REACTIONS POLICIES
CREATE POLICY "Users can view reactions in their conversations"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can add reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- CHAT_SETTINGS POLICIES
CREATE POLICY "Users can view their own chat settings"
  ON public.chat_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own chat settings"
  ON public.chat_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chat settings"
  ON public.chat_settings FOR UPDATE
  USING (user_id = auth.uid());

-- Allow users to check others' settings for permission checking
CREATE POLICY "Users can view others' message permissions"
  ON public.chat_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- TRIGGERS & FUNCTIONS
-- =============================================

-- Update conversation last_message_at when new message is sent
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- Updated_at trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for messages
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for chat_settings
CREATE TRIGGER update_chat_settings_updated_at
  BEFORE UPDATE ON public.chat_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ENABLE REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
```

### FILE: supabase/migrations/20260113032534_6e7dee7c-abe7-4f9c-8141-4cf4162d4886.sql
`$ext
-- Fix RLS policies for creating direct conversations

-- 1. Drop existing SELECT policy on conversations and create new one
-- that allows users to see conversations they created OR are participants of
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;

CREATE POLICY "Users can view conversations they are part of" 
ON public.conversations 
FOR SELECT 
USING (
  created_by = auth.uid() 
  OR 
  EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = id 
    AND user_id = auth.uid() 
    AND left_at IS NULL
  )
);

-- 2. Drop existing INSERT policy on conversation_participants and create new one
-- that allows conversation creators to add participants
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

CREATE POLICY "Users can add participants to conversations" 
ON public.conversation_participants 
FOR INSERT 
WITH CHECK (
  -- User can add themselves
  user_id = auth.uid()
  OR
  -- Or user is the conversation creator (for initial setup of direct/group chats)
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_id 
    AND created_by = auth.uid()
  )
  OR
  -- Or user is an admin of the conversation
  EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conversation_participants.conversation_id 
    AND user_id = auth.uid() 
    AND role = 'admin' 
    AND left_at IS NULL
  )
);
```

### FILE: supabase/migrations/20260202032057_bfde2c00-860e-43a0-b727-a938ae10956f.sql
`$ext
-- Create call_sessions table for tracking call history
CREATE TABLE public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'active', 'ended', 'missed', 'declined')),
  channel_name TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create call_participants table
CREATE TABLE public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_call_sessions_conversation ON public.call_sessions(conversation_id);
CREATE INDEX idx_call_sessions_status ON public.call_sessions(status);
CREATE INDEX idx_call_sessions_initiator ON public.call_sessions(initiator_id);
CREATE INDEX idx_call_participants_session ON public.call_participants(call_session_id);
CREATE INDEX idx_call_participants_user ON public.call_participants(user_id);

-- Enable RLS
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_sessions
-- Users can view call sessions for conversations they're part of
CREATE POLICY "Users can view call sessions in their conversations"
  ON public.call_sessions FOR SELECT
  USING (is_conversation_participant(conversation_id, auth.uid()));

-- Users can create call sessions in conversations they're part of
CREATE POLICY "Users can create call sessions in their conversations"
  ON public.call_sessions FOR INSERT
  WITH CHECK (
    initiator_id = auth.uid() 
    AND is_conversation_participant(conversation_id, auth.uid())
  );

-- Participants can update call sessions (for status changes)
CREATE POLICY "Participants can update call sessions"
  ON public.call_sessions FOR UPDATE
  USING (is_conversation_participant(conversation_id, auth.uid()));

-- RLS Policies for call_participants
-- Users can view participants in call sessions they have access to
CREATE POLICY "Users can view call participants"
  ON public.call_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_participants.call_session_id
      AND is_conversation_participant(cs.conversation_id, auth.uid())
    )
  );

-- Users can add themselves as participants
CREATE POLICY "Users can join calls"
  ON public.call_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_participants.call_session_id
      AND is_conversation_participant(cs.conversation_id, auth.uid())
    )
  );

-- Users can update their own participant record
CREATE POLICY "Users can update their participant status"
  ON public.call_participants FOR UPDATE
  USING (user_id = auth.uid());

-- Users can leave calls (delete their participant record)
CREATE POLICY "Users can leave calls"
  ON public.call_participants FOR DELETE
  USING (user_id = auth.uid());

-- Enable realtime for call notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;

-- Create trigger to update updated_at
CREATE TRIGGER update_call_sessions_updated_at
  BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### FILE: supabase/migrations/20260203060452_c7b031ea-68fa-4777-83f4-d6ffe66df83a.sql
`$ext
-- Enable realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
```

### FILE: supabase/migrations/20260207070852_3871af2a-7d33-43e9-a37f-610aa1074824.sql
`$ext
-- Create crypto_gifts table for tracking crypto gift transactions
CREATE TABLE public.crypto_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  token text NOT NULL CHECK (token IN ('BNB', 'CAMLY', 'USDT')),
  amount_numeric numeric NOT NULL CHECK (amount_numeric > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  tx_hash text,
  error text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.crypto_gifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own gifts"
  ON public.crypto_gifts FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can view their sent or received gifts"
  ON public.crypto_gifts FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can update their own pending gifts"
  ON public.crypto_gifts FOR UPDATE
  USING (auth.uid() = from_user_id);

-- Index for faster queries
CREATE INDEX idx_crypto_gifts_from_user ON public.crypto_gifts(from_user_id);
CREATE INDEX idx_crypto_gifts_to_user ON public.crypto_gifts(to_user_id);
CREATE INDEX idx_crypto_gifts_created_at ON public.crypto_gifts(created_at DESC);
```

### FILE: supabase/migrations/20260207090000_create_crypto_gifts.sql
`$ext
-- Create crypto_gifts table
CREATE TABLE IF NOT EXISTS public.crypto_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  token text NOT NULL CHECK (token IN ('BNB','CAMLY','USDT')),
  amount_numeric numeric NOT NULL,
  chain_id int NOT NULL DEFAULT 56,
  tx_hash text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  error text NULL
);

CREATE INDEX IF NOT EXISTS idx_crypto_gifts_from_user_id ON public.crypto_gifts(from_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_to_user_id ON public.crypto_gifts(to_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_created_at ON public.crypto_gifts(created_at);

ALTER TABLE public.crypto_gifts ENABLE ROW LEVEL SECURITY;

-- Allow users to see gifts they sent or received
CREATE POLICY "crypto_gifts_select_own"
ON public.crypto_gifts
FOR SELECT
USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Allow users to insert gifts they send
CREATE POLICY "crypto_gifts_insert_sender"
ON public.crypto_gifts
FOR INSERT
WITH CHECK (from_user_id = auth.uid());

-- Allow users to update their own sent gifts (tx_hash/status/error)
CREATE POLICY "crypto_gifts_update_sender"
ON public.crypto_gifts
FOR UPDATE
USING (from_user_id = auth.uid())
WITH CHECK (from_user_id = auth.uid());

```

### FILE: supabase/migrations/20260210120000_chat_pins_search.sql
`$ext
-- Chat Phase 1: Pins + Search indexes

-- Trigram extension for fast ILIKE/substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add pin columns to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pinned_by uuid NULL REFERENCES auth.users(id);

-- Index for pinned banner lookup per conversation
CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages (conversation_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- Search index on content (Phase 1 scope: search within a conversation)
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages
  USING gin (content gin_trgm_ops);

-- RPC: pin/unpin (bypass message UPDATE RLS; enforces conversation membership)
CREATE OR REPLACE FUNCTION public.pin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  SELECT m.conversation_id INTO v_conversation_id
  FROM public.messages m
  WHERE m.id = p_message_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.is_conversation_participant(v_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  UPDATE public.messages
  SET pinned_at = now(),
      pinned_by = auth.uid()
  WHERE id = p_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  SELECT m.conversation_id INTO v_conversation_id
  FROM public.messages m
  WHERE m.id = p_message_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.is_conversation_participant(v_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  UPDATE public.messages
  SET pinned_at = NULL,
      pinned_by = NULL
  WHERE id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pin_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_message(uuid) TO authenticated;


```

### FILE: supabase/migrations/20260210120500_chat_block_report.sql
`$ext
-- Chat Phase 1: Block & Report

-- 1) Blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own blocks"
  ON public.user_blocks
  FOR ALL
  TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- SECURITY DEFINER helper so other policies (e.g. messages INSERT) can detect blocks
-- in either direction without being limited by user_blocks RLS.
CREATE OR REPLACE FUNCTION public.has_block_between(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (ub.blocker_id = p_user_a AND ub.blocked_id = p_user_b)
       OR (ub.blocker_id = p_user_b AND ub.blocked_id = p_user_a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_block_between(uuid, uuid) TO authenticated;

-- 2) Reports table (moderation feedback)
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Reporter can create + view own
CREATE POLICY "Users can create reports"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Users can view own reports"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Admin can review
CREATE POLICY "Admins can review reports"
  ON public.reports
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Enforce DM block on message send: replace messages INSERT policy
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
    AND (
      (SELECT c.type FROM public.conversations c WHERE c.id = conversation_id) <> 'direct'
      OR NOT EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = public.messages.conversation_id
          AND cp.user_id <> auth.uid()
          AND cp.left_at IS NULL
          AND public.has_block_between(auth.uid(), cp.user_id)
      )
    )
  );

```

### FILE: supabase/migrations/20260210121000_chat_stickers_edit.sql
`$ext
-- Chat Phase 1: Stickers + Edit Message + Message metadata/type

-- 1) Messages columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL;

-- Basic index for filtering by type (optional but helps)
CREATE INDEX IF NOT EXISTS idx_messages_type
  ON public.messages (conversation_id, message_type, created_at DESC);

-- 2) Replace messages UPDATE policy to enforce:
-- - author-only
-- - edits only within 15 minutes for non-deleted text messages
-- - soft delete allowed anytime by author (is_deleted = true)
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

CREATE POLICY "Users can update their own messages"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      -- Soft delete: allow anytime
      is_deleted = true
      OR (
        -- Edit: only text messages, not deleted, within 15 minutes
        message_type = 'text'
        AND is_deleted = false
        AND now() - created_at <= interval '15 minutes'
      )
    )
  );

-- Optional hard DELETE: disable it for Phase 1 (keep as soft delete)
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

-- 3) Stickers tables
CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NULL,
  preview_url text NULL,
  is_premium boolean NOT NULL DEFAULT false,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  emoji text NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stickers_pack ON public.stickers(pack_id, sort_order);

-- Optional ownership table (premium packs)
CREATE TABLE IF NOT EXISTS public.user_sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, pack_id)
);

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sticker_packs ENABLE ROW LEVEL SECURITY;

-- Everyone can view sticker catalog
CREATE POLICY "Sticker packs are viewable"
  ON public.sticker_packs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Stickers are viewable"
  ON public.stickers
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can view their owned packs
CREATE POLICY "Users can view own sticker packs"
  ON public.user_sticker_packs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can acquire packs for themselves (Phase 1)
CREATE POLICY "Users can insert own sticker packs"
  ON public.user_sticker_packs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Seed 1 free pack + a few starter stickers (idempotent-ish via name)
DO $$
DECLARE
  v_pack_id uuid;
BEGIN
  SELECT id INTO v_pack_id FROM public.sticker_packs WHERE name = 'Fun Starter';
  IF v_pack_id IS NULL THEN
    INSERT INTO public.sticker_packs (name, description, preview_url, is_premium, price)
    VALUES ('Fun Starter', 'Free starter stickers', '/stickers/preview.svg', false, 0)
    RETURNING id INTO v_pack_id;
  END IF;

  -- Insert stickers if pack has none
  IF NOT EXISTS (SELECT 1 FROM public.stickers WHERE pack_id = v_pack_id) THEN
    INSERT INTO public.stickers (pack_id, name, url, emoji, sort_order) VALUES
      (v_pack_id, 'Hello', '/stickers/hello.svg', 'đŸ‘‹', 1),
      (v_pack_id, 'Love',  '/stickers/love.svg',  'â¤ï¸', 2),
      (v_pack_id, 'Lol',   '/stickers/lol.svg',   'đŸ˜‚', 3),
      (v_pack_id, 'Wow',   '/stickers/wow.svg',   'đŸ˜®', 4),
      (v_pack_id, 'Sad',   '/stickers/sad.svg',   'đŸ˜¢', 5),
      (v_pack_id, 'Angry', '/stickers/angry.svg', 'đŸ˜¡', 6);
  END IF;
END $$;


```

### FILE: supabase/migrations/20260210121500_chat_red_envelope.sql
`$ext
-- Chat Phase 1: Red Envelope (Li xi)

CREATE TABLE IF NOT EXISTS public.red_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  token text NOT NULL CHECK (token IN ('CAMLY','BNB')),
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  total_count int NOT NULL CHECK (total_count > 0),
  remaining_amount numeric NOT NULL CHECK (remaining_amount >= 0),
  remaining_count int NOT NULL CHECK (remaining_count >= 0),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','fully_claimed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_red_envelopes_conversation ON public.red_envelopes(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_envelopes_status ON public.red_envelopes(status);

CREATE TABLE IF NOT EXISTS public.red_envelope_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.red_envelopes(id) ON DELETE CASCADE,
  claimer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(envelope_id, claimer_id)
);

CREATE INDEX IF NOT EXISTS idx_red_envelope_claims_envelope ON public.red_envelope_claims(envelope_id, claimed_at ASC);
CREATE INDEX IF NOT EXISTS idx_red_envelope_claims_claimer ON public.red_envelope_claims(claimer_id, claimed_at DESC);

ALTER TABLE public.red_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_envelope_claims ENABLE ROW LEVEL SECURITY;

-- Envelopes visible to conversation members
CREATE POLICY "Users can view envelopes in their conversations"
  ON public.red_envelopes
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can create envelopes in their conversations"
  ON public.red_envelopes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

-- Claims visible to conversation members (via envelope)
CREATE POLICY "Users can view claims in their conversations"
  ON public.red_envelope_claims
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.red_envelopes e
      WHERE e.id = envelope_id
        AND public.is_conversation_participant(e.conversation_id, auth.uid())
    )
  );

-- Users can claim for themselves (insert is done via RPC; keep policy anyway)
CREATE POLICY "Users can insert own claims"
  ON public.red_envelope_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (claimer_id = auth.uid());

-- Enable realtime (Phase 1 UX)
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelopes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelope_claims;

-- Atomic claim function (random split)
CREATE OR REPLACE FUNCTION public.claim_red_envelope(p_envelope_id uuid)
RETURNS TABLE (amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_envelope public.red_envelopes%ROWTYPE;
  v_min numeric;
  v_decimals int;
  v_avg numeric;
  v_max numeric;
  v_cap numeric;
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_envelope
  FROM public.red_envelopes
  WHERE id = p_envelope_id
  FOR UPDATE;

  IF v_envelope.id IS NULL THEN
    RAISE EXCEPTION 'Envelope not found';
  END IF;

  IF NOT public.is_conversation_participant(v_envelope.conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a conversation participant';
  END IF;

  IF v_envelope.status <> 'active' OR v_envelope.expires_at <= now() THEN
    UPDATE public.red_envelopes
    SET status = CASE
      WHEN remaining_count <= 0 THEN 'fully_claimed'
      ELSE 'expired'
    END
    WHERE id = v_envelope.id;
    RAISE EXCEPTION 'Envelope expired or inactive';
  END IF;

  IF v_envelope.remaining_count <= 0 OR v_envelope.remaining_amount <= 0 THEN
    UPDATE public.red_envelopes SET status = 'fully_claimed' WHERE id = v_envelope.id;
    RAISE EXCEPTION 'Envelope fully claimed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.red_envelope_claims
    WHERE envelope_id = v_envelope.id AND claimer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  -- Token precision + minimum unit
  IF v_envelope.token = 'BNB' THEN
    v_decimals := 8;
    v_min := 0.0001;
  ELSE
    v_decimals := 3;
    v_min := 0.001;
  END IF;

  IF v_envelope.remaining_count = 1 THEN
    v_amount := v_envelope.remaining_amount;
  ELSE
    v_avg := v_envelope.remaining_amount / v_envelope.remaining_count;
    v_max := v_envelope.remaining_amount - v_min * (v_envelope.remaining_count - 1);

    -- Typical hongbao: random in [min, 2*avg], but never exceed v_max
    v_cap := LEAST(v_max, GREATEST(v_min, 2 * v_avg));
    v_amount := v_min + (v_cap - v_min) * random();
  END IF;

  v_amount := LEAST(v_amount, v_envelope.remaining_amount);
  v_amount := round(v_amount, v_decimals);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid claim amount';
  END IF;

  INSERT INTO public.red_envelope_claims (envelope_id, claimer_id, amount)
  VALUES (v_envelope.id, auth.uid(), v_amount);

  UPDATE public.red_envelopes
  SET
    remaining_amount = remaining_amount - v_amount,
    remaining_count = remaining_count - 1,
    status = CASE
      WHEN remaining_count - 1 <= 0 OR remaining_amount - v_amount <= 0 THEN 'fully_claimed'
      ELSE status
    END
  WHERE id = v_envelope.id;

  RETURN QUERY SELECT v_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_red_envelope(uuid) TO authenticated;


```

### FILE: supabase/migrations/20260210121800_chat_message_preview.sql
`$ext
-- Chat Phase 1: Improve conversation preview for non-text message types

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preview text;
BEGIN
  -- Derive preview
  IF NEW.is_deleted = true THEN
    v_preview := '[Deleted]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'sticker' THEN
    v_preview := '[Sticker]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'red_envelope' THEN
    v_preview := '[Red Envelope]';
  ELSIF COALESCE(NEW.content, '') <> '' THEN
    v_preview := LEFT(NEW.content, 100);
  ELSIF (NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0) THEN
    v_preview := '[Attachment]';
  ELSE
    v_preview := '';
  END IF;

  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = v_preview,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;


```

### FILE: supabase/migrations/20260210170411_e7233ae3-c9be-448f-9b58-c49da8064b0c.sql
`$ext

-- ============================================================
-- 1. ThĂªm cá»™t thiáº¿u vĂ o báº£ng messages
-- ============================================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ============================================================
-- 2. Báº£ng user_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND blocker_id != blocked_id);

CREATE POLICY "Users can unblock"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- ============================================================
-- 3. Báº£ng red_envelopes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.red_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  token text NOT NULL DEFAULT 'CAMLY',
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  total_count int NOT NULL CHECK (total_count > 0),
  remaining_amount numeric NOT NULL,
  remaining_count int NOT NULL,
  greeting text DEFAULT 'đŸ§§ ChĂºc má»«ng nÄƒm má»›i!',
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.red_envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view envelopes in their conversations"
  ON public.red_envelopes FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants can create envelopes"
  ON public.red_envelopes FOR INSERT
  WITH CHECK (auth.uid() = creator_id AND public.is_conversation_participant(conversation_id, auth.uid()));

-- ============================================================
-- 4. Báº£ng red_envelope_claims
-- ============================================================
CREATE TABLE IF NOT EXISTS public.red_envelope_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.red_envelopes(id) ON DELETE CASCADE,
  claimer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(envelope_id, claimer_id)
);

ALTER TABLE public.red_envelope_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view claims"
  ON public.red_envelope_claims FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.red_envelopes re
    WHERE re.id = envelope_id
      AND public.is_conversation_participant(re.conversation_id, auth.uid())
  ));

-- ============================================================
-- 5. Báº£ng reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ============================================================
-- 6. Báº£ng sticker_packs & stickers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  preview_url text NOT NULL,
  is_free boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active sticker packs"
  ON public.sticker_packs FOR SELECT
  USING (is_active = true);

CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stickers"
  ON public.stickers FOR SELECT
  USING (true);

-- ============================================================
-- 7. HĂ m pin_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.pin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  
  IF NOT is_conversation_participant(v_conv_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;
  
  UPDATE messages
  SET pinned_at = now(), pinned_by = auth.uid()
  WHERE id = p_message_id;
END;
$$;

-- ============================================================
-- 8. HĂ m unpin_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.unpin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  
  IF NOT is_conversation_participant(v_conv_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;
  
  UPDATE messages
  SET pinned_at = NULL, pinned_by = NULL
  WHERE id = p_message_id;
END;
$$;

-- ============================================================
-- 9. HĂ m claim_red_envelope
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_red_envelope(p_envelope_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_envelope red_envelopes%ROWTYPE;
  v_amount numeric;
BEGIN
  SELECT * INTO v_envelope FROM red_envelopes WHERE id = p_envelope_id FOR UPDATE;
  
  IF v_envelope IS NULL THEN
    RAISE EXCEPTION 'Envelope not found';
  END IF;
  
  IF v_envelope.status != 'active' THEN
    RAISE EXCEPTION 'Envelope is no longer active';
  END IF;
  
  IF v_envelope.expires_at < now() THEN
    UPDATE red_envelopes SET status = 'expired' WHERE id = p_envelope_id;
    RAISE EXCEPTION 'Envelope has expired';
  END IF;
  
  IF NOT is_conversation_participant(v_envelope.conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  
  IF EXISTS (SELECT 1 FROM red_envelope_claims WHERE envelope_id = p_envelope_id AND claimer_id = auth.uid()) THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;
  
  IF v_envelope.remaining_count <= 0 THEN
    RAISE EXCEPTION 'No more envelopes left';
  END IF;
  
  -- Random amount for non-last claim
  IF v_envelope.remaining_count = 1 THEN
    v_amount := v_envelope.remaining_amount;
  ELSE
    v_amount := ROUND((random() * v_envelope.remaining_amount * 2 / v_envelope.remaining_count)::numeric, 2);
    IF v_amount < 0.01 THEN v_amount := 0.01; END IF;
    IF v_amount > v_envelope.remaining_amount - (v_envelope.remaining_count - 1) * 0.01 THEN
      v_amount := v_envelope.remaining_amount - (v_envelope.remaining_count - 1) * 0.01;
    END IF;
  END IF;
  
  INSERT INTO red_envelope_claims (envelope_id, claimer_id, amount)
  VALUES (p_envelope_id, auth.uid(), v_amount);
  
  UPDATE red_envelopes
  SET remaining_amount = remaining_amount - v_amount,
      remaining_count = remaining_count - 1,
      status = CASE WHEN remaining_count - 1 = 0 THEN 'completed' ELSE 'active' END
  WHERE id = p_envelope_id;
  
  RETURN v_amount;
END;
$$;

-- ============================================================
-- 10. Báº­t Realtime cho báº£ng má»›i
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelopes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelope_claims;

-- ============================================================
-- 11. Seed sticker packs (dĂ¹ng stickers cĂ³ sáºµn trong public/stickers/)
-- ============================================================
INSERT INTO public.sticker_packs (id, name, description, preview_url, is_free, sort_order)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Fun Emotions', 'Bá»™ sticker cáº£m xĂºc vui nhá»™n', '/stickers/preview.svg', true, 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.stickers (pack_id, name, url, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', 'Hello', '/stickers/hello.svg', 1),
('a0000000-0000-0000-0000-000000000001', 'Love', '/stickers/love.svg', 2),
('a0000000-0000-0000-0000-000000000001', 'LOL', '/stickers/lol.svg', 3),
('a0000000-0000-0000-0000-000000000001', 'Wow', '/stickers/wow.svg', 4),
('a0000000-0000-0000-0000-000000000001', 'Sad', '/stickers/sad.svg', 5),
('a0000000-0000-0000-0000-000000000001', 'Angry', '/stickers/angry.svg', 6)
ON CONFLICT DO NOTHING;

```

### FILE: supabase/migrations/20260210190000_crypto_gifts_fix.sql
`$ext
-- Phase 0: Fix crypto_gifts schema drift + tighten RLS/updates

-- 1) Schema drift: add missing columns (older envs created without these)
ALTER TABLE public.crypto_gifts
  ADD COLUMN IF NOT EXISTS message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chain_id int NOT NULL DEFAULT 56;

-- 2) Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_from_user_id ON public.crypto_gifts(from_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_to_user_id ON public.crypto_gifts(to_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_created_at_desc ON public.crypto_gifts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_conversation_id ON public.crypto_gifts(conversation_id);

-- 3) RLS policies: canonicalize (older migrations created different policy names)
ALTER TABLE public.crypto_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own gifts" ON public.crypto_gifts;
DROP POLICY IF EXISTS "Users can view their sent or received gifts" ON public.crypto_gifts;
DROP POLICY IF EXISTS "Users can update their own pending gifts" ON public.crypto_gifts;

DROP POLICY IF EXISTS "crypto_gifts_select_own" ON public.crypto_gifts;
DROP POLICY IF EXISTS "crypto_gifts_insert_sender" ON public.crypto_gifts;
DROP POLICY IF EXISTS "crypto_gifts_update_sender" ON public.crypto_gifts;

CREATE POLICY "crypto_gifts_select_own"
  ON public.crypto_gifts
  FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "crypto_gifts_insert_sender"
  ON public.crypto_gifts
  FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "crypto_gifts_update_sender"
  ON public.crypto_gifts
  FOR UPDATE
  TO authenticated
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());

-- 4) Tighten what can change on UPDATE.
-- RLS can't restrict column updates; enforce immutability with a trigger.
CREATE OR REPLACE FUNCTION public.crypto_gifts_validate_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Immutable identity fields
  IF NEW.from_user_id <> OLD.from_user_id THEN
    RAISE EXCEPTION 'from_user_id is immutable';
  END IF;
  IF NEW.to_user_id <> OLD.to_user_id THEN
    RAISE EXCEPTION 'to_user_id is immutable';
  END IF;
  IF NEW.to_address <> OLD.to_address THEN
    RAISE EXCEPTION 'to_address is immutable';
  END IF;
  IF NEW.token <> OLD.token THEN
    RAISE EXCEPTION 'token is immutable';
  END IF;
  IF NEW.amount_numeric <> OLD.amount_numeric THEN
    RAISE EXCEPTION 'amount is immutable';
  END IF;
  IF COALESCE(NEW.conversation_id::text, '') <> COALESCE(OLD.conversation_id::text, '') THEN
    RAISE EXCEPTION 'conversation_id is immutable';
  END IF;
  IF NEW.chain_id <> OLD.chain_id THEN
    RAISE EXCEPTION 'chain_id is immutable';
  END IF;

  -- message_id: allow attaching once (NULL -> value), but not changing later
  IF OLD.message_id IS NOT NULL AND COALESCE(NEW.message_id::text, '') <> COALESCE(OLD.message_id::text, '') THEN
    RAISE EXCEPTION 'message_id is immutable once set';
  END IF;

  -- tx_hash: allow setting once; forbid changing to a different hash
  IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN
    RAISE EXCEPTION 'tx_hash is immutable once set';
  END IF;

  -- Status transitions: pending -> confirmed|failed (or stay pending).
  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'status is immutable after it leaves pending';
  END IF;
  IF OLD.status = 'pending' AND NEW.status NOT IN ('pending','confirmed','failed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crypto_gifts_validate_update_trg ON public.crypto_gifts;
CREATE TRIGGER crypto_gifts_validate_update_trg
  BEFORE UPDATE ON public.crypto_gifts
  FOR EACH ROW
  EXECUTE FUNCTION public.crypto_gifts_validate_update();


```

### FILE: supabase/migrations/20260210235400_a092e63d-9c73-4a06-8a63-51c6bb845844.sql
`$ext

-- Add missing columns to crypto_gifts
ALTER TABLE public.crypto_gifts
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id),
  ADD COLUMN IF NOT EXISTS chain_id int NOT NULL DEFAULT 56;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_message_id ON public.crypto_gifts(message_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_conversation_id ON public.crypto_gifts(conversation_id);

-- Trigger to protect immutable fields
CREATE OR REPLACE FUNCTION public.crypto_gifts_validate_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
    OR NEW.to_address IS DISTINCT FROM OLD.to_address
    OR NEW.token IS DISTINCT FROM OLD.token
    OR NEW.amount_numeric IS DISTINCT FROM OLD.amount_numeric
    OR NEW.chain_id IS DISTINCT FROM OLD.chain_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
  THEN
    RAISE EXCEPTION 'Cannot modify immutable fields';
  END IF;
  IF NEW.tx_hash IS DISTINCT FROM OLD.tx_hash AND OLD.tx_hash IS NOT NULL THEN
    RAISE EXCEPTION 'tx_hash can only be set once';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status != 'pending' OR NEW.status NOT IN ('confirmed', 'failed') THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crypto_gifts_validate_update_trg ON public.crypto_gifts;
CREATE TRIGGER crypto_gifts_validate_update_trg
  BEFORE UPDATE ON public.crypto_gifts
  FOR EACH ROW EXECUTE FUNCTION public.crypto_gifts_validate_update();

```

### FILE: supabase/migrations/20260211000428_ddddd96c-af9e-48a2-a687-642c7b473017.sql
`$ext
-- Phase 0.5: Canonicalize crypto_gifts RLS policy names
-- Drop legacy policy names (from 20260207070852)
DROP POLICY IF EXISTS "Users can insert their own gifts" ON public.crypto_gifts;
DROP POLICY IF EXISTS "Users can view their sent or received gifts" ON public.crypto_gifts;
DROP POLICY IF EXISTS "Users can update their own pending gifts" ON public.crypto_gifts;

-- Drop canonical names if they already exist (idempotent)
DROP POLICY IF EXISTS "crypto_gifts_select_own" ON public.crypto_gifts;
DROP POLICY IF EXISTS "crypto_gifts_insert_sender" ON public.crypto_gifts;
DROP POLICY IF EXISTS "crypto_gifts_update_sender" ON public.crypto_gifts;

-- Recreate with canonical names
CREATE POLICY "crypto_gifts_select_own"
  ON public.crypto_gifts FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "crypto_gifts_insert_sender"
  ON public.crypto_gifts FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "crypto_gifts_update_sender"
  ON public.crypto_gifts FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());
```

### FILE: supabase/migrations/20260211120000_chat_preview_on_update.sql
`$ext
-- Phase 1: Keep conversation preview in sync when last message is edited / soft-deleted

-- Update preview only when the updated message is currently the latest by created_at in that conversation.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_id uuid;
  v_preview text;
BEGIN
  SELECT m.id INTO v_last_id
  FROM public.messages m
  WHERE m.conversation_id = NEW.conversation_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_last_id IS NULL OR v_last_id <> NEW.id THEN
    RETURN NEW;
  END IF;

  -- Derive preview (same rules as chat_message_preview migration, but for UPDATE).
  IF NEW.is_deleted = true THEN
    v_preview := '[Deleted]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'sticker' THEN
    v_preview := '[Sticker]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'red_envelope' THEN
    v_preview := '[Red Envelope]';
  ELSIF COALESCE(NEW.content, '') <> '' THEN
    v_preview := LEFT(NEW.content, 100);
  ELSIF (NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0) THEN
    v_preview := '[Attachment]';
  ELSE
    v_preview := '';
  END IF;

  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = v_preview,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_update_preview ON public.messages;
CREATE TRIGGER on_message_update_preview
  AFTER UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message_on_update();

```

### FILE: supabase/migrations/20260214180919_93a90bf9-6e54-4835-a82c-f306bd3d1b4c.sql
`$ext

-- 1. Add agora_channel column to live_sessions
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS agora_channel text;
UPDATE public.live_sessions SET agora_channel = channel_name WHERE agora_channel IS NULL;

-- 2. Create live_messages table
CREATE TABLE public.live_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live messages"
  ON public.live_messages FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can send messages"
  ON public.live_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_live_messages_session_created ON public.live_messages (session_id, created_at);

-- 3. Create live_reactions table
CREATE TABLE public.live_reactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL DEFAULT 'heart',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live reactions"
  ON public.live_reactions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can send reactions"
  ON public.live_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_live_reactions_session_created ON public.live_reactions (session_id, created_at);

-- 4. Enable realtime for both new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;

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

Supabase Functions secrets
```bash
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
```

Cloudflare Worker secrets
```bash
AGORA_APP_ID=${AGORA_APP_ID}
AGORA_APP_CERTIFICATE=${AGORA_APP_CERTIFICATE}
AGORA_CUSTOMER_ID=${AGORA_CUSTOMER_ID}
AGORA_CUSTOMER_SECRET=${AGORA_CUSTOMER_SECRET}
API_KEY=${API_KEY}
```

## IMPORT CHECKLIST (LOVABLE TARGET PROJECT)

1. Copy all files in this bundle to the exact paths.
2. Ensure route `/chat` and `/chat/:conversationId` points to `src/modules/chat/pages/Chat.tsx`.
3. Mount `CallProvider` globally so incoming-call dialog works outside chat route.
4. Provide Supabase client at `src/integrations/supabase/client.ts`.
5. Apply listed Supabase migrations in order.
6. Deploy edge functions: `agora-token`, `angel-inline`, `get-upload-url`.
7. Deploy Worker and set required secrets/vars in `worker/wrangler.toml`.
8. Verify call path: `useAgoraCall` -> `src/lib/agoraRtc.ts` -> Worker `/token/rtc`.
9. Verify required shared UI dependencies (shadcn components, EmojiPicker, toast, etc.) exist in target project.

