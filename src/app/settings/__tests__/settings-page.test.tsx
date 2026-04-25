import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SettingsPage from "../page";

let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.spyOn(global, "fetch").mockImplementation(((
    input: RequestInfo,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    fetchCalls.push({ url, init: init ?? {} });
    const method = init?.method ?? "GET";

    if (url === "/api/settings" && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ stationAddress: "Basel SBB, Switzerland" }),
      } as Response);
    }
    if (url === "/api/settings" && method === "PUT") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ stationAddress: body.stationAddress }),
      } as Response);
    }
    if (
      url === "/api/settings/recompute-distances" &&
      method === "POST"
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ updated: 4, failed: 1, skipped: 0, total: 5 }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Settings page", () => {
  it("loads the existing setting on mount and shows it in the input", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(input.value).toBe("Basel SBB, Switzerland");
    });
  });

  it("disables Save when the input is empty", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = await waitFor(() => {
      const i = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(i.value).toBe("Basel SBB, Switzerland");
      return i;
    });
    await user.clear(input);
    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("disables Save when the input matches the loaded value", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const i = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(i.value).toBe("Basel SBB, Switzerland");
    });
    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("clicking Recompute calls the recompute endpoint and shows the result", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Station address/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Recomputed 4 of 5 apartments/i)
      ).toBeInTheDocument();
    });
    const recomputeCall = fetchCalls.find(
      (c) => c.url === "/api/settings/recompute-distances"
    );
    expect(recomputeCall).toBeDefined();
    expect(recomputeCall!.init.method).toBe("POST");
  });
});
