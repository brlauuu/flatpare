import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// #480: suggestions while typing, picked by click or keyboard; a pick that
// needs Place Details resolves it with the same session token.
const suggestAddresses = vi.fn();
const resolveAddress = vi.fn();
vi.mock("@/components/household-data/process-client", () => ({
  suggestAddresses: (...a: unknown[]) => suggestAddresses(...a),
  resolveAddress: (...a: unknown[]) => resolveAddress(...a),
}));

import { AddressSearchInput } from "../address-search-input";

afterEach(() => {
  cleanup();
  suggestAddresses.mockReset();
  resolveAddress.mockReset();
});

const BERN = { placeId: "ChIJbern", label: "Bahnhofplatz", detail: "3011 Bern, Switzerland", place: null };
const ZURICH = { placeId: "ChIJzurich", label: "Bahnhofplatz", detail: "8001 Zürich, Switzerland", place: null };

function Harness({ onPick, near = null }: { onPick: (p: unknown) => void; near?: { lat: number; lng: number } | null }) {
  const [value, setValue] = useState("");
  return (
    <>
      <label htmlFor="addr">Address</label>
      <AddressSearchInput id="addr" value={value} near={near} onChange={setValue} onPick={(p) => { setValue(p.address); onPick(p); }} delayMs={0} />
    </>
  );
}

describe("AddressSearchInput", () => {
  it("suggests after three letters and resolves the picked one", async () => {
    suggestAddresses.mockResolvedValue([BERN, ZURICH]);
    resolveAddress.mockResolvedValue({ address: "Bahnhofplatz 1, 8001 Zürich", lat: 47.37, lng: 8.54 });
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} near={{ lat: 47.4, lng: 8.5 }} />);

    await user.type(screen.getByRole("combobox", { name: "Address" }), "Ba");
    expect(suggestAddresses).not.toHaveBeenCalled();
    await user.type(screen.getByRole("combobox"), "h");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.getByRole("listbox", { name: "Address suggestions" })).toBeInTheDocument();
    const [query, session, near] = suggestAddresses.mock.calls.at(-1)!;
    expect(query).toBe("Bah");
    expect(session).toMatchObject({ language: "en", sessionToken: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(near).toEqual({ lat: 47.4, lng: 8.5 });

    await user.click(screen.getByRole("option", { name: /8001 Zürich/ }));
    expect(resolveAddress).toHaveBeenCalledWith("ChIJzurich", session);
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith({ address: "Bahnhofplatz 1, 8001 Zürich", lat: 47.37, lng: 8.54 }));
    expect(screen.getByRole("combobox")).toHaveValue("Bahnhofplatz 1, 8001 Zürich");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("starts a new session after a pick", async () => {
    suggestAddresses.mockResolvedValue([{ placeId: null, label: "Bahnhofplatz, Bern", detail: null, place: { address: "Bahnhofplatz, Bern", lat: 46.9, lng: 7.4 } }]);
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} />);
    await user.type(screen.getByRole("combobox"), "Bahn");
    await user.click(await screen.findByRole("option"));
    // A geocoder match carries its place: nothing to resolve.
    expect(resolveAddress).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith({ address: "Bahnhofplatz, Bern", lat: 46.9, lng: 7.4 });
    const first = suggestAddresses.mock.calls.at(-1)![1].sessionToken;
    await user.type(screen.getByRole("combobox"), " 1");
    await screen.findByRole("option");
    expect(suggestAddresses.mock.calls.at(-1)![1].sessionToken).not.toBe(first);
  });

  it("picks with the arrow keys and Enter, and closes on Escape", async () => {
    suggestAddresses.mockResolvedValue([BERN, ZURICH]);
    resolveAddress.mockResolvedValue({ address: "Bahnhofplatz, 3011 Bern", lat: 46.9, lng: 7.4 });
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Bahn");
    await screen.findAllByRole("option");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(input, "h");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
    await user.keyboard("{Enter}");
    expect(resolveAddress).toHaveBeenCalledWith("ChIJbern", expect.anything());
    await vi.waitFor(() => expect(onPick).toHaveBeenCalled());
  });

  it("says when there is nothing, when suggestions fail, and when a pick cannot be resolved", async () => {
    const user = userEvent.setup();
    render(<Harness onPick={vi.fn()} />);
    const input = screen.getByRole("combobox");

    suggestAddresses.mockResolvedValueOnce([]);
    await user.type(input, "Zzz");
    expect(await screen.findByRole("status")).toHaveTextContent("No suggestions");

    suggestAddresses.mockRejectedValueOnce(new Error("down"));
    await user.type(input, "z");
    expect(await screen.findByRole("alert")).toHaveTextContent("Suggestions are not available");

    suggestAddresses.mockResolvedValueOnce([BERN]);
    resolveAddress.mockResolvedValueOnce(null);
    await user.type(input, "z");
    await user.click(await screen.findByRole("option"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not get that address");
  });
});
