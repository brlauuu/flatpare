// @vitest-environment node
// Node, not jsdom: the stash holds File objects, and the shares are written
// by the service worker, which sees the platform's own File.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_DB_NAME,
  SHARE_DB_VERSION,
  SHARE_STORE,
  SHARE_TTL_MS,
  clearShares,
  deleteShare,
  listShares,
  readShare,
  type SharedItem,
} from "../share-stash";

function item(id: string, createdAt: number, extra: Partial<SharedItem> = {}): SharedItem {
  return { id, createdAt, title: null, text: null, url: null, files: [], dropped: 0, ...extra };
}

// Writes the way public/sw.js does: its own open, same layout.
function put(entry: SharedItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(entry);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function rawIds(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(SHARE_STORE).objectStore(SHARE_STORE).getAllKeys();
      req.onsuccess = () => {
        db.close();
        resolve(req.result as string[]);
      };
      req.onerror = () => reject(req.error);
    };
  });
}

beforeEach(async () => {
  await clearShares();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share stash", () => {
  it("uses the layout the worker writes", () => {
    expect(SHARE_DB_NAME).toBe("flatpare-share");
    expect(SHARE_DB_VERSION).toBe(1);
    expect(SHARE_STORE).toBe("shares");
    expect(SHARE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("reads back an entry the worker stored, file included", async () => {
    const pdf = new File(["%PDF-1.4"], "listing.pdf", { type: "application/pdf" });
    await put(item("a", Date.now(), { title: "Flat", url: "https://example.com/1", files: [pdf], dropped: 2 }));

    const got = await readShare("a");
    expect(got).toMatchObject({ id: "a", title: "Flat", url: "https://example.com/1", text: null, dropped: 2 });
    expect(got!.files).toHaveLength(1);
    expect(got!.files[0].type).toBe("application/pdf");
    expect(await got!.files[0].text()).toBe("%PDF-1.4");
  });

  it("answers null for an unknown id", async () => {
    expect(await readShare("missing")).toBeNull();
  });

  it("treats an expired entry as missing and prunes it", async () => {
    await put(item("old", Date.now() - SHARE_TTL_MS - 1));
    await put(item("new", Date.now()));

    expect(await readShare("old")).toBeNull();
    expect(await rawIds()).toEqual(["new"]);
  });

  it("lists unexpired entries, newest first", async () => {
    const now = Date.now();
    await put(item("middle", now - 2000));
    await put(item("newest", now - 1000));
    await put(item("oldest", now - 3000));
    await put(item("expired", now - SHARE_TTL_MS - 1));

    expect((await listShares()).map((s) => s.id)).toEqual(["newest", "middle", "oldest"]);
    expect(await rawIds()).not.toContain("expired");
  });

  it("deletes one entry", async () => {
    await put(item("a", Date.now()));
    await put(item("b", Date.now()));
    await deleteShare("a");
    expect((await listShares()).map((s) => s.id)).toEqual(["b"]);
  });

  it("clears everything", async () => {
    await put(item("a", Date.now()));
    await clearShares();
    expect(await listShares()).toEqual([]);
  });

  it("resolves quietly when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await readShare("a")).toBeNull();
    expect(await listShares()).toEqual([]);
    await expect(deleteShare("a")).resolves.toBeUndefined();
    await expect(clearShares()).resolves.toBeUndefined();
  });

  it("resolves quietly when opening the database throws", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("SecurityError");
      },
      deleteDatabase: () => {
        throw new Error("SecurityError");
      },
    });
    expect(await readShare("a")).toBeNull();
    expect(await listShares()).toEqual([]);
    await expect(deleteShare("a")).resolves.toBeUndefined();
    await expect(clearShares()).resolves.toBeUndefined();
  });
});
