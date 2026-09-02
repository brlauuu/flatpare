import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireHousehold, mockAssertMembership, locationsLib } = vi.hoisted(
  () => ({
    mockRequireHousehold: vi.fn(),
    mockAssertMembership: vi.fn(),
    locationsLib: {
      listLocations: vi.fn(),
      createLocation: vi.fn(),
      getLocation: vi.fn(),
      updateLocation: vi.fn(),
      deleteLocation: vi.fn(),
      moveLocation: vi.fn(),
    },
  })
);

const HOUSEHOLD_ID = 7;

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

// The real error classes: the routes branch on `instanceof`, so a stand-in
// class defined in the factory would silently fall through to a 500.
vi.mock("@/lib/household", async () => {
  const actual = await vi.importActual<typeof import("@/lib/household")>(
    "@/lib/household"
  );
  return { ...actual, assertMembership: mockAssertMembership };
});

vi.mock("@/lib/locations", () => locationsLib);

import { ForbiddenError, UnauthorizedError } from "@/lib/household";

import { GET as listGET, POST as listPOST } from "../route";
import {
  GET as itemGET,
  PUT as itemPUT,
  DELETE as itemDELETE,
} from "../[id]/route";
import { POST as movePOST } from "../[id]/move/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: HOUSEHOLD_ID,
    userId: "u1",
    role: "owner",
  });
  mockAssertMembership.mockResolvedValue("owner");
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleRow = {
  id: 1,
  householdId: HOUSEHOLD_ID,
  label: "Train",
  icon: "Train",
  address: "Basel SBB",
  sortOrder: 0,
  latitude: null,
  longitude: null,
  createdAt: null,
  updatedAt: null,
};

