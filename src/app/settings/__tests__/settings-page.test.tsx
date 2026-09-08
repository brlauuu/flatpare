import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";

// The settings page mounts the encryption and household panels; they have
// their own tests and need a CryptoProvider, so stub them here.
vi.mock("@/components/crypto/encryption-settings", () => ({
  EncryptionSettings: () => null,
}));
vi.mock("@/components/household-settings", () => ({
  HouseholdSettings: () => null,
}));

import SettingsPage from "../page";

const STATION = makeLocationView({
  id: "loc-1",
  label: "Train Station",
  icon: "Train",
  address: "Basel SBB",
  sortOrder: 0,
});

function setup(over: Parameters<typeof renderWithHouseholdData>[1] = {}) {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  return renderWithHouseholdData(<SettingsPage />, { locations: [STATION], ...over });
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("SettingsPage", () => {
  it("renders the store's locations", () => {
    setup();
    expect(screen.getByText("Train Station")).toBeInTheDocument();
    expect(screen.getByText("Basel SBB")).toBeInTheDocument();
    expect(screen.getByText(/1 of 5/)).toBeInTheDocument();
  });

  it("adds a new location via the icon-picker modal and createLocation", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.createLocation).mockImplementation(async (id, data) =>
      makeLocationView({ id, ...data, sortOrder: 1 })
    );

    await user.click(screen.getByRole("button", { name: /Add location/i }));
    await user.type(screen.getByLabelText(/Label/i), "Work");
    await user.type(screen.getByLabelText(/Address/i), "Zürich");
    await user.click(screen.getByRole("button", { name: /Pick icon/i }));
    expect(screen.getByRole("dialog", { name: /Pick an icon/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Briefcase" }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.createLocation).toHaveBeenCalledTimes(1));
    const [id, data] = vi.mocked(value.createLocation).mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).toEqual({
      label: "Work",
      icon: "Briefcase",
      address: "Zürich",
      latitude: null,
      longitude: null,
    });
    // Form closes on success.
    await waitFor(() => expect(screen.queryByLabelText(/Label/i)).toBeNull());
  });

  it("shows an error and keeps the form open when createLocation rejects", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.createLocation).mockRejectedValue(new Error("Too many locations"));
    await user.click(screen.getByRole("button", { name: /Add location/i }));
    await user.type(screen.getByLabelText(/Label/i), "Work");
    await user.type(screen.getByLabelText(/Address/i), "Zürich");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Couldn't save location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Label/i)).toBeInTheDocument();
  });

  it("deletes a location after confirmation", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /Delete Train Station/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete "Train Station"? Apartments will lose this distance.'
    );
    await waitFor(() => expect(value.deleteLocation).toHaveBeenCalledWith("loc-1"));
  });

  it("does not delete when the confirm is declined", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    await user.click(screen.getByRole("button", { name: /Delete Train Station/i }));
    expect(value.deleteLocation).not.toHaveBeenCalled();
  });

  it("edit flow: opens, changes label, saves through updateLocation with a mutator", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.updateLocation).mockImplementation(async (id, mutate) =>
      makeLocationView({ ...mutate(STATION), id, sortOrder: 0 })
    );
    await user.click(screen.getByRole("button", { name: /Edit Train Station/i }));
    const labelInput = screen.getByLabelText(/^Label$/i) as HTMLInputElement;
    expect(labelInput.value).toBe("Train Station");
    await user.clear(labelInput);
    await user.type(labelInput, "Renamed");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.updateLocation).toHaveBeenCalledTimes(1));
    const [id, mutate] = vi.mocked(value.updateLocation).mock.calls[0];
    expect(id).toBe("loc-1");
    expect(mutate(STATION)).toEqual({ ...STATION, label: "Renamed" });
  });

  it("Save stays disabled while the edit form is unchanged", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Edit Train Station/i }));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("move up / move down call moveLocation and disable at the edges", async () => {
    const user = userEvent.setup();
    const { value } = setup({
      locations: [
        makeLocationView({ id: "loc-1", label: "First", address: "A", sortOrder: 0 }),
        makeLocationView({ id: "loc-2", label: "Second", address: "B", sortOrder: 1 }),
      ],
    });
    expect(screen.getByRole("button", { name: /Move First up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Move Second down/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Move Second up/i }));
    await waitFor(() => expect(value.moveLocation).toHaveBeenCalledWith("loc-2", "up"));
    await user.click(screen.getByRole("button", { name: /Move First down/i }));
    await waitFor(() => expect(value.moveLocation).toHaveBeenCalledWith("loc-1", "down"));
  });

  it("recompute runs the distances maintenance and reports the result", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.runMaintenance).mockImplementation(async (_kind, onProgress) => {
      onProgress?.(1, 3);
      onProgress?.(3, 3);
      return { updated: 3, skipped: 1, failed: [{ id: "a9", reason: "No route" }] };
    });
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(value.runMaintenance).toHaveBeenCalledWith("distances", expect.any(Function));
    expect(
      await screen.findByText(/Recomputed 3 apartments \(1 failed\) \(1 skipped — no address\)/i)
    ).toBeInTheDocument();
  });

  it("shows progress while recomputing", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    let finish: (r: { updated: number; skipped: number; failed: [] }) => void = () => {};
    vi.mocked(value.runMaintenance).mockImplementation(
      (_kind, onProgress) =>
        new Promise((resolve) => {
          onProgress?.(1, 4);
          finish = resolve;
        })
    );
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(await screen.findByText(/Recomputing… 1 of 4/)).toBeInTheDocument();
    finish({ updated: 4, skipped: 0, failed: [] });
    expect(await screen.findByText(/Recomputed 4 apartments/)).toBeInTheDocument();
  });

  it("shows an error when the maintenance run itself throws", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.runMaintenance).mockRejectedValue(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(await screen.findByText(/Couldn't recompute distances/i)).toBeInTheDocument();
  });

  it("disables Recompute when there are no locations, and Add at the 5-location limit", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      makeLocationView({ id: `loc-${i}`, label: `Loc ${i + 1}`, address: `Addr ${i + 1}`, sortOrder: i })
    );
    setup({ locations: five });
    expect(screen.getByRole("button", { name: /Add location/i })).toBeDisabled();
    expect(screen.getByText(/5 of 5/)).toBeInTheDocument();
    cleanup();
    setup({ locations: [] });
    expect(screen.getByRole("button", { name: /Recompute all/i })).toBeDisabled();
    expect(screen.getByText(/No locations yet/)).toBeInTheDocument();
  });

  it("shows the store's load error", () => {
    setup({ status: "error", error: "Failed to load household data", locations: [] });
    expect(screen.getByText(/Couldn't load locations/i)).toBeInTheDocument();
  });
});
