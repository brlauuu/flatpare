import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let installState = "prompt";
const promptInstallMock = vi.fn(async () => {});
vi.mock("../install-prompt", () => ({
  useInstallState: () => installState,
  promptInstall: () => promptInstallMock(),
}));

let InstallHint: typeof import("../install-hint").InstallHint;
let INSTALL_HINT_KEY: string;

// The visit-long dismissal lives at module level, so each test loads a
// fresh copy.
beforeEach(async () => {
  vi.resetModules();
  ({ InstallHint, INSTALL_HINT_KEY } = await import("../install-hint"));
  installState = "prompt";
  promptInstallMock.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InstallHint", () => {
  it("on Android, offers the install that makes sharing possible", async () => {
    const user = userEvent.setup();
    render(<InstallHint />);
    expect(await screen.findByText("Install Flatpare to add apartments from other apps.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(promptInstallMock).toHaveBeenCalledTimes(1);
  });

  it("on an iPhone, mentions Paste link and shows how to install", async () => {
    installState = "ios";
    const user = userEvent.setup();
    render(<InstallHint />);
    expect(
      await screen.findByText("Add Flatpare to your Home Screen, then add listings with Paste link.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("tap Paste link on the Apartments page");
    expect(promptInstallMock).not.toHaveBeenCalled();
  });

  it.each(["installed", "none"])("shows nothing when the state is %s", async (state) => {
    installState = state;
    render(<InstallHint />);
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays hidden once dismissed", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstallHint />);
    await user.click(await screen.findByRole("button", { name: "Hide this tip" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.localStorage.getItem(INSTALL_HINT_KEY)).toBe("1");
    unmount();
    render(<InstallHint />);
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("works when storage is refused, hiding for this visit only", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const user = userEvent.setup();
    render(<InstallHint />);
    await user.click(await screen.findByRole("button", { name: "Hide this tip" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