describe("GET /api/locations", () => {
  it("returns the list", async () => {
    locationsLib.listLocations.mockResolvedValue([sampleRow]);
    const res = await listGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([sampleRow]);
  });

  it("returns 500 on db failure", async () => {
    locationsLib.listLocations.mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await listGET();
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("POST /api/locations", () => {
  it("creates and returns 201", async () => {
    locationsLib.createLocation.mockResolvedValue(sampleRow);
    const req = new Request("http://x/api/locations", {
      method: "POST",
      body: JSON.stringify({
        label: "Train",
        icon: "Train",
        address: "Basel SBB",
      }),
    });
    const res = await listPOST(req);
    expect(res.status).toBe(201);
    expect(locationsLib.createLocation).toHaveBeenCalledWith(HOUSEHOLD_ID, {
      label: "Train",
      icon: "Train",
      address: "Basel SBB",
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://x/api/locations", {
      method: "POST",
      body: JSON.stringify({ label: "Train" }),
    });
    const res = await listPOST(req);
    expect(res.status).toBe(400);
    expect(locationsLib.createLocation).not.toHaveBeenCalled();
  });

  it("returns 400 on validation errors from the lib", async () => {
    locationsLib.createLocation.mockRejectedValue(
      new Error("Cannot have more than 5 locations")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations", {
      method: "POST",
      body: JSON.stringify({
        label: "X",
        icon: "Train",
        address: "Y",
      }),
    });
    const res = await listPOST(req);
    expect(res.status).toBe(400);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 on non-validation errors", async () => {
    locationsLib.createLocation.mockRejectedValue(new Error("disk full"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations", {
      method: "POST",
      body: JSON.stringify({
        label: "X",
        icon: "Train",
        address: "Y",
      }),
    });
    const res = await listPOST(req);
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("GET /api/locations/[id]", () => {
  it("returns the location", async () => {
    locationsLib.getLocation.mockResolvedValue(sampleRow);
    const res = await itemGET(
      new Request("http://x/api/locations/1"),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(1);
  });

  it("returns 404 when missing", async () => {
    locationsLib.getLocation.mockResolvedValue(null);
    const res = await itemGET(
      new Request("http://x/api/locations/999"),
      withParams("999")
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 on lib error", async () => {
    locationsLib.getLocation.mockRejectedValue(new Error("oops"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await itemGET(
      new Request("http://x/api/locations/1"),
      withParams("1")
    );
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("PUT /api/locations/[id]", () => {
  it("updates and returns the new row", async () => {
    locationsLib.updateLocation.mockResolvedValue({
      ...sampleRow,
      label: "New Label",
    });
    const req = new Request("http://x/api/locations/1", {
      method: "PUT",
      body: JSON.stringify({ label: "New Label" }),
    });
    const res = await itemPUT(req, withParams("1"));
    expect(res.status).toBe(200);
    expect((await res.json()).label).toBe("New Label");
    expect(locationsLib.updateLocation).toHaveBeenCalledWith(HOUSEHOLD_ID, 1, {
      label: "New Label",
    });
  });

  it("returns 400 on validation errors", async () => {
    locationsLib.updateLocation.mockRejectedValue(
      new Error("Label cannot be empty")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations/1", {
      method: "PUT",
      body: JSON.stringify({ label: "  " }),
    });
    const res = await itemPUT(req, withParams("1"));
    expect(res.status).toBe(400);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 on other lib errors", async () => {
    locationsLib.updateLocation.mockRejectedValue(new Error("disk error"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations/1", {
      method: "PUT",
      body: JSON.stringify({ label: "x" }),
    });
    const res = await itemPUT(req, withParams("1"));
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("DELETE /api/locations/[id]", () => {
  it("deletes and returns success", async () => {
    locationsLib.deleteLocation.mockResolvedValue(true);
    const res = await itemDELETE(
      new Request("http://x/api/locations/1", { method: "DELETE" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect(locationsLib.deleteLocation).toHaveBeenCalledWith(HOUSEHOLD_ID, 1);
  });

  it("returns 500 on lib error", async () => {
    locationsLib.deleteLocation.mockRejectedValue(new Error("constraint"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await itemDELETE(
      new Request("http://x/api/locations/1", { method: "DELETE" }),
      withParams("1")
    );
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("POST /api/locations/[id]/move", () => {
  it("moves up and returns success", async () => {
    locationsLib.moveLocation.mockResolvedValue(undefined);
    const req = new Request("http://x/api/locations/1/move", {
      method: "POST",
      body: JSON.stringify({ direction: "up" }),
    });
    const res = await movePOST(req, withParams("1"));
    expect(res.status).toBe(200);
    expect(locationsLib.moveLocation).toHaveBeenCalledWith(
      HOUSEHOLD_ID,
      1,
      "up"
    );
  });

  it("rejects an invalid direction with 400", async () => {
    const req = new Request("http://x/api/locations/1/move", {
      method: "POST",
      body: JSON.stringify({ direction: "sideways" }),
    });
    const res = await movePOST(req, withParams("1"));
    expect(res.status).toBe(400);
    expect(locationsLib.moveLocation).not.toHaveBeenCalled();
  });

  it("returns 404 on not-found errors", async () => {
    locationsLib.moveLocation.mockRejectedValue(
      new Error("Location 99 not found")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations/99/move", {
      method: "POST",
      body: JSON.stringify({ direction: "down" }),
    });
    const res = await movePOST(req, withParams("99"));
    expect(res.status).toBe(404);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 on other errors", async () => {
    locationsLib.moveLocation.mockRejectedValue(new Error("oops"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/locations/1/move", {
      method: "POST",
      body: JSON.stringify({ direction: "up" }),
    });
    const res = await movePOST(req, withParams("1"));
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("session and membership gating", () => {
  it("every handler answers 401 when there is no session", async () => {
    mockRequireHousehold.mockRejectedValue(new UnauthorizedError());
    const calls: Array<Promise<Response>> = [
      listGET(),
      listPOST(
        new Request("http://x/api/locations", {
          method: "POST",
          body: JSON.stringify({ label: "a", icon: "Train", address: "b" }),
        })
      ),
      itemGET(new Request("http://x/api/locations/1"), withParams("1")),
      itemPUT(
        new Request("http://x/api/locations/1", {
          method: "PUT",
          body: JSON.stringify({ label: "a" }),
        }),
        withParams("1")
      ),
      itemDELETE(
        new Request("http://x/api/locations/1", { method: "DELETE" }),
        withParams("1")
      ),
      movePOST(
        new Request("http://x/api/locations/1/move", {
          method: "POST",
          body: JSON.stringify({ direction: "up" }),
        }),
        withParams("1")
      ),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
    }
    expect(locationsLib.listLocations).not.toHaveBeenCalled();
    expect(locationsLib.createLocation).not.toHaveBeenCalled();
    expect(locationsLib.updateLocation).not.toHaveBeenCalled();
    expect(locationsLib.deleteLocation).not.toHaveBeenCalled();
    expect(locationsLib.moveLocation).not.toHaveBeenCalled();
  });

  it("destructive handlers answer 404 when the member was removed", async () => {
    // The JWT still names the household; the database says otherwise.
    mockAssertMembership.mockRejectedValue(new ForbiddenError());
    const create = await listPOST(
      new Request("http://x/api/locations", {
        method: "POST",
        body: JSON.stringify({ label: "a", icon: "Train", address: "b" }),
      })
    );
    expect(create.status).toBe(404);
    expect(locationsLib.createLocation).not.toHaveBeenCalled();
    const put = await itemPUT(
      new Request("http://x/api/locations/1", {
        method: "PUT",
        body: JSON.stringify({ label: "a" }),
      }),
      withParams("1")
    );
    const del = await itemDELETE(
      new Request("http://x/api/locations/1", { method: "DELETE" }),
      withParams("1")
    );
    const move = await movePOST(
      new Request("http://x/api/locations/1/move", {
        method: "POST",
        body: JSON.stringify({ direction: "up" }),
      }),
      withParams("1")
    );
    // 404, not 403 — the response must not confirm the row exists.
    for (const res of [put, del, move]) expect(res.status).toBe(404);
    expect(locationsLib.updateLocation).not.toHaveBeenCalled();
    expect(locationsLib.deleteLocation).not.toHaveBeenCalled();
    expect(locationsLib.moveLocation).not.toHaveBeenCalled();
  });

  it("PUT answers 404 (not 400) when the row is not in this household", async () => {
    locationsLib.updateLocation.mockRejectedValue(
      new Error("Location 1 not found")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await itemPUT(
      new Request("http://x/api/locations/1", {
        method: "PUT",
        body: JSON.stringify({ label: "a" }),
      }),
      withParams("1")
    );
    expect(res.status).toBe(404);
    expect(errSpy).toHaveBeenCalled();
  });

  it("DELETE answers 404 when the lib deleted nothing", async () => {
    locationsLib.deleteLocation.mockResolvedValue(false);
    const res = await itemDELETE(
      new Request("http://x/api/locations/1", { method: "DELETE" }),
      withParams("1")
    );
    expect(res.status).toBe(404);
  });
});
