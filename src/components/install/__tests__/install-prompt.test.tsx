import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";

// The module keeps the browser's event at module level, so each test loads a
// fresh copy.
async function load() {
  vi.resetModules();
  return import("../install-prompt");
}

function installPromptEvent() {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
  };
  event.prompt = vi.fn(async () => {});
  return event;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the install prompt store", () => {
  it("has nothing to offer before the browser fires its event", async () => {
    const { useInstallState } = await load();
    const { result } = renderHook(() => useInstallState());
    expect(result.current).toBe("none");
  });

  it("keeps the browser's event, suppresses its banner, and offers it once", async () => {
    const { useInstallState, promptInstall } = await load();
    const { result } = renderHook(() => useInstallState());
    const event = installPromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current).toBe("prompt");

    await act(() => promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("none");
    // A second call has no event left to use.
    await act(() => promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("survives a browser that refuses the prompt", async () => {
    const { useInstallState, promptInstall } = await load();
    const { result } = renderHook(() => useInstallState());
    const event = installPromptEvent();
    event.prompt.mockRejectedValue(new Error("already shown"));
    act(() => {
      window.dispatchEvent(event);
    });
    await act(() => promptInstall());
    expect(result.current).toBe("none");
  });

  it("is installed once the browser says so", async () => {
    const { useInstallState } = await load();
    const { result } = renderHook(() => useInstallState());
    act(() => {
      window.dispatchEvent(installPromptEvent());
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current).toBe("installed");
  });

  it("is installed when opened as the installed app", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }));
    const { useInstallState } = await load();
    const { result } = renderHook(() => useInstallState());
    expect(result.current).toBe("installed");
  });

  it("knows an iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
    );
    const { useInstallState } = await load();
    const { result } = renderHook(() => useInstallState());
    expect(result.current).toBe("ios");
  });
});
