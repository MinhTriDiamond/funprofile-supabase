import { supabase } from '@/integrations/supabase/client';

export {
  ensureWebcamLiveRecordingStarted,
  getWebcamLiveStatus,
  startWebcamLiveSessionBackend,
  stopWebcamLiveSessionBackend,
  type WebcamLiveStartInput,
  type WebcamLiveStartResult,
  type WebcamLiveStatusResult,
  type WebcamRecordingEnsureResult,
} from '../../liveService';

/**
 * Best-effort tab-close notifier. Dùng fetch keepalive để request vẫn được gửi
 * khi trang đang unload (sendBeacon không truyền được Authorization header cho
 * edge function `live-webcam-stop`). Nếu thất bại, backend heartbeat cutoff 60s
 * là lưới an toàn cuối.
 */
export async function sendWebcamLiveStopBeacon(
  liveSessionId: string,
  reason: string,
): Promise<void> {
  try {
    const supabaseUrl = (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_URL;
    const anonKey = (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_PUBLISHABLE_KEY
      || (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    await fetch(`${supabaseUrl}/functions/v1/live-webcam-stop`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey ?? '',
      },
      body: JSON.stringify({ live_session_id: liveSessionId, reason }),
    });
  } catch {
    /* best-effort */
  }
}
