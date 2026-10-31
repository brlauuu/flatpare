import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let UsageNotice: typeof import("../usage-notice").UsageNotice;
let USAGE_NOTICE_KEY: string;

// The visit-long dismissal lives at module level, so each test loads a
// fresh copy.
beforeEach(async () => {
  vi.resetModules();
  ({ UsageNotice, USAGE_NOTICE_KEY } = await import("../usage-notice"));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// #468: every member is told once that processing is counted per household.
describe("UsageNotice", () => {
  it("says what is counted, per household, and links to the guide", async () => {
    render(<UsageNotice />);
    const notice = await screen.findByRole("region", { name: "What we count" });
    expect(notice).toHaveTextContent(
      "Flatpare counts how many PDFs, addresses and listing links each household has processed"
    );
    expect(notice).toHaveTextContent("never per person");
    expect(screen.getByRole("link", { name: "More in the guide" })).toHaveAttribute("href", "/guide");
  });

  it("stays hidden once dismissed", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<UsageNotice />);
    await user.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem(USAGE_NOTICE_KEY)).toBe("1");
    unmount();
    render(<UsageNotice />);
    await act(async () => {});
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("works when storage is refused, hiding for this visit only", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const user = userEvent.setup();
    render(<UsageNotice />);
    await user.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("region")).toBeNull();
  });
});
