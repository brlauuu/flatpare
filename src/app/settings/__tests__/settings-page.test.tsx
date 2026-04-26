import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SettingsPage from "../page";

type Loc = {
  id: number;
  label: string;
  icon: string;
  address: string;
  sortOrder: number;
};

let locations: Loc[];
const fetchMock = vi.fn();

function jsonRes(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

beforeEach(() => {
  locations = [
    { id: 1, label: "Train Station", icon: "Train", address: "Basel SBB", sortOrder: 0 },
  ];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/locations" && method === "GET") {
      return jsonRes(locations);
    }
    if (url === "/api/locations" && method === "POST") {
      const body = JSON.parse(init!.body as string);
      const created: Loc = {
        id: locations.length + 1,
        label: body.label,
        icon: body.icon,
        address: body.address,
        sortOrder: locations.length,
      };
      locations = [...locations, created];
      return jsonRes(created, true, 201);
    }
    if (
      /^\/api\/locations\/\d+$/.test(url) &&
      method === "DELETE"
    ) {
      const id = Number(url.split("/").pop());
      locations = locations.filter((l) => l.id !== id);
      return jsonRes({ success: true });
    }
    if (url === "/api/settings/recompute-distances") {
      return jsonRes({
        totalApartments: 3,
        totalLocations: locations.length,
        updated: 6,
        failed: 0,
        skipped: 0,
      });
    }
    return jsonRes({ error: `unexpected fetch ${method} ${url}` }, false, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("SettingsPage", () => {
  it("renders the existing locations on load", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Train Station")).toBeInTheDocument();
    });
    expect(screen.getByText("Basel SBB")).toBeInTheDocument();
    expect(screen.getByText(/1 of 5/)).toBeInTheDocument();
  });

  it("adds a new location via the icon-picker modal", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Train Station"));

    await user.click(screen.getByRole("button", { name: /Add location/i }));

    await user.type(screen.getByLabelText(/Label/i), "Work");
    await user.type(screen.getByLabelText(/Address/i), "Zürich");

    await user.click(screen.getByRole("button", { name: /Pick icon/i }));
    expect(
      screen.getByRole("dialog", { name: /Pick an icon/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Briefcase" }));

    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });
    expect(screen.getByText("Zürich")).toBeInTheDocument();
    expect(screen.getByText(/2 of 5/)).toBeInTheDocument();
  });

  it("deletes a location after confirmation", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Train Station"));

    await user.click(
      screen.getByRole("button", { name: /Delete Train Station/i })
    );
    await waitFor(() => {
      expect(screen.queryByText("Train Station")).not.toBeInTheDocument();
    });
  });

  it("recompute renders a result message", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Train Station"));

    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Recomputed 6 pairs across 3 apartments/i)
      ).toBeInTheDocument();
    });
  });

  it("disables Add when at the 5-location limit", async () => {
    locations = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      label: `Loc ${i + 1}`,
      icon: "Train",
      address: `Addr ${i + 1}`,
      sortOrder: i,
    }));
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Loc 1"));
    expect(
      screen.getByRole("button", { name: /Add location/i })
    ).toBeDisabled();
    expect(screen.getByText(/5 of 5/)).toBeInTheDocument();
  });
});
