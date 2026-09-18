import { useEffect, useRef } from 'react';
import type { DraftAttachment } from '@/modules/feed/types';

const DB_NAME = 'funprofile-post-composer';
const DB_VERSION = 1;
const STORE_NAME = 'post_drafts';
const DRAFT_KEY_PREFIX = 'draft_post';
const DIALOG_OPEN_KEY = 'draft_post_dialog_open';
const DEBOUNCE_MS = 1500;
const FLUSH_MS = 5000;

export interface DraftAttachmentSnapshot extends Omit<DraftAttachment, 'previewUrl'> {
  file?: File;
  previewUrl?: string;
}

export interface PostComposerDraft {
  id: string;
  userId: string;
  content: string;
  privacy: string;
  feeling: any | null;
  location: string | null;
  taggedFriends: any[];
  attachments: DraftAttachmentSnapshot[];
  composerMeta: {
    innerWorkToggle?: boolean;
    composeParam?: string | null;
    prefillParam?: string | null;
    storyMediaMode?: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export interface PostDraftData {
  content: string;
  privacy: string;
  feeling: any | null;
  location: string | null;
  taggedFriends: any[];
  attachments: DraftAttachment[];
  composerMeta?: PostComposerDraft['composerMeta'];
}

function draftKey(userId?: string | null) {
  return `${DRAFT_KEY_PREFIX}:${userId || 'anonymous'}`;
}

function stripAttachmentForStorage(attachment: DraftAttachment): DraftAttachmentSnapshot {
  const { previewUrl, ...rest } = attachment;
  return {
    ...rest,
    previewUrl: previewUrl?.startsWith('data:') ? previewUrl : undefined,
  };
}

function reviveAttachment(snapshot: DraftAttachmentSnapshot): DraftAttachment | null {
  const previewUrl = snapshot.file
    ? URL.createObjectURL(snapshot.file)
    : snapshot.previewUrl;

  if (!snapshot.file && !snapshot.fileUrl && !previewUrl) return null;

  return {
    ...snapshot,
    previewUrl,
    uploadStatus: snapshot.fileUrl ? snapshot.uploadStatus : 'local',
    progress: snapshot.fileUrl ? snapshot.progress : 0,
  };
}

function hasMeaningfulDraft(data: PostDraftData): boolean {
  return Boolean(
    data.content.trim()
    || data.attachments.length > 0
    || data.taggedFriends.length > 0
    || data.location
    || data.feeling
    || data.privacy !== 'public'
    || data.composerMeta?.innerWorkToggle
  );
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDraftDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function readLocalDraft(userId?: string | null): PostComposerDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as PostComposerDraft;
  } catch {
    return null;
  }
}

function writeLocalDraft(draft: PostComposerDraft) {
  try {
    const metadataOnly: PostComposerDraft = {
      ...draft,
      attachments: draft.attachments.map((attachment) => ({
        ...attachment,
        file: undefined,
        previewUrl: attachment.previewUrl?.startsWith('data:') ? attachment.previewUrl : undefined,
      })),
    };
    localStorage.setItem(draftKey(draft.userId), JSON.stringify(metadataOnly));
  } catch {
    // local fallback can fail in private mode; IndexedDB save may still succeed.
  }
}

async function writeIndexedDraft(draft: PostComposerDraft): Promise<boolean> {
  const db = await openDraftDb();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

async function readIndexedDraft(userId?: string | null): Promise<PostComposerDraft | null> {
  const db = await openDraftDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(draftKey(userId));
    request.onsuccess = () => resolve((request.result as PostComposerDraft | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function deleteIndexedDraft(userId?: string | null): Promise<void> {
  const db = await openDraftDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(draftKey(userId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function savePostDraftNow(data: PostDraftData, userId?: string | null): Promise<boolean> {
  if (!hasMeaningfulDraft(data)) {
    await clearPostDraft(userId);
    return true;
  }

  const now = Date.now();
  const existing = readLocalDraft(userId);
  const draft: PostComposerDraft = {
    id: draftKey(userId),
    userId: userId || 'anonymous',
    content: data.content,
    privacy: data.privacy,
    feeling: data.feeling,
    location: data.location,
    taggedFriends: data.taggedFriends,
    attachments: data.attachments.map(stripAttachmentForStorage),
    composerMeta: data.composerMeta || {},
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  writeLocalDraft(draft);
  return writeIndexedDraft(draft);
}

export async function getPostDraft(userId?: string | null): Promise<PostComposerDraft | null> {
  return (await readIndexedDraft(userId)) || readLocalDraft(userId);
}

export function restoreDraftAttachments(draft: PostComposerDraft): DraftAttachment[] {
  return draft.attachments
    .map(reviveAttachment)
    .filter((attachment): attachment is DraftAttachment => Boolean(attachment))
    .map((attachment, index) => ({ ...attachment, sortOrder: index }));
}

export async function clearPostDraft(userId?: string | null): Promise<void> {
  try {
    localStorage.removeItem(draftKey(userId));
    sessionStorage.removeItem(DIALOG_OPEN_KEY);
  } catch {
    // noop
  }
  await deleteIndexedDraft(userId);
}

export async function hasDraft(userId?: string | null): Promise<boolean> {
  return (await getPostDraft(userId)) !== null;
}

export function setDialogOpenState(open: boolean) {
  try {
    if (open) {
      sessionStorage.setItem(DIALOG_OPEN_KEY, '1');
    } else {
      sessionStorage.removeItem(DIALOG_OPEN_KEY);
    }
  } catch {
    // noop
  }
}

export function getDialogOpenState(): boolean {
  try {
    return sessionStorage.getItem(DIALOG_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function usePostDraftAutoSave(data: PostDraftData, isReady = true, userId?: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const latestRef = useRef(data);

  useEffect(() => {
    latestRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!isReady) return;

    if (!hasMeaningfulDraft(data)) {
      clearPostDraft(userId).catch(() => null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      savePostDraftNow(latestRef.current, userId).catch(() => null);
    }, DEBOUNCE_MS);

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      savePostDraftNow(latestRef.current, userId).catch(() => null);
    }, FLUSH_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [
    data.content,
    data.privacy,
    data.feeling,
    data.location,
    data.taggedFriends,
    data.attachments,
    data.composerMeta,
    isReady,
    userId,
  ]);
}
