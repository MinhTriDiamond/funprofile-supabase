/**
 * Chunked MediaRecorder — records a MediaStream in fixed-duration chunks
 * and emits each chunk via a callback for progressive upload.
 */

export interface ChunkMeta {
  index: number;
  blob: Blob;
  mimeType: string;
  startTime: number;
  endTime: number;
}

export interface ChunkedRecorderOptions {
  stream: MediaStream;
  chunkDurationMs?: number;
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  onChunk: (chunk: ChunkMeta) => void;
  onError?: (error: Error) => void;
}

export interface ChunkedRecorderController {
  start: () => void;
  stop: () => Promise<Blob>;
  getState: () => RecordingState;
  getMimeType: () => string;
}

type RecordingState = 'inactive' | 'recording' | 'stopped';

function pickMimeType(preferred?: string): string {
  const candidates = [
    preferred,
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].filter(Boolean) as string[];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function createChunkedRecorder(options: ChunkedRecorderOptions): ChunkedRecorderController {
  const {
    stream,
    chunkDurationMs = 2000,
    onChunk,
    onError,
  } = options;

  const mimeType = pickMimeType(options.mimeType);
  let recorder: MediaRecorder | null = null;
  let state: RecordingState = 'inactive';
  let chunkIndex = 0;
  let chunkStartTime = 0;
  

  function start() {
    if (state !== 'inactive') return;

    recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: options.videoBitsPerSecond ?? 900_000,
      // Opus 128 kbps stereo — chuẩn streaming, rõ tiếng nói + nhạc nền
      audioBitsPerSecond: options.audioBitsPerSecond ?? 96_000,
    });

    state = 'recording';
    chunkIndex = 0;
    chunkStartTime = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const now = Date.now();
        const chunk: ChunkMeta = {
          index: chunkIndex++,
          blob: e.data,
          mimeType: mimeType || 'video/webm',
          startTime: chunkStartTime,
          endTime: now,
        };
        chunkStartTime = now;

        try {
          onChunk(chunk);
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    recorder.onerror = (e: any) => {
      onError?.(new Error(e?.error?.message || 'MediaRecorder error'));
    };

    recorder.start(chunkDurationMs);
  }

  async function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const emptyBlob = new Blob([], { type: mimeType || 'video/webm' });
      if (!recorder || state !== 'recording') {
        resolve(emptyBlob);
        return;
      }

      state = 'stopped';

      recorder.onstop = () => {
        resolve(emptyBlob);
      };
      recorder.stop();
    });
  }

  return {
    start,
    stop,
    getState: () => state,
    getMimeType: () => mimeType || 'video/webm',
  };
}
