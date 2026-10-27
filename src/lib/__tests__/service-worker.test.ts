// @vitest-environment node
// public/sw.js runs in a browser with no build step, so it cannot import the
// stash module. This runs the file as it ships, in a vm context standing in
// for a worker's global scope, and holds it to the same layout.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_DB_NAME,
  SHARE_DB_VERSION,
  SHARE_STORE,
  SHARE_TTL_MS,
  clearShares,
  listShares,
  readShare,
} from "../share-stash";

const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://flatpare.test";

type Handler = (event: unknown) => void;

function boot(overrides: Record<string, unknown> = {}) {
  const handlers: Record<string, Handler> = {};
  const scope: Record<string, unknown> = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    indexedDB,
    Response,
    Request,
    FormData,
    File,
    Blob,
    URL,
    crypto,
    ...overrides,
  };
  scope.self = scope;
  vm.runInNewContext(SOURCE, scope);
  return { handlers, scope };
}

function fetchEvent(request: Request) {
  return { request, respondWith: vi.fn(), waitUntil: vi.fn() };
}

function shareRequest(form: FormData, path = "/share-target", origin = ORIGIN) {
  return new Request(`${origin}${path}`, { method: "POST", body: form });
}

function shareForm() {
  const form = new FormData();
  form.append("title", "A flat");
  form.append("text", "Look at this");
  form.append("url", "https://homegate.example/123");
  form.append("pdf", new File(["%PDF-1.7"], "listing.pdf", { type: "application/pdf" }));
  form.append("pdf", new File(["notes"], "notes.txt", { type: "text/plain" }));
  return form;
}

async function respond(event: ReturnType<typeof fetchEvent>): Promise<Response> {
  expect(event.respondWith).toHaveBeenCalledTimes(1);
  return (await event.respondWith.mock.calls[0][0]) as Response;
}

beforeEach(async () => {
  await clearShares();
});

describe("service worker", () => {
  it("stores a share and redirects to the add page with its id", async () => {
    const { handlers } = boot();
    const event = fetchEvent(shareRequest(shareForm()));
    handlers.fetch(event);
    const res = await respond(event);

    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/apartments/new");
    const id = location.searchParams.get("share")!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const entry = await readShare(id);
    expect(entry).toMatchObject({
      id,
      title: "A flat",
      text: "Look at this",
      url: "https://homegate.example/123",
      dropped: 1,
    });
    expect(Date.now() - entry!.createdAt).toBeLessThan(10_000);
    expect(entry!.files).toHaveLength(1);
    expect(entry!.files[0].type).toBe("application/pdf");
    expect(await entry!.files[0].text()).toBe("%PDF-1.7");
  });

  it("keeps a PDF by its name when the type is missing", async () => {
    const { handlers } = boot();
    const form = new FormData();
    form.append("pdf", new File(["%PDF"], "Listing.PDF"));
    const event = fetchEvent(shareRequest(form));
    handlers.fetch(event);
    const id = new URL((await respond(event)).headers.get("location")!).searchParams.get("share")!;
    const entry = await readShare(id);
    expect(entry).toMatchObject({ title: null, text: null, url: null, dropped: 0 });
    expect(entry!.files).toHaveLength(1);
  });

  it("does not answer a GET to /share-target", () => {
    const { handlers } = boot();
    const event = fetchEvent(new Request(`${ORIGIN}/share-target`));
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it("does not answer a POST anywhere else", () => {
    const { handlers } = boot();
    const event = fetchEvent(
      new Request(`${ORIGIN}/api/drafts`, { method: "POST", body: "{}" })
    );
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it("does not answer a cross-origin POST to /share-target", () => {
    const { handlers } = boot();
    const event = fetchEvent(shareRequest(shareForm(), "/share-target", "https://elsewhere.test"));
    handlers.fetch(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it("does not answer page loads", () => {
    const { handlers } = boot();
    for (const path of ["/", "/apartments", "/apartments/new?share=x", "/sw.js"]) {
      const event = fetchEvent(new Request(`${ORIGIN}${path}`));
      handlers.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
  });

  it("redirects to share=unavailable when the stash cannot be opened", async () => {
    const { handlers } = boot({
      indexedDB: {
        open: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    const event = fetchEvent(shareRequest(shareForm()));
    handlers.fetch(event);
    const res = await respond(event);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/apartments/new?share=unavailable`);
  });

  it("redirects to share=unavailable when the body is not a form", async () => {
    const { handlers } = boot();
    const event = fetchEvent(
      new Request(`${ORIGIN}/share-target`, {
        method: "POST",
        body: "not a form",
        headers: { "content-type": "multipart/form-data; boundary=x" },
      })
    );
    handlers.fetch(event);
    const res = await respond(event);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/apartments/new?share=unavailable`);
  });

  it("takes over at once: skipWaiting on install, claim on activate", async () => {
    const { handlers, scope } = boot();
    const install = { waitUntil: vi.fn() };
    handlers.install(install);
    expect(scope.skipWaiting).toHaveBeenCalled();

    const activate = { waitUntil: vi.fn() };
    handlers.activate(activate);
    await activate.waitUntil.mock.calls[0][0];
    expect((scope.clients as { claim: ReturnType<typeof vi.fn> }).claim).toHaveBeenCalled();
  });

  it("prunes expired entries on activate", async () => {
    const { handlers } = boot();
    const event = fetchEvent(shareRequest(shareForm()));
    handlers.fetch(event);
    const id = new URL((await respond(event)).headers.get("location")!).searchParams.get("share")!;

    // Age the entry past the TTL, then activate a fresh worker.
    const realNow = Date.now;
    const later = realNow() + SHARE_TTL_MS + 1000;
    const next = boot({ Date: class extends Date { static now() { return later; } } });
    const activate = { waitUntil: vi.fn() };
    next.handlers.activate(activate);
    await activate.waitUntil.mock.calls[0][0];

    // Read at the real time: the entry would still be fresh, so absence
    // means the worker deleted it.
    expect((await listShares()).map((s) => s.id)).not.toContain(id);
  });

  it("uses no cache storage and loads no other script", () => {
    expect(SOURCE).not.toMatch(/\bcaches\b/);
    expect(SOURCE).not.toMatch(/^\s*import\s/m);
    expect(SOURCE).not.toMatch(/importScripts|import\(/);
  });

  it("shares the stash layout with src/lib/share-stash.ts", () => {
    const constant = (name: string) => SOURCE.match(new RegExp(`const ${name} = (.+);`))?.[1];
    expect(constant("SHARE_DB_NAME")).toBe(JSON.stringify(SHARE_DB_NAME));
    expect(constant("SHARE_DB_VERSION")).toBe(String(SHARE_DB_VERSION));
    expect(constant("SHARE_STORE")).toBe(JSON.stringify(SHARE_STORE));
    expect(constant("SHARE_TTL_MS")).toBe("24 * 60 * 60 * 1000");
    expect(24 * 60 * 60 * 1000).toBe(SHARE_TTL_MS);
  });
});
