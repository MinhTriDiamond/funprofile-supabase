/**
 * Crash Recovery Manager — backs up recording state to IndexedDB
 * so that if the browser crashes, we can finalize uploaded chunks later.
 */

const DB_NAME = 'live_recording_backup';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

export interface SessionBackup {
  sessionId: string;
  chunkKeys: string[];
  chunks?: Blob[];
  mimeType: string;
  startedAt: number;
  lastUpdatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initRecoverySession(
  sessionId: string,
  mimeType: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const backup: SessionBackup = {
    sessionId,
    chunkKeys: [],
    chunks: [],
    mimeType,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
  };
  store.put(backup);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveChunkBlob(
  sessionId: string,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<SessionBackup | undefined>((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result as SessionBackup | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    existing.chunks = [...(existing.chunks || []), blob];
    existing.lastUpdatedAt = Date.now();
    store.put(existing);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveChunkKey(
  sessionId: string,
  key: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<SessionBackup | undefined>((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result as SessionBackup | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    existing.chunkKeys.push(key);
    existing.lastUpdatedAt = Date.now();
    store.put(existing);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingRecovery(): Promise<SessionBackup | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const all = await new Promise<SessionBackup[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as SessionBackup[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const valid = all.filter((s) => s.chunkKeys.length > 0);
    if (valid.length === 0) return null;
    valid.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
    return valid[0];
  } catch {
    return null;
  }
}

export async function clearRecovery(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(sessionId);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silent fail
  }
}
