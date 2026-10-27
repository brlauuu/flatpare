import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveKekBytes } from "../kdf";
import { argon2idBytes } from "../argon2";
import { handleKdfRequest, type KdfRequest, type KdfResponse } from "../kdf-worker";
import { TEST_KDF_PARAMS } from "./params";

const salt = new Uint8Array(16).map((_, i) => i);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// A stand-in for the browser's Worker: runs the real handler, or misbehaves
// the way a real one can, so the fallback paths are exercised (#396).
type Mode = "real" | "error" | "throw" | "fail";
function stubWorker(mode: Mode) {
  const created: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((e: { data: KdfResponse }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    url: URL;
    constructor(url: URL) {
      if (mode === "throw") throw new Error("blocked");
      this.url = url;
      created.push(this);
    }
    postMessage(req: KdfRequest) {
      if (mode === "error") return void setTimeout(() => this.onerror?.(), 0);
      const res: Promise<KdfResponse> =
        mode === "fail" ? Promise.resolve({ ok: false }) : handleKdfRequest(req);
      void res.then((data) => this.onmessage?.({ data }));
    }
    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  return created;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deriveKekBytes in a worker (#396)", () => {
  it("uses the worker's answer, from kdf-worker.ts, and terminates it", async () => {
    const created = stubWorker("real");
    const out = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    expect(created).toHaveLength(1);
    expect(created[0].url.pathname).toMatch(/kdf-worker\.ts$/);
    expect(created[0].terminated).toBe(true);
    expect(hex(out)).toBe(hex(await argon2idBytes("pw", salt, TEST_KDF_PARAMS)));
  });

  it.each<Mode>(["error", "throw", "fail"])(
    "falls back to the main thread when the worker cannot (%s), with the same result",
    async (mode) => {
      stubWorker(mode);
      const out = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
      expect(hex(out)).toBe(hex(await argon2idBytes("pw", salt, TEST_KDF_PARAMS)));
    }
  );

  it("derives on the main thread where there is no Worker at all", async () => {
    expect(typeof Worker).toBe("undefined");
    const out = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    expect(out).toHaveLength(32);
  });
});

describe("handleKdfRequest", () => {
  it("answers the same bytes as the main-thread derivation", async () => {
    const res = await handleKdfRequest({ secret: "pw", salt, params: TEST_KDF_PARAMS });
    expect(res.ok).toBe(true);
    if (res.ok) expect(hex(res.bytes)).toBe(hex(await argon2idBytes("pw", salt, TEST_KDF_PARAMS)));
  });

  it("reports a failure instead of throwing", async () => {
    const res = await handleKdfRequest({
      secret: "pw",
      salt: new Uint8Array(0),
      params: TEST_KDF_PARAMS,
    });
    expect(res).toEqual({ ok: false });
  });

  it("answers messages, transferring the bytes, when loaded in worker scope", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("importScripts", () => {});
    vi.stubGlobal("postMessage", postMessage);
    vi.resetModules();
    await import("../kdf-worker");
    const scope = globalThis as unknown as { onmessage: (e: { data: KdfRequest }) => void };
    scope.onmessage({ data: { secret: "pw", salt, params: TEST_KDF_PARAMS } });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
    const [res, transfer] = postMessage.mock.calls[0] as [KdfResponse, ArrayBuffer[]];
    expect(res.ok).toBe(true);
    if (res.ok) expect(transfer).toEqual([res.bytes.buffer]);
    (globalThis as { onmessage: unknown }).onmessage = null;
  });
});
