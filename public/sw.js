// Flatpare's service worker (#190). It does one thing: receive what the
// phone's share sheet sends to /share-target, keep it in this browser's
// IndexedDB, and send the page to the add flow. It answers no other request
// and stores no pages or data, so the app behaves exactly as if no worker
// were installed. Design: docs/superpowers/specs/2026-10-27-pwa-design.md.
//
// The stash layout is repeated from src/lib/share-stash.ts (a worker cannot
// import it); src/lib/__tests__/service-worker.test.ts keeps them equal.

const SHARE_DB_NAME = "flatpare-share";
const SHARE_DB_VERSION = 1;
const SHARE_STORE = "shares";
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

const SHARE_PATH = "/share-target";
const ADD_PATH = "/apartments/new";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), withStore(() => {}).catch(() => {})]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "POST") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== SHARE_PATH) return;
  event.respondWith(handleShare(request));
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = [];
    let dropped = 0;
    for (const entry of form.getAll("pdf")) {
      if (!(entry instanceof File)) continue;
      if (isPdf(entry)) files.push(entry);
      else dropped += 1;
    }
    const id = crypto.randomUUID();
    const item = {
      id,
      createdAt: Date.now(),
      title: field(form, "title"),
      text: field(form, "text"),
      url: field(form, "url"),
      files,
      dropped,
    };
    await withStore((store) => store.put(item));
    return redirect(id);
  } catch {
    return redirect("unavailable");
  }
}

function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function field(form, name) {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? value : null;
}

function redirect(share) {
  const target = new URL(ADD_PATH, self.location.origin);
  target.searchParams.set("share", share);
  return Response.redirect(target.href, 303);
}

// Opens the stash, deletes expired entries, runs `work` in the same
// transaction and resolves once it has committed.
function withStore(work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(SHARE_STORE)) {
        open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_STORE, "readwrite");
      const store = tx.objectStore(SHARE_STORE);
      const cutoff = Date.now() - SHARE_TTL_MS;
      const all = store.getAll();
      all.onsuccess = () => {
        for (const item of all.result) {
          if (!(item.createdAt >= cutoff)) store.delete(item.id);
        }
        work(store);
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
