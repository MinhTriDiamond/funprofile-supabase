/**
 * ChunkedVideoPlayer
 * Production-safe MSE streaming player with:
 * - Adaptive windowed buffering (30-60s based on network speed)
 * - LRU chunk cache with byte cap (80MB desktop / 30MB mobile)
 * - Background prefetch up to 3 min ahead
 * - Seek prioritization with cache hit detection
 * - Debounced buffering indicator + progress bar
 * - Robust error handling with retry button
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { SocialVideoPlayer } from '@/components/ui/SocialVideoPlayer';
import logger from '@/lib/logger';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ManifestChunk {
  seq: number;
  key: string;
  url: string;
  bytes: number;
  duration_ms: number;
}

interface Manifest {
  recording_id: string;
  version: number;
  codec: string;
  mime_type: string;
  total_duration_ms: number;
  chunks: ManifestChunk[];
}

interface ChunkedVideoPlayerProps {
  manifestUrl: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  onReady?: () => void;
  onError?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_RETRY = 3;
const BUFFER_AHEAD_FAST_S = 60;
const BUFFER_AHEAD_SLOW_S = 30;
const BUFFER_BEHIND_S = 15;
const PREFETCH_CONCURRENCY = 5;
const PREFETCH_HORIZON_S = 180;
const PREFETCH_INTERVAL_MS = 2000;
const APPEND_POLL_MS = 1000;
const BUFFERING_DEBOUNCE_MS = 300;
const MAX_SB_ERRORS = 3;
const MAX_FAILED_CHUNKS = 3;
const SLOW_NETWORK_BPS = 500 * 1024; // 500 KB/s

/* --- R2 URL normalizer: rewrite legacy pub-*.r2.dev → media.fun.rich --- */
const R2_DEV_PATTERN = /https:\/\/pub-[a-f0-9]+\.r2\.dev/g;
const R2_CUSTOM_DOMAIN = 'https://media.fun.rich';

function normalizeR2Url(url: string): string {
  return url.replace(R2_DEV_PATTERN, R2_CUSTOM_DOMAIN);
}

const IS_MOBILE = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const IS_SAFARI = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const MAX_CACHE_BYTES = IS_MOBILE ? 30 * 1024 * 1024 : 80 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  LRU Chunk Cache                                                    */
/* ------------------------------------------------------------------ */

class ChunkCache {
  private data = new Map<number, ArrayBuffer>();
  private accessOrder: number[] = [];
  private _totalBytes = 0;
  private maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get totalBytes() { return this._totalBytes; }
  get size() { return this.data.size; }

  has(seq: number): boolean { return this.data.has(seq); }

  get(seq: number): ArrayBuffer | undefined {
    const buf = this.data.get(seq);
    if (buf) this.touch(seq);
    return buf;
  }

  set(seq: number, buf: ArrayBuffer, currentSeq = 0): void {
    if (this.data.has(seq)) return;
    this._totalBytes += buf.byteLength;
    this.data.set(seq, buf);
    this.accessOrder.push(seq);
    // Evict if over budget
    while (this._totalBytes > this.maxBytes && this.data.size > 1) {
      this.evictFarthest(currentSeq);
    }
  }

