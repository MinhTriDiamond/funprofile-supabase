/**
 * Upload Queue Manager
 * Manages parallel uploads with progress tracking, pause/resume, and cancel support
 */

import { uploadToR2 } from './r2Upload';
import { compressImage, FILE_LIMITS } from './imageCompression';
import { MEDIA_LIMITS } from '@/config/uploadLimits';

export type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
  status: UploadStatus;
  progress: number; // 0-100
  error?: string;
  url?: string;
  key?: string;
  bytesUploaded?: number;
  bytesTotal?: number;
  uploadSpeed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface UploadQueueOptions {
  maxConcurrent?: number; // Max parallel uploads (default: 4)
  maxFiles?: number; // Max files allowed (default: 100)
  onProgress?: (item: UploadItem) => void;
  onComplete?: (item: UploadItem) => void;
  onError?: (item: UploadItem, error: Error) => void;
  onQueueComplete?: (items: UploadItem[]) => void;
  accessToken?: string;
}

const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_FILES = MEDIA_LIMITS.maxTotalMediaPerPost;

export class UploadQueue {
  private items: Map<string, UploadItem> = new Map();
  private activeUploads: Set<string> = new Set();
  private options: UploadQueueOptions;
  private abortControllers: Map<string, AbortController> = new Map();
  private isPaused: boolean = false;
  private listeners: Set<(items: UploadItem[]) => void> = new Set();

  constructor(options: UploadQueueOptions = {}) {
    this.options = {
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      maxFiles: DEFAULT_MAX_FILES,
      ...options,
    };
  }

  /**
   * Add files to the upload queue
   */
  async addFiles(files: File[], accessToken?: string): Promise<{ added: UploadItem[]; rejected: { file: File; reason: string }[] }> {
    const added: UploadItem[] = [];
    const rejected: { file: File; reason: string }[] = [];

    const currentCount = this.items.size;
    const maxFiles = this.options.maxFiles || DEFAULT_MAX_FILES;

    for (const file of files) {
      // Check max files limit
      if (currentCount + added.length >= maxFiles) {
        rejected.push({ file, reason: `Đã đạt giới hạn ${maxFiles} file` });
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      // Validate file type
      if (!isImage && !isVideo) {
        rejected.push({ file, reason: 'Loại file không được hỗ trợ' });
        continue;
      }

      // Validate file size
      if (isImage && file.size > FILE_LIMITS.IMAGE_MAX_SIZE) {
        rejected.push({ file, reason: 'Ảnh phải nhỏ hơn 100MB' });
        continue;
      }

      if (isVideo && file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
        const gb = Math.round(FILE_LIMITS.VIDEO_MAX_SIZE / (1024 * 1024 * 1024));
        rejected.push({ file, reason: `Video phải nhỏ hơn ${gb}GB` });
        continue;
      }

      // Create upload item
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const item: UploadItem = {
        id,
        file,
        preview: URL.createObjectURL(file),
        type: isImage ? 'image' : 'video',
        status: 'queued',
        progress: 0,
        bytesTotal: file.size,
        bytesUploaded: 0,
      };

      this.items.set(id, item);
      added.push(item);
    }

    // Store access token for later use
    if (accessToken) {
      this.options.accessToken = accessToken;
    }

    // Notify listeners
    this.notifyListeners();

    // Start processing queue
    this.processQueue();

    return { added, rejected };
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused) return;

    const maxConcurrent = this.options.maxConcurrent || DEFAULT_MAX_CONCURRENT;

    // Get queued items
    const queuedItems = Array.from(this.items.values())
      .filter(item => item.status === 'queued');

    // Start uploads up to max concurrent
    for (const item of queuedItems) {
      if (this.activeUploads.size >= maxConcurrent) break;
      if (item.type === 'video') continue; // Videos handled separately by TUS

      this.uploadItem(item);
    }
  }

