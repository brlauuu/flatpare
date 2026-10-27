import { describe, it, expect } from "vitest";
import { firstHttpUrl, hostOf } from "../links";

describe("firstHttpUrl", () => {
  it("finds a link in prose and strips trailing punctuation", () => {
    expect(firstHttpUrl("see https://homegate.ch/x/1.")).toBe("https://homegate.ch/x/1");
    expect(firstHttpUrl("(https://a.ch/b)")).toBe("https://a.ch/b");
  });
  it("refuses anything that is not http(s)", () => {
    expect(firstHttpUrl("javascript:alert(1)")).toBeNull();
    expect(firstHttpUrl("homegate.ch/1")).toBeNull();
    expect(firstHttpUrl("ftp://a/b")).toBeNull();
  });
  it("returns the first of two links", () => {
    expect(firstHttpUrl("http://a.ch/1 and https://b.ch/2")).toBe("http://a.ch/1");
  });
});

describe("hostOf", () => {
  it("returns the hostname", () => {
    expect(hostOf("https://www.example.ch/listing/42?x=1")).toBe("www.example.ch");
  });
  it("returns the input when it is not a URL", () => {
    expect(hostOf("not a url")).toBe("not a url");
  });
});