  private touch(seq: number) {
    const idx = this.accessOrder.indexOf(seq);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(seq);
    }
  }

  private evictFarthest(currentSeq: number) {
    if (this.accessOrder.length === 0) return;
    // Find the chunk farthest from currentSeq
    let farthestIdx = 0;
    let farthestDist = -1;
    for (let i = 0; i < this.accessOrder.length; i++) {
      const dist = Math.abs(this.accessOrder[i] - currentSeq);
      if (dist > farthestDist) {
        farthestDist = dist;
        farthestIdx = i;
      }
    }
    const evictSeq = this.accessOrder[farthestIdx];
    this.accessOrder.splice(farthestIdx, 1);
    const buf = this.data.get(evictSeq);
    if (buf) this._totalBytes -= buf.byteLength;
    this.data.delete(evictSeq);
  }

  clear() {
    this.data.clear();
    this.accessOrder = [];
    this._totalBytes = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function fetchWithRetry(url: string, retries = MAX_RETRY, signal?: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

function buildMimeType(manifest: Manifest): string {
  const mt = manifest.mime_type ?? 'video/webm';
  if (/codecs\s*=/i.test(mt)) return mt;
  if (manifest.codec) return `${mt}; codecs="${manifest.codec}"`;
  return mt;
}

/** Try multiple MIME candidates to find one MSE supports */
function findSupportedMime(manifest: Manifest): string | null {
  const base = manifest.mime_type || 'video/webm';
  const codec = manifest.codec || '';
  const candidates: string[] = [];

  // Original from manifest
  if (codec) candidates.push(`${base}; codecs="${codec}"`);
  // Try common WebM codec variants
  if (!/vp9/i.test(codec)) candidates.push(`${base}; codecs="vp9,opus"`);
  if (!/vp8/i.test(codec)) candidates.push(`${base}; codecs="vp8,opus"`);
  candidates.push(`${base}; codecs="vp9"`);
  candidates.push(`${base}; codecs="vp8"`);
  // Generic fallback
  candidates.push(base);

  for (const mime of candidates) {
    if (MediaSource.isTypeSupported(mime)) return mime;
  }
  return null;
}

function buildTimeMap(chunks: ManifestChunk[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const c of chunks) {
    offsets.push(acc);
    acc += c.duration_ms / 1000;
  }
  return offsets;
}

function chunkIndexForTime(timeS: number, offsets: number[]): number {
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (timeS >= offsets[i]) return i;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChunkedVideoPlayer({
  manifestUrl,
  className = '',
  autoPlay = false,
  controls = true,
  onReady,
  onError: onErrorCallback,
}: ChunkedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [bufferingDebounced, setBufferingDebounced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---- MSE path ---- */
  const loadWithMSE = useCallback(async (manifest: Manifest, onFallback: () => void) => {
    const video = videoRef.current;
    if (!video) return;

    const mediaSource = new MediaSource();
    const msUrl = URL.createObjectURL(mediaSource);
    video.src = msUrl;

    await new Promise<void>(resolve => {
      mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
    });

    const mimeWithCodec = findSupportedMime(manifest) || buildMimeType(manifest);
    logger.debug('[ChunkedVideoPlayer] Using MIME:', mimeWithCodec);
    const sourceBuffer = mediaSource.addSourceBuffer(mimeWithCodec);

    const totalDurationSec = manifest.total_duration_ms / 1000;
    if (totalDurationSec > 0 && isFinite(totalDurationSec)) {
      try { mediaSource.duration = totalDurationSec; } catch { /* mediaSource may be closed — safe to ignore */ }
    }

    const offsets = buildTimeMap(manifest.chunks);
    const totalChunks = manifest.chunks.length;
    const cache = new ChunkCache(MAX_CACHE_BYTES);

    // Mutable state
    const fetched = new Set<number>();
    const fetching = new Set<number>();
    const failedChunks = new Set<number>();
    let nextAppendSeq = 0;
    let destroyed = false;
    let firstChunkAppended = false;
    let sbErrorCount = 0;
    let appending = false;
    let bufferAheadS = BUFFER_AHEAD_FAST_S;
    let seekGeneration = 0;
    let bufferingTimer: ReturnType<typeof setTimeout> | null = null;

    // Network speed estimation
    const speedSamples: number[] = [];
    const estimateSpeed = (bytes: number, ms: number) => {
      if (ms <= 0) return;
      const bps = (bytes / ms) * 1000;
      speedSamples.push(bps);
      if (speedSamples.length > 5) speedSamples.shift();
      const avg = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
      bufferAheadS = avg < SLOW_NETWORK_BPS ? BUFFER_AHEAD_SLOW_S : BUFFER_AHEAD_FAST_S;
    };

    const updateProgress = () => {
      setLoadProgress(fetched.size / totalChunks);
    };

    /* --- Ordered append from cache --- */
    const processQueue = () => {
      if (appending || destroyed) return;
      if (mediaSource.readyState !== 'open') return;

      // Skip failed chunks
      while (failedChunks.has(nextAppendSeq) && nextAppendSeq < totalChunks) {
        nextAppendSeq++;
      }
      if (nextAppendSeq >= totalChunks) return;

      const data = cache.get(nextAppendSeq);
      if (!data) return;

      appending = true;
      try {
        sourceBuffer.appendBuffer(data);
      } catch (e: unknown) {
        appending = false;
        if ((e as { name?: string })?.name === 'QuotaExceededError') {
          console.warn('[ChunkedVideoPlayer] QuotaExceeded → evicting');
          evictOldBuffer().then(() => processQueue());
        } else {
          sbErrorCount++;
          console.error('[ChunkedVideoPlayer] appendBuffer error:', e, `(count ${sbErrorCount})`);
          if (!firstChunkAppended) {
            console.warn('[ChunkedVideoPlayer] First chunk failed → immediate blob fallback');
            onFallback();
            return;
          }
          nextAppendSeq++;
          if (sbErrorCount >= MAX_SB_ERRORS) {
            console.warn('[ChunkedVideoPlayer] Too many SB errors → blob fallback');
            onFallback();
          } else {
            processQueue();
          }
        }
      }
    };

    sourceBuffer.addEventListener('updateend', () => {
      appending = false;
      nextAppendSeq++;

      if (!firstChunkAppended) {
        firstChunkAppended = true;
        setLoading(false);
        onReady?.();
        if (autoPlay) video.play().catch(() => {});
      }

      processQueue();
    });

    sourceBuffer.addEventListener('error', () => {
      sbErrorCount++;
      appending = false;
      console.error('[ChunkedVideoPlayer] SourceBuffer error event', `(count ${sbErrorCount})`);
      if (!firstChunkAppended) {
        console.warn('[ChunkedVideoPlayer] First chunk SB error → immediate blob fallback');
        onFallback();
        return;
      }
      nextAppendSeq++;
      if (sbErrorCount >= MAX_SB_ERRORS) {
        onFallback();
      } else {
        processQueue();
      }
    });

    /* --- Buffer eviction --- */
    const evictOldBuffer = (): Promise<void> => {
      return new Promise(resolve => {
        if (sourceBuffer.updating || mediaSource.readyState !== 'open') { resolve(); return; }
        const removeEnd = video.currentTime - BUFFER_BEHIND_S;
        if (removeEnd <= 0 || sourceBuffer.buffered.length === 0) { resolve(); return; }
        const bufStart = sourceBuffer.buffered.start(0);
        if (bufStart >= removeEnd) { resolve(); return; }
        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
        try { sourceBuffer.remove(bufStart, removeEnd); } catch { /* buffer busy — resolve immediately */ resolve(); }
      });
    };

    /* --- Fetch a chunk → store in cache --- */
    const loadChunk = async (idx: number, gen?: number): Promise<boolean> => {
      if (destroyed || fetched.has(idx) || fetching.has(idx) || failedChunks.has(idx)) return false;
      if (idx < 0 || idx >= totalChunks) return false;
      fetching.add(idx);
      const t0 = performance.now();
      try {
        const data = await fetchWithRetry(manifest.chunks[idx].url, MAX_RETRY, abortRef.current?.signal);
        if (destroyed || (gen !== undefined && gen !== seekGeneration)) return false;
        const elapsed = performance.now() - t0;
        estimateSpeed(data.byteLength, elapsed);
        fetched.add(idx);
        cache.set(idx, data, chunkIndexForTime(video.currentTime, offsets));
        updateProgress();
        processQueue();
        return true;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return false;
        console.error(`[ChunkedVideoPlayer] Failed chunk ${idx} (${manifest.chunks[idx].url}):`, err);
        failedChunks.add(idx);
        updateProgress();
        if (failedChunks.size > MAX_FAILED_CHUNKS) {
          setError('Không thể tải video. Một số phân đoạn bị lỗi.');
          onErrorCallback?.();
        }
        // Skip in append queue if it's the one we're waiting on
        if (idx === nextAppendSeq) {
          nextAppendSeq++;
          processQueue();
        }
        return false;
      } finally {
        fetching.delete(idx);
      }
    };

    /* --- Concurrency-limited batch fetch --- */
    const fetchBatch = async (indices: number[], gen?: number) => {
      const queue = [...indices];
      const run = async () => {
        while (queue.length > 0) {
          if (destroyed || (gen !== undefined && gen !== seekGeneration)) return;
          const idx = queue.shift()!;
          await loadChunk(idx, gen);
        }
      };
      const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, () => run());
      await Promise.all(workers);
    };

    /* --- Tier 1: Append window (immediate playback) --- */
    const ensureAppendWindow = async () => {
      if (destroyed || mediaSource.readyState !== 'open') return;
      await evictOldBuffer();
      const ct = video.currentTime;
      const startIdx = Math.min(nextAppendSeq, chunkIndexForTime(ct, offsets));
      const endTime = ct + bufferAheadS;
      const endIdx = Math.min(chunkIndexForTime(endTime, offsets) + 1, totalChunks - 1);
      const needed: number[] = [];
      for (let i = startIdx; i <= endIdx; i++) {
        if (!fetched.has(i) && !fetching.has(i) && !failedChunks.has(i)) needed.push(i);
      }
      if (needed.length > 0) await fetchBatch(needed);
    };

    /* --- Tier 2: Background prefetch into cache only --- */
    const backgroundPrefetch = async (gen: number) => {
      if (destroyed || gen !== seekGeneration) return;
      const ct = video.currentTime;
      const windowEnd = ct + bufferAheadS;
      const horizonEnd = ct + PREFETCH_HORIZON_S;
      const startIdx = chunkIndexForTime(windowEnd, offsets) + 1;
      const endIdx = Math.min(chunkIndexForTime(horizonEnd, offsets) + 1, totalChunks - 1);
      const needed: number[] = [];
      for (let i = startIdx; i <= endIdx; i++) {
        if (!fetched.has(i) && !fetching.has(i) && !failedChunks.has(i)) {
          if (cache.totalBytes >= MAX_CACHE_BYTES) break;
          needed.push(i);
        }
      }
      if (needed.length > 0) await fetchBatch(needed, gen);
    };

    /* --- Seek handler --- */
    const onSeeked = async () => {
      if (destroyed) return;
      seekGeneration++;
      const gen = seekGeneration;
      const ct = video.currentTime;
      const targetIdx = chunkIndexForTime(ct, offsets);

      // Priority: target ±2
      const priorityIndices: number[] = [];
      for (let i = Math.max(0, targetIdx - 2); i <= Math.min(totalChunks - 1, targetIdx + 2); i++) {
        if (!fetched.has(i) && !failedChunks.has(i)) priorityIndices.push(i);
      }

      // If target is cached, clear buffering immediately
      if (cache.has(targetIdx)) {
        clearBufferingTimer();
        setBufferingDebounced(false);
      }

      if (priorityIndices.length > 0) {
        await fetchBatch(priorityIndices, gen);
      }

      // Resume normal flow
      if (gen === seekGeneration) {
        await ensureAppendWindow();
      }
    };

    /* --- Buffering debounce --- */
    const clearBufferingTimer = () => {
      if (bufferingTimer) { clearTimeout(bufferingTimer); bufferingTimer = null; }
    };

    const onWaiting = () => {
      clearBufferingTimer();
      bufferingTimer = setTimeout(() => {
        if (!destroyed) setBufferingDebounced(true);
      }, BUFFERING_DEBOUNCE_MS);
    };

    const onCanPlay = () => { clearBufferingTimer(); setBufferingDebounced(false); };
    const onPlaying = () => { clearBufferingTimer(); setBufferingDebounced(false); };
    const onTimeUpdate = () => { clearBufferingTimer(); setBufferingDebounced(false); };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);

    // Initial load
    await ensureAppendWindow();

    // Polling for append window
    const appendPollId = setInterval(() => {
      if (!destroyed) ensureAppendWindow();
    }, APPEND_POLL_MS);

    // Background prefetch on slower interval
    const prefetchPollId = setInterval(() => {
      if (!destroyed) backgroundPrefetch(seekGeneration);
    }, PREFETCH_INTERVAL_MS);

    // End-of-stream check
    const checkEndId = setInterval(() => {
      if (destroyed) return;
      const allFetchedOrFailed = fetched.size + failedChunks.size >= totalChunks;
      if (allFetchedOrFailed && !sourceBuffer.updating && nextAppendSeq >= totalChunks) {
        if (mediaSource.readyState === 'open') {
          try { mediaSource.endOfStream(); } catch { /* mediaSource already closed — safe to ignore */ }
        }
        clearInterval(checkEndId);
      }
    }, 2000);

    cleanupRef.current = () => {
      destroyed = true;
      clearBufferingTimer();
      clearInterval(appendPollId);
      clearInterval(prefetchPollId);
      clearInterval(checkEndId);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      cache.clear();
      URL.revokeObjectURL(msUrl);
    };
  }, [autoPlay, onReady, onErrorCallback]);

  /* ---- Blob fallback (progressive: play after first chunk) ---- */
  const loadWithBlob = useCallback(async (manifest: Manifest) => {
    const video = videoRef.current;
    if (!video) return;

    cleanupRef.current?.();
    cleanupRef.current = null;

    setLoading(true);
    setLoadProgress(0);
    const mimeType = manifest.mime_type || 'video/webm';
    const sorted = [...manifest.chunks].sort((a, b) => a.seq - b.seq);
    const allBuffers: ArrayBuffer[] = [];
    let partialUrl: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      if (abortRef.current?.signal.aborted) return;
      const data = await fetchWithRetry(sorted[i].url, MAX_RETRY, abortRef.current?.signal);
      allBuffers.push(data);
      setLoadProgress((i + 1) / sorted.length);

      // After first chunk: create partial blob and start showing video immediately
      if (i === 0) {
        const partialBlob = new Blob([data], { type: mimeType });
        partialUrl = URL.createObjectURL(partialBlob);
        video.src = partialUrl;
        video.load();
        setLoading(false);
        onReady?.();
        // Don't autoplay yet — let user see controls and press play
      }
    }

    // All chunks loaded: create full blob and seamlessly replace src
    const currentTime = video.currentTime;
    const wasPaused = video.paused;
    if (partialUrl) URL.revokeObjectURL(partialUrl);

    const fullBlob = new Blob(allBuffers.map(b => new Blob([b])), { type: mimeType });
    const fullUrl = URL.createObjectURL(fullBlob);
    video.src = fullUrl;
    video.load();

    // Restore playback position
    video.addEventListener('loadedmetadata', () => {
      if (currentTime > 0) video.currentTime = currentTime;
      if (!wasPaused) video.play().catch(() => {});
    }, { once: true });

    cleanupRef.current = () => URL.revokeObjectURL(fullUrl);
  }, [onReady]);

  /* ---- Entry point ---- */
  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadProgress(0);
    setBufferingDebounced(false);
    abortRef.current = new AbortController();

    try {
      const normalizedManifestUrl = normalizeR2Url(manifestUrl);
      const res = await fetch(normalizedManifestUrl);
      if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
      const manifest: Manifest = await res.json();
      if (!manifest.chunks?.length) throw new Error('No chunks in manifest');

      // Normalize all chunk URLs to use custom domain
      manifest.chunks = manifest.chunks.map(c => ({ ...c, url: normalizeR2Url(c.url) }));
      manifest.chunks.sort((a, b) => a.seq - b.seq);

      // Safari/iOS: skip MSE entirely (no WebM MSE support) → direct blob fallback
      const skipMSE = IS_SAFARI || IS_IOS;
      const supportedMime = !skipMSE && typeof MediaSource !== 'undefined' ? findSupportedMime(manifest) : null;
      const useMSE = !!supportedMime;

      if (useMSE) {
        await loadWithMSE(manifest, () => {
          console.warn('[ChunkedVideoPlayer] Falling back to blob concatenation');
          loadWithBlob(manifest);
        });
      } else {
        if (skipMSE) {
          console.info('[ChunkedVideoPlayer] Safari/iOS detected → direct blob fallback');
        } else {
          console.warn('[ChunkedVideoPlayer] MSE not supported → blob fallback');
        }
        await loadWithBlob(manifest);
      }
    } catch (err: unknown) {
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load video');
      setLoading(false);
      onErrorCallback?.();
    }
  }, [manifestUrl, loadWithMSE, loadWithBlob, onErrorCallback]);

  useEffect(() => {
    start();
    return () => {
      abortRef.current?.abort();
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [start]);

  /* ---- Render ---- */
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-black/90 text-white/70 text-sm p-4 ${className}`}>
        <span>⚠️ {error}</span>
        <button
          onClick={() => { setError(null); start(); }}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <SocialVideoPlayer
      videoRef={videoRef as React.RefObject<HTMLVideoElement>}
      showControls={controls}
      className={className}
    >
      <div className="relative w-full h-full">
        {/* Initial loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            <span className="text-white/60 text-sm">Đang tải video...</span>
            <div className="w-3/4 max-w-xs">
              <Progress value={loadProgress * 100} className="h-1.5 bg-white/20" />
            </div>
            <span className="text-white/40 text-xs">{Math.round(loadProgress * 100)}%</span>
          </div>
        )}

        {/* Background loading progress bar (video visible but still loading remaining chunks) */}
        {!loading && loadProgress > 0 && loadProgress < 1 && (
          <div className="absolute top-0 left-0 right-0 z-10">
            <Progress value={loadProgress * 100} className="h-1 bg-white/10 rounded-none" />
          </div>
        )}

        {/* Buffering stall (debounced) — only when not in initial loading */}
        {!loading && bufferingDebounced && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain"
        />
      </div>
    </SocialVideoPlayer>
  );
}

export default ChunkedVideoPlayer;
