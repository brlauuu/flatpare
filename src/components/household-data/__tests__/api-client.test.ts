import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClientError, getJson, sendJson } from "../api-client";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api-client", () => {
  it("getJson returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([{ id: "a" }])));
    expect(await getJson<{ id: string }[]>("/api/apartments")).toEqual([{ id: "a" }]);
  });

  it("sendJson posts JSON and returns the body", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => json({ ok: true }, 201)
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendJson<{ ok: boolean }>("POST", "/api/x", { a: 1 })).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("sendJson returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await sendJson("DELETE", "/api/x")).toBeUndefined();
  });

  it("throws ApiClientError with status, message and body on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Stale version", version: 4 }, 409)));
    const err = (await sendJson("PUT", "/api/x", {}).catch((e) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("Stale version");
    expect(err.body).toEqual({ error: "Stale version", version: 4 });
  });

  it("falls back to a status message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    const err = (await getJson("/api/x").catch((e) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.message).toBe("Request failed (502)");
  });
});
