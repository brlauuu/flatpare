// The page's side of the share stash (#190). The service worker
// (public/sw.js) writes an entry when the phone's share sheet POSTs to
// /share-target; the add page reads it, encrypts and saves what it holds,
// then deletes it. The stash lives in this browser only, so a share survives
// the sign-in redirect and the unlock screen without touching the server.
//
// The worker cannot import this module, so it repeats the layout below;
// src/lib/__tests__/service-worker.test.ts fails if the two drift.
//
// A leaf: imports nothing. Every function resolves (null / [] / nothing)
// rather than throwing when IndexedDB is unavailable or refuses to open.

export const SHARE_DB_NAME = "flatpare-share";
export const SHARE_DB_VERSION = 1;
export const SHARE_STORE = "shares";
/** An entry older than this is deleted unread. */
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SharedItem {
  id: string;
  createdAt: number;
  title: string | null;
  text: string | null;
  url: string | null;
  /** The shared PDFs. Anything else was left out by the worker. */
  files: File[];
  /** How many non-PDF files the worker left out, so the page can say so. */
  dropped: number;
}

function factory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = factory();
    if (!idb) return reject(new Error("IndexedDB unavailable"));
    const req = idb.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) {
        req.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isFresh(item: SharedItem, now: number): boolean {
  return typeof item?.createdAt === "number" && now - item.createdAt <= SHARE_TTL_MS;
}

/**
 * Prunes expired entries, then runs `work` in the same readwrite transaction.
 * Resolves to `fallback` when the stash cannot be used.
 */
async function withStash<T>(
  fallback: T,
  work: (store: IDBObjectStore, fresh: SharedItem[]) => void,
  pick: (fresh: SharedItem[]) => T
): Promise<T> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return fallback;
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, "readwrite");
      const store = tx.objectStore(SHARE_STORE);
      const now = Date.now();
      const all = store.getAll();
      const fresh: SharedItem[] = [];
      all.onsuccess = () => {
        for (const item of all.result as SharedItem[]) {
          if (isFresh(item, now)) fresh.push(item);
          else store.delete(item.id);
        }
        fresh.sort((a, b) => b.createdAt - a.createdAt);
        work(store, fresh);
      };
      tx.oncomplete = () => resolve(pick(fresh));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

/** The entry, or null when it is missing, expired or unreadable. */
export function readShare(id: string): Promise<SharedItem | null> {
  return withStash<SharedItem | null>(
    null,
    () => undefined,
    (fresh) => fresh.find((item) => item.id === id) ?? null
  );
}

/** Every unexpired entry, newest first. */
export function listShares(): Promise<SharedItem[]> {
  return withStash<SharedItem[]>(
    [],
    () => undefined,
    (fresh) => fresh
  );
}

export function deleteShare(id: string): Promise<void> {
  return withStash<void>(
    undefined,
    (store) => {
      store.delete(id);
    },
    () => undefined
  );
}

/**
 * Keeps only `files` in the entry, after some of a multi-PDF share saved and
 * some did not: reopening it then offers only what is still to add. Does
 * nothing when the entry is gone or expired.
 */
export function keepShareFiles(id: string, files: File[]): Promise<void> {
  return withStash<void>(
    undefined,
    (store, fresh) => {
      const item = fresh.find((entry) => entry.id === id);
      if (item) store.put({ ...item, files });
    },
    () => undefined
  );
}

/** Deletes the whole database (on sign-out). */
export function clearShares(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const idb = factory();
      if (!idb) return resolve();
      const req = idb.deleteDatabase(SHARE_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // Another tab holds it open; the delete completes when it closes.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
