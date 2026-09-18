/**
 * Progressive chunk upload queue with retry, offline awareness, and concurrency.
 * Chunks are uploaded to R2 via presigned URL or direct upload.
 */

import type { ChunkMeta } from './chunkedRecorder';

export interface ChunkUploadQueueOptions {
  sessionId: string;
  maxRetries?: number;
  /** Số chunk upload song song (default 4) */
  concurrency?: number;
  onProgress?: (uploaded: number, total: number) => void;
  onError?: (error: Error, chunk: ChunkMeta) => void;
  uploadFn: (chunk: ChunkMeta, sessionId: string) => Promise<string>;
}

interface QueueItem {
  chunk: ChunkMeta;
  retries: number;
  url?: string;
}

export interface ChunkUploadQueueController {
  enqueue: (chunk: ChunkMeta) => void;
  flush: () => Promise<string[]>;
  getUploadedUrls: () => string[];
  getStats: () => { total: number; uploaded: number; failed: number };
}

export function createChunkUploadQueue(options: ChunkUploadQueueOptions): ChunkUploadQueueController {
  const {
    sessionId,
    maxRetries = 3,
    concurrency = 4,
    onProgress,
    onError,
    uploadFn,
  } = options;

  const queue: QueueItem[] = [];
  const uploadedUrls: string[] = [];
  let totalEnqueued = 0;
  let totalUploaded = 0;
  let totalFailed = 0;
  let activeWorkers = 0;

  async function waitOnline() {
    if (typeof navigator === 'undefined' || navigator.onLine) return;
    await new Promise<void>((resolve) => {
      const handler = () => {
        window.removeEventListener('online', handler);
        resolve();
      };
      window.addEventListener('online', handler);
    });
  }

  async function processItem(item: QueueItem) {
    while (true) {
      await waitOnline();
      try {
        const url = await uploadFn(item.chunk, sessionId);
        item.url = url;
        uploadedUrls.push(url);
        totalUploaded++;
        onProgress?.(totalUploaded, totalEnqueued);
        return;
      } catch (err) {
        item.retries++;
        if (item.retries >= maxRetries) {
          totalFailed++;
          onError?.(err instanceof Error ? err : new Error(String(err)), item.chunk);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, item.retries - 1)));
      }
    }
  }

  function pump() {
    while (activeWorkers < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      activeWorkers++;
      processItem(item).finally(() => {
        activeWorkers--;
        pump();
      });
    }
  }

  function enqueue(chunk: ChunkMeta) {
    totalEnqueued++;
    queue.push({ chunk, retries: 0 });
    pump();
  }

  async function flush(): Promise<string[]> {
    while (queue.length > 0 || activeWorkers > 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return [...uploadedUrls];
  }

  return {
    enqueue,
    flush,
    getUploadedUrls: () => [...uploadedUrls],
    getStats: () => ({ total: totalEnqueued, uploaded: totalUploaded, failed: totalFailed }),
  };
}
