import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsAuthenticated, locationsLib } = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(async () => true),
  locationsLib: {
    listLocations: vi.fn(),
    createLocation: vi.fn(),
    getLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    moveLocation: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: mockIsAuthenticated,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/locations", () => locationsLib);

import { GET as listGET, POST as listPOST } from "../route";
import {
  GET as itemGET,
  PUT as itemPUT,
  DELETE as itemDELETE,
} from "../[id]/route";
import { POST as movePOST } from "../[id]/move/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(true);
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleRow = {
  id: 1,
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
    expect(locationsLib.createLocation).toHaveBeenCalledWith({
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
    expect(locationsLib.updateLocation).toHaveBeenCalledWith(1, {
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
    locationsLib.deleteLocation.mockResolvedValue(undefined);
    const res = await itemDELETE(
      new Request("http://x/api/locations/1", { method: "DELETE" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect(locationsLib.deleteLocation).toHaveBeenCalledWith(1);
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
    expect(locationsLib.moveLocation).toHaveBeenCalledWith(1, "up");
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
