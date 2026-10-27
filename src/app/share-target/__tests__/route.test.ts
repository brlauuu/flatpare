// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// Reached only when no service worker took the share (first visit, worker
// failed). It cannot keep the share, so it does not read it.
describe("POST /share-target (no worker)", () => {
  it("redirects to the add page saying the share is unavailable, without reading the body", async () => {
    const form = new FormData();
    form.append("pdf", new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    const req = new NextRequest("https://flatpare.test/share-target", { method: "POST", body: form });
    const formData = vi.spyOn(req, "formData");
    const text = vi.spyOn(req, "text");
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");

    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://flatpare.test/apartments/new?share=unavailable");
    expect(formData).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
