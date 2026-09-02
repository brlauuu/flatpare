import { describe, it, expect, beforeEach } from "vitest";
import { verifyPassword } from "../auth";

beforeEach(() => {
  process.env.APP_PASSWORD = "secret123";
});

describe("verifyPassword", () => {
  it("returns true for correct password", () => {
    process.env.APP_PASSWORD = "secret123";
    expect(verifyPassword("secret123")).toBe(true);
  });

  it("returns false for incorrect password", () => {
    process.env.APP_PASSWORD = "secret123";
    expect(verifyPassword("wrong")).toBe(false);
  });

  it("returns false when APP_PASSWORD is undefined", () => {
    delete process.env.APP_PASSWORD;
    expect(verifyPassword("anything")).toBe(false);
  });
});

describe("verifyPassword — timing safety", () => {
  it("returns false for empty input", () => {
    expect(verifyPassword("")).toBe(false);
  });

  it("returns false for a password differing only in length", () => {
    expect(verifyPassword("secret123extra")).toBe(false);
    expect(verifyPassword("secret12")).toBe(false);
  });
});
