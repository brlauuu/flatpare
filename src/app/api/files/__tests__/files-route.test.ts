// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { UnauthorizedError } from "@/lib/household";

const { mockRequireMember } = vi.hoisted(() => ({ mockRequireMember: vi.fn() }));

vi.mock("@/lib/api-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-route")>();
  return { ...actual, requireMember: mockRequireMember };
});

import { DELETE, POST } from "../route";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const APT = "11111111-1111-4111-8111-111111111111";

function request(fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost/api/files", { method: "POST", body: form });
}

beforeEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  mockRequireMember.mockResolvedValue({ householdId: 7, userId: "u1", role: "owner" });
});

afterEach(() => {
  fs.rmSync(path.join(UPLOADS_DIR, "households", "7"), { recursive: true, force: true });
});

describe("POST /api/files", () => {
  it("stores the bytes under households/<id>/<apartmentId>.pdf.enc and returns the path", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const res = await POST(
      request({ file: new Blob([bytes], { type: "application/octet-stream" }), apartmentId: APT })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    const stored = fs.readFileSync(path.join(UPLOADS_DIR, "households", "7", `${APT}.pdf.enc`));
    expect([...stored]).toEqual([1, 2, 3, 4]);
  });

  it("rejects a missing file", async () => {
    const res = await POST(request({ apartmentId: APT }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-uuid apartment id", async () => {
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: "../x" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireMember.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: APT }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the caller is no longer a member", async () => {
    mockRequireMember.mockRejectedValueOnce(new (await import("@/lib/api-error")).ApiError("Not found", 404));
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: APT }));
    expect(res.status).toBe(404);
  });
});

// #219
describe("POST /api/files with keyVersion", () => {
  it("stores the re-encrypted file under the versioned name", async () => {
    const res = await POST(
      request({ file: new Blob([new Uint8Array([9])], { type: "application/octet-stream" }), apartmentId: APT, keyVersion: "2" })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).path).toBe(`/api/uploads/households/7/${APT}.k2.pdf.enc`);
    expect(fs.existsSync(path.join(UPLOADS_DIR, "households", "7", `${APT}.k2.pdf.enc`))).toBe(true);
  });

  it("rejects a non-positive or non-integer keyVersion", async () => {
    for (const bad of ["0", "1.5", "abc"]) {
      const res = await POST(
        request({ file: new Blob([new Uint8Array([9])], { type: "application/octet-stream" }), apartmentId: APT, keyVersion: bad })
      );
      expect(res.status).toBe(400);
    }
  });
});

// #413: a PDF attached or replaced on the apartment page.
describe("POST /api/files with a revision", () => {
  it("stores the file under a name of its own", async () => {
    const res = await POST(
      request({ file: new Blob([new Uint8Array([5])]), apartmentId: APT, revision: "0123456789ab" })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).path).toBe(`/api/uploads/households/7/${APT}.r0123456789ab.pdf.enc`);
  });

  it("refuses a revision that is not twelve hex characters", async () => {
    for (const bad of ["../../x", "0123", "0123456789AB", "0123456789abc"]) {
      const res = await POST(request({ file: new Blob([new Uint8Array([5])]), apartmentId: APT, revision: bad }));
      expect(res.status, bad).toBe(400);
    }
  });
});

describe("DELETE /api/files", () => {
  function del(body: unknown) {
    return new Request("http://localhost/api/files", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("deletes a file of the caller's household", async () => {
    const res = await POST(request({ file: new Blob([new Uint8Array([5])]), apartmentId: APT }));
    const { path: stored } = await res.json();
    expect((await DELETE(del({ path: stored }))).status).toBe(204);
    expect(fs.existsSync(path.join(UPLOADS_DIR, "households", "7", `${APT}.pdf.enc`))).toBe(false);
  });

  it("refuses a path in another household, and leaves it alone", async () => {
    const res = await POST(request({ file: new Blob([new Uint8Array([5])]), apartmentId: APT }));
    const { path: stored } = await res.json();
    mockRequireMember.mockResolvedValueOnce({ householdId: 8, userId: "u2", role: "owner" });
    expect((await DELETE(del({ path: stored }))).status).toBe(400);
    expect(fs.existsSync(path.join(UPLOADS_DIR, "households", "7", `${APT}.pdf.enc`))).toBe(true);
  });

  it("is a 204 for a file that is already gone", async () => {
    expect((await DELETE(del({ path: `/api/uploads/households/7/${APT}.pdf.enc` }))).status).toBe(204);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireMember.mockRejectedValueOnce(new UnauthorizedError());
    expect((await DELETE(del({ path: "/api/uploads/households/7/x" }))).status).toBe(401);
  });
});
