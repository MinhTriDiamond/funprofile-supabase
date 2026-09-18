import { useRef, useState, useCallback, useEffect } from 'react';
import type { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';
import {
  createChunkedRecorder,
  createChunkUploadQueue,
  type ChunkedRecorderController,
  type ChunkUploadQueueController,
} from '@/modules/live/legacy/browser-recorder';
import {
  finalizeLiveChunks,
  ingestLiveReplayFromR2,
  uploadLiveChunk,
  waitForLiveReplayReady,
  type LiveReplayRow,
} from '@/modules/live/liveService';
import { initRecoverySession, saveChunkBlob, saveChunkKey, clearRecovery } from '@/modules/live/recording/crashRecovery';
import { STREAM_REPLAY_MIME_TYPE } from '@/modules/live/legacy/browser-recorder';
import type { LiveVideoQuality } from '@/modules/live/hooks/useLiveRtc';

export type RecordingPhase = 'idle' | 'recording' | 'stopping' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

export interface FinalizeReplayResult {
  manifestUrl?: string;
  totalChunks: number;
  replayId?: string;
  streamUid?: string | null;
  playbackHls?: string | null;
  thumbnailUrl?: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'skipped_legacy';
}

export interface FinalizeReplayOptions {
  waitForReady?: boolean;
}

interface UseLiveRecordingOptions {
  videoTrack: ICameraVideoTrack | null;
  audioTrack: IMicrophoneAudioTrack | null;
  sessionId?: string;
  recordingId?: string;
  autoStart?: boolean;
  videoQuality?: LiveVideoQuality;
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 767px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function getRecordingTuning(videoQuality: LiveVideoQuality = '480p') {
  const mobile = isMobileDevice();
  const mobileTuning = {
    'auto': { chunkDurationMs: 4500, videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 96_000, uploadConcurrency: 2 },
    '360p': { chunkDurationMs: 5000, videoBitsPerSecond: 550_000, audioBitsPerSecond: 96_000, uploadConcurrency: 1 },
    '480p': { chunkDurationMs: 5000, videoBitsPerSecond: 700_000, audioBitsPerSecond: 96_000, uploadConcurrency: 1 },
    '720p': { chunkDurationMs: 4500, videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 96_000, uploadConcurrency: 2 },
    '1080p': { chunkDurationMs: 4000, videoBitsPerSecond: 1_600_000, audioBitsPerSecond: 128_000, uploadConcurrency: 2 },
  } as const;
  const desktopTuning = {
    'auto': { chunkDurationMs: 3000, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 128_000, uploadConcurrency: 4 },
    '360p': { chunkDurationMs: 3000, videoBitsPerSecond: 700_000, audioBitsPerSecond: 96_000, uploadConcurrency: 2 },
    '480p': { chunkDurationMs: 3000, videoBitsPerSecond: 900_000, audioBitsPerSecond: 96_000, uploadConcurrency: 3 },
    '720p': { chunkDurationMs: 3000, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 128_000, uploadConcurrency: 4 },
    '1080p': { chunkDurationMs: 3000, videoBitsPerSecond: 2_200_000, audioBitsPerSecond: 128_000, uploadConcurrency: 4 },
  } as const;
  return mobile ? mobileTuning[videoQuality] : desktopTuning[videoQuality];
}

export function useLiveRecording({ videoTrack, audioTrack, sessionId, recordingId, autoStart = true, videoQuality = '480p' }: UseLiveRecordingOptions) {
  const recorderRef = useRef<ChunkedRecorderController | null>(null);
  const queueRef = useRef<ChunkUploadQueueController | null>(null);
  const chunkKeysRef = useRef<string[]>([]);
  const mimeTypeRef = useRef<string>(STREAM_REPLAY_MIME_TYPE);
  const replayRef = useRef<LiveReplayRow | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadStats, setUploadStats] = useState({ total: 0, uploaded: 0, failed: 0 });
  const [streamUploadProgress, setStreamUploadProgress] = useState(0);
  const [replay, setReplay] = useState<LiveReplayRow | null>(null);
  const startedRef = useRef(false);
  const finalizingRef = useRef(false);

  const start = useCallback(() => {
    if (!videoTrack || !audioTrack || !sessionId || !recordingId || recorderRef.current) return;

    try {
      const videoMediaTrack = videoTrack.getMediaStreamTrack();
      const audioMediaTrack = audioTrack.getMediaStreamTrack();
      if (!videoMediaTrack || !audioMediaTrack) return;

      const stream = new MediaStream([videoMediaTrack, audioMediaTrack]);

      // Init IndexedDB backup
      initRecoverySession(sessionId, STREAM_REPLAY_MIME_TYPE).catch(() => {});

      // Create upload queue �€” now uses presigned URL via Edge Function
      const currentRecordingId = recordingId;
      const tuning = getRecordingTuning(videoQuality);
      const queue = createChunkUploadQueue({
        sessionId,
        concurrency: tuning.uploadConcurrency,
        maxRetries: 3,
        uploadFn: async (chunk) => {
          const key = await uploadLiveChunk(
            chunk.blob,
            currentRecordingId,
            chunk.index,
            chunk.mimeType,
            Math.max(0, chunk.endTime - chunk.startTime),
          );
          chunkKeysRef.current.push(key);
          saveChunkKey(sessionId, key).catch(() => {});
          return key;
        },
        onProgress: (uploaded, total) => {
          setUploadStats({ total, uploaded, failed: 0 });
        },
        onError: (err, chunk) => {
          console.error(`[useLiveRecording] chunk #${chunk.index} upload failed:`, err);
          setUploadStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        },
      });
      queueRef.current = queue;

      const recorder = createChunkedRecorder({
        stream,
        chunkDurationMs: tuning.chunkDurationMs,
        videoBitsPerSecond: tuning.videoBitsPerSecond,
        audioBitsPerSecond: tuning.audioBitsPerSecond,
        onChunk: (chunk) => {
          setChunkCount((c) => c + 1);
          mimeTypeRef.current = chunk.mimeType;
          saveChunkBlob(sessionId, chunk.blob).catch(() => {});
          queue.enqueue(chunk);
        },
        onError: (err) => {
          console.error('[useLiveRecording] recorder error:', err);
        },
        mimeType: STREAM_REPLAY_MIME_TYPE,
      });

      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
    } catch (err) {
      console.error('[useLiveRecording] failed to start:', err);
      setPhase('error');
    }
  }, [videoTrack, audioTrack, sessionId, recordingId, videoQuality]);

  const stop = useCallback(async (): Promise<{ blob: Blob; mimeType: string } | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    setPhase('stopping');
    try {
      const blob = await recorder.stop();
      const mimeType = recorder.getMimeType();
      recorderRef.current = null;
      setPhase('idle');
      return { blob, mimeType };
    } catch (err) {
      console.error('[useLiveRecording] stop error:', err);
      setPhase('error');
      return null;
    }
  }, []);

  const finalize = useCallback(async (options: FinalizeReplayOptions = {}): Promise<FinalizeReplayResult | null> => {
    const queue = queueRef.current;
    if (!queue || !recordingId || !sessionId) return null;

    finalizingRef.current = true;
    setPhase('uploading');
    try {
      if (recorderRef.current?.getState() === 'recording') {
        await stop();
      }
      await queue.flush();

      // Step 1: R2 manifest (backup playback path) �€” best effort
      let manifest: { manifestUrl: string; totalChunks: number } = { manifestUrl: '', totalChunks: 0 };
      try {
        manifest = await finalizeLiveChunks(recordingId, sessionId);
      } catch (e) {
        console.warn('[useLiveRecording] R2 finalize failed (non-fatal):', e);
      }

      // Step 2: Server-side ingest �€” Cloudflare Stream tự kéo file từ R2.
      // KH�”NG còn upload lại file WebM từ trình duy�‡t �†’ nhanh như Facebook.
      console.log('[useLiveRecording] Triggering server-side ingest from R2...');
      setStreamUploadProgress(100);
      const ingest = await ingestLiveReplayFromR2(sessionId, recordingId);
      console.log('[useLiveRecording] Stream ingest accepted:', ingest);
      if (ingest.status === 'skipped_legacy') {
        await clearRecovery(sessionId).catch(() => {});
        setPhase('done');
        return {
          manifestUrl: manifest.manifestUrl,
          totalChunks: manifest.totalChunks,
          replayId: ingest.replay_id,
          streamUid: ingest.stream_uid,
          status: 'skipped_legacy',
        };
      }
      setPhase(ingest.status === 'queued' ? 'queued' : 'processing');

      if (options.waitForReady) {
        const readyReplay = await waitForLiveReplayReady(ingest.replay_id);
        replayRef.current = readyReplay;
        setReplay(readyReplay);
        await clearRecovery(sessionId).catch(() => {});
        setPhase('done');
        return {
          manifestUrl: manifest.manifestUrl,
          totalChunks: manifest.totalChunks,
          replayId: readyReplay.id,
          streamUid: readyReplay.stream_uid || ingest.stream_uid,
          playbackHls: readyReplay.playback_hls,
          thumbnailUrl: readyReplay.thumbnail_url,
          status: 'ready',
        };
      }

      // Background watcher �€” UI �‘ã tr�Ÿ về feed, không chờ
      const channel = supabase
        .channel(`live-replay-watch-${ingest.replay_id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_replays',
          filter: `id=eq.${ingest.replay_id}`,
        }, (payload: { new: LiveReplayRow }) => {
          replayRef.current = payload.new;
          setReplay(payload.new);
          if (payload.new.status === 'ready') {
            setPhase('done');
            clearRecovery(sessionId).catch(() => {});
            supabase.removeChannel(channel);
          } else if (payload.new.status === 'failed') {
            setPhase('error');
            supabase.removeChannel(channel);
          }
        })
        .subscribe();

      return {
        manifestUrl: manifest.manifestUrl,
        totalChunks: manifest.totalChunks,
        replayId: ingest.replay_id,
        streamUid: ingest.stream_uid,
        status: ingest.status === 'queued' ? 'queued' : 'processing',
      };
    } catch (err) {
      console.error('[useLiveRecording] finalize error:', err);
      setPhase('error');
      finalizingRef.current = false;
      return null;
    }
  }, [recordingId, sessionId, stop]);

  // Auto-start when tracks are ready
  useEffect(() => {
    if (autoStart && videoTrack && audioTrack && sessionId && recordingId && !startedRef.current && phase === 'idle') {
      startedRef.current = true;
      const timer = setTimeout(() => start(), 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart, videoTrack, audioTrack, sessionId, recordingId, phase, start]);

  // beforeunload warning while recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Cleanup on unmount �€” stop recorder + flush queue (best-effort)
  useEffect(() => {
    return () => {
      if (finalizingRef.current) return;
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        recorderRef.current.stop().catch(() => {});
      }
      // Flush remaining chunks to R2 (non-blocking, auto-finalize will handle manifest)
      if (queueRef.current) {
        queueRef.current.flush().catch(() => {});
      }
    };
  }, []);

  return {
    phase,
    setPhase,
    chunkCount,
    uploadStats,
    streamUploadProgress,
    replay,
    start,
    stop,
    finalize,
  };
}
