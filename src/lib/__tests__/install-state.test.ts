import { describe, it, expect } from "vitest";
import { installState, isAppleTouchDevice } from "../install-state";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const facts = (over: Partial<Parameters<typeof installState>[0]>) => ({
  standalone: false,
  canPrompt: false,
  userAgent: ANDROID,
  maxTouchPoints: 5,
  ...over,
});

describe("installState", () => {
  it("is installed when running standalone, whatever else is true", () => {
    expect(installState(facts({ standalone: true, canPrompt: true }))).toBe("installed");
    expect(installState(facts({ standalone: true, userAgent: IPHONE }))).toBe("installed");
  });

  it("offers the browser's prompt when there is one", () => {
    expect(installState(facts({ canPrompt: true }))).toBe("prompt");
  });

  it("explains Add to Home Screen on an iPhone", () => {
    expect(installState(facts({ userAgent: IPHONE }))).toBe("ios");
  });

  it("offers nothing without a prompt elsewhere", () => {
    expect(installState(facts({}))).toBe("none");
    expect(installState(facts({ userAgent: MAC, maxTouchPoints: 0 }))).toBe("none");
  });
});

describe("isAppleTouchDevice", () => {
  it("knows an iPad that asks for the desktop site by its touch screen", () => {
    expect(isAppleTouchDevice(MAC, 5)).toBe(true);
    expect(isAppleTouchDevice(MAC, 0)).toBe(false);
    expect(isAppleTouchDevice(IPHONE, 0)).toBe(true);
    expect(isAppleTouchDevice(ANDROID, 5)).toBe(false);
  });
});
