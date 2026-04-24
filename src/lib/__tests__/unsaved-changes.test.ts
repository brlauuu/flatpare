import { describe, it, expect, afterEach } from "vitest";
import {
  getUnsavedRating,
  setUnsavedRating,
} from "@/lib/unsaved-changes";

afterEach(() => {
  setUnsavedRating(false);
});

describe("unsaved-changes", () => {
  it("defaults to false", () => {
    expect(getUnsavedRating()).toBe(false);
  });

  it("setUnsavedRating(true) flips the flag to true", () => {
    setUnsavedRating(true);
    expect(getUnsavedRating()).toBe(true);
  });

  it("setUnsavedRating(false) flips the flag back to false", () => {
    setUnsavedRating(true);
    setUnsavedRating(false);
    expect(getUnsavedRating()).toBe(false);
  });
});
