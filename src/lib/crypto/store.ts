// Persists the unlocked keys per device so the passphrase is entered once.
// IndexedDB can structured-clone a CryptoKey, and a non-extractable key
// stays non-extractable across that clone — which is the whole reason this
// is IndexedDB and not localStorage (which could only hold exported bytes).
//
// Keys are stored under one fixed record, tagged with the user and household
// they belong to, so a different account signing in on the same browser can
// never pick up the previous account's keys.

const DB_NAME = "flatpare-keys";
const DB_VERSION = 1;
const STORE = "keys";
const RECORD = "current";

export interface StoredKeys {
  userId: string;
  householdId: number;
  privateKey: CryptoKey;
  // null while the member has a key pair but nobody has wrapped the
  // household key to it yet ("pending wrap").
  dataKey: CryptoKey | null;
}

// Some private-browsing modes have no IndexedDB, or refuse to open it. Then
// the keys live in this module for the lifetime of the page and the unlock
// prompt comes back on every load; the provider tells the user why via
// isKeyStorePersistent().
let memory: StoredKeys | null = null;
let persistent = true;

export function isKeyStorePersistent(): boolean {
  return persistent;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await requestToPromise(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function saveKeys(keys: StoredKeys): Promise<void> {
  if (keys.privateKey.extractable || keys.dataKey?.extractable) {
    throw new Error("Refusing to persist an extractable key");
  }
  try {
    await withStore("readwrite", (store) => store.put(keys, RECORD));
    persistent = true;
  } catch {
    persistent = false;
    memory = keys;
  }
}

export async function loadKeys(
  userId: string,
  householdId: number
): Promise<StoredKeys | null> {
  let record: StoredKeys | undefined;
  try {
    record = await withStore<StoredKeys | undefined>("readonly", (store) =>
      store.get(RECORD)
    );
    persistent = true;
  } catch {
    persistent = false;
    record = memory ?? undefined;
  }
  if (!record) return null;
  if (record.userId !== userId || record.householdId !== householdId) {
    await clearKeys();
    return null;
  }
  return record;
}

export async function clearKeys(): Promise<void> {
  memory = null;
  try {
    await withStore("readwrite", (store) => store.delete(RECORD));
  } catch {
    // Nothing persisted to clear.
  }
}