  /**
   * Upload a single item
   */
  private async uploadItem(item: UploadItem): Promise<void> {
    const id = item.id;
    this.activeUploads.add(id);

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(id, abortController);

    // Update status
    this.updateItem(id, { status: 'uploading', progress: 0 });

    const startTime = Date.now();
    let lastBytesUploaded = 0;
    let lastUpdateTime = startTime;

    try {
      let processedFile = item.file;

      // Compress images before upload
      if (item.type === 'image') {
        this.updateItem(id, { progress: 5 }); // Show some progress during compression
        processedFile = await compressImage(item.file, {
          maxWidth: FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
          maxHeight: FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
          quality: 0.85,
        });
        this.updateItem(id, { progress: 15 }); // Compression done
      }

      // Upload to R2
      const result = await uploadToR2(
        processedFile,
        'posts',
        undefined,
        this.options.accessToken
      );

      // Update with result
      this.updateItem(id, {
        status: 'completed',
        progress: 100,
        url: result.url,
        key: result.key,
        bytesUploaded: processedFile.size,
      });

      this.options.onComplete?.(this.items.get(id)!);
    } catch (error: unknown) {
      const errName = (error as { name?: string })?.name;
      if (errName === 'AbortError' || item.status === 'cancelled') {
        this.updateItem(id, { status: 'cancelled' });
      } else {
        this.updateItem(id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Upload thất bại',
        });
        this.options.onError?.(this.items.get(id)!, error as Error);
      }
    } finally {
      this.activeUploads.delete(id);
      this.abortControllers.delete(id);

      // Check if all uploads complete
      this.checkQueueComplete();

      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Update an item and notify listeners
   */
  private updateItem(id: string, updates: Partial<UploadItem>): void {
    const item = this.items.get(id);
    if (!item) return;

    const updated = { ...item, ...updates };
    this.items.set(id, updated);

    this.options.onProgress?.(updated);
    this.notifyListeners();
  }

  /**
   * Check if all uploads are complete
   */
  private checkQueueComplete(): void {
    const allItems = Array.from(this.items.values());
    const pendingItems = allItems.filter(
      item => item.status === 'queued' || item.status === 'uploading'
    );

    if (pendingItems.length === 0 && allItems.length > 0) {
      this.options.onQueueComplete?.(allItems);
    }
  }

  /**
   * Cancel a specific upload
   */
  cancelUpload(id: string): void {
    const item = this.items.get(id);
    if (!item) return;

    if (item.status === 'uploading') {
      const controller = this.abortControllers.get(id);
      controller?.abort();
    }

    // Revoke preview URL
    URL.revokeObjectURL(item.preview);
    this.items.delete(id);
    this.notifyListeners();
  }

  /**
   * Remove an item (cancel if uploading)
   */
  removeItem(id: string): void {
    this.cancelUpload(id);
  }

  /**
   * Retry a failed upload
   */
  retryUpload(id: string): void {
    const item = this.items.get(id);
    if (!item || item.status !== 'failed') return;

    this.updateItem(id, { status: 'queued', progress: 0, error: undefined });
    this.processQueue();
  }

  /**
   * Pause all uploads
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume all uploads
   */
  resume(): void {
    this.isPaused = false;
    this.processQueue();
  }

  /**
   * Cancel all uploads
   */
  cancelAll(): void {
    for (const [id] of this.items) {
      this.cancelUpload(id);
    }
  }

  /**
   * Clear completed/failed items
   */
  clearCompleted(): void {
    for (const [id, item] of this.items) {
      if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
        URL.revokeObjectURL(item.preview);
        this.items.delete(id);
      }
    }
    this.notifyListeners();
  }

  /**
   * Get all items
   */
  getItems(): UploadItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get item by ID
   */
  getItem(id: string): UploadItem | undefined {
    return this.items.get(id);
  }

  /**
   * Get upload statistics
   */
  getStats(): {
    total: number;
    completed: number;
    failed: number;
    uploading: number;
    queued: number;
    overallProgress: number;
  } {
    const items = Array.from(this.items.values());
    const completed = items.filter(i => i.status === 'completed').length;
    const failed = items.filter(i => i.status === 'failed').length;
    const uploading = items.filter(i => i.status === 'uploading').length;
    const queued = items.filter(i => i.status === 'queued').length;

    const overallProgress = items.length > 0
      ? items.reduce((sum, item) => sum + item.progress, 0) / items.length
      : 0;

    return {
      total: items.length,
      completed,
      failed,
      uploading,
      queued,
      overallProgress,
    };
  }

  /**
   * Subscribe to changes
   */
  subscribe(listener: (items: UploadItem[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const items = this.getItems();
    this.listeners.forEach(listener => listener(items));
  }

  /**
   * Reorder items
   */
  reorderItems(fromIndex: number, toIndex: number): void {
    const items = this.getItems();
    const [movedItem] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, movedItem);

    // Rebuild map in new order
    this.items.clear();
    items.forEach(item => this.items.set(item.id, item));
    this.notifyListeners();
  }

  /**
   * Get completed URLs in order
   */
  getCompletedUrls(): Array<{ url: string; type: 'image' | 'video' }> {
    return this.getItems()
      .filter(item => item.status === 'completed' && item.url)
      .map(item => ({
        url: item.url!,
        type: item.type,
      }));
  }

  /**
   * Check if any uploads are in progress
   */
  isUploading(): boolean {
    return this.activeUploads.size > 0;
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.cancelAll();
    this.listeners.clear();
  }
}

/**
 * Create a new upload queue instance
 */
export function createUploadQueue(options?: UploadQueueOptions): UploadQueue {
  return new UploadQueue(options);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format seconds to mm:ss or hh:mm:ss
 */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
