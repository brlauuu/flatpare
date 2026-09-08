import { describe, it, expect } from "vitest";
import { isPrivateAddress, assertPublicHttpUrl, UnsafeUrlError } from "../safe-url";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("isPrivateAddress", () => {
  it("flags the ranges an SSRF probe would aim at", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud instance metadata
      "0.0.0.0",
      "100.64.0.1", // CGNAT
      "198.18.0.1", // benchmarking
      "224.0.0.1", // multicast
      "255.255.255.255",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.32.0.1", // just outside RFC1918's 172.16/12
      "172.15.255.255", // just below it
      "192.169.0.1", // just outside 192.168/16
      "100.128.0.1", // just outside CGNAT
      "2606:4700::1111",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("treats an unparseable address as private rather than guessing", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects a non-http scheme", async () => {
    for (const raw of ["file:///etc/passwd", "gopher://x/", "ftp://x/", "data:text/plain,hi"]) {
      await expect(assertPublicHttpUrl(raw, publicLookup), raw).rejects.toThrow(UnsafeUrlError);
    }
  });

  it("rejects a string that is not a URL at all", async () => {
    await expect(assertPublicHttpUrl("not a url", publicLookup)).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a literal private host without touching DNS", async () => {
    let called = false;
    const lookup = async () => {
      called = true;
      return [{ address: "93.184.216.34", family: 4 }];
    };
    await expect(
      assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/", lookup)
    ).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://127.0.0.1:8080/", lookup)).rejects.toThrow(
      UnsafeUrlError
    );
    await expect(assertPublicHttpUrl("http://[::1]:9200/", lookup)).rejects.toThrow(UnsafeUrlError);
    expect(called).toBe(false);
  });

  it("rejects a hostname that resolves into a private range", async () => {
    const lookup = async () => [{ address: "10.1.2.3", family: 4 }];
    await expect(assertPublicHttpUrl("http://internal.example.com/", lookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("rejects when any answer in a round-robin is private", async () => {
    // One private answer is still a usable oracle, so all must be public.
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(assertPublicHttpUrl("http://split.example.com/", lookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("rejects a host that does not resolve", async () => {
    const lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(assertPublicHttpUrl("https://nope.example/", lookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("rejects a host that resolves to nothing", async () => {
    await expect(assertPublicHttpUrl("https://empty.example/", async () => [])).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("returns the parsed URL for a public host", async () => {
    const url = await assertPublicHttpUrl("https://example.com/ad/1?x=2", publicLookup);
    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/ad/1");
  });

  it("sends a hostname that merely starts with a digit to DNS", async () => {
    // "1and1.example.com" is a hostname, not an address: a leading-digit
    // test would refuse it outright.
    let asked = "";
    const lookup = async (host: string) => {
      asked = host;
      return [{ address: "93.184.216.34", family: 4 }];
    };
    const url = await assertPublicHttpUrl("https://1and1.example.com/ad", lookup);
    expect(asked).toBe("1and1.example.com");
    expect(url.hostname).toBe("1and1.example.com");
  });

  it("catches an IPv4 address spelled as a single decimal", async () => {
    // The WHATWG URL parser normalizes http://2130706433/ to 127.0.0.1
    // before we ever see the hostname.
    await expect(assertPublicHttpUrl("http://2130706433/", publicLookup)).rejects.toThrow(
      UnsafeUrlError
    );
    await expect(assertPublicHttpUrl("http://0177.0.0.1/", publicLookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("allows a public literal IP", async () => {
    const url = await assertPublicHttpUrl("http://8.8.8.8/probe", publicLookup);
    expect(url.hostname).toBe("8.8.8.8");
  });
});
