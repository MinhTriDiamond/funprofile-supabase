/**
 * Feed module types - DraftAttachment, PostAttachment
 */

export interface DraftAttachment {
  id: string;
  kind: 'image' | 'video';
  /** Local file reference before upload */
  file?: File;
  /** blob: or data: preview URL */
  previewUrl?: string;
  /** Remote URL after upload */
  fileUrl?: string;
  /** Optional video thumbnail */
  thumbnailUrl?: string;
  /** R2 storage key */
  storageKey?: string;
  width?: number;
  height?: number;
  duration?: number;
  sizeBytes: number;
  mimeType: string;
  uploadStatus: 'local' | 'uploading' | 'uploaded' | 'error';
  progress?: number;
  error?: string;
  sortOrder: number;
  source: 'picker' | 'paste' | 'drop';
  altText: string;
  transformMeta?: Record<string, unknown> | null;
}

export interface PostAttachment {
  id: string;
  post_id: string;
  file_url: string;
  storage_key: string | null;
  file_type: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  sort_order: number;
  alt_text: string | null;
  transform_meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AttachmentPayload {
  file_url: string;
  storage_key: string | null;
  file_type: 'image' | 'video';
  mime_type: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  size_bytes?: number | null;
  sort_order: number;
  alt_text?: string | null;
  transform_meta?: Record<string, unknown> | null;
}

export interface TaggedFriend {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
}
