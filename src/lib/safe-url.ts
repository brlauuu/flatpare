import { lookup as dnsLookup } from "node:dns/promises";

// The belt around the one place the server fetches a URL the user typed
// (`checkListingUrl`, behind POST /api/process/check-listing). Before E1 that
// endpoint sat behind a shared password, so the only callers were one trusted
// household; with open registration anyone can point it at anything. The
// response leaks only `gone: true | false | null`, but that tri-state
// separates 404/410 from 2xx-3xx from connect-error, which is a serviceable
// port-and-host oracle against whatever the deployment can reach — a home LAN,
// for a self-hosted container (#199).
//
// This module has no app imports on purpose: it is a leaf, so anything that
// makes an outbound request on a user's behalf can use it.

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnsafeUrlError";
  }
}

export type LookupFn = (
  host: string
) => Promise<Array<{ address: string; family: number }>>;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    // No leading zeros: "010" is octal to some resolvers and decimal to
    // others, and that disagreement is itself a bypass.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [first, last], inclusive. Everything the IANA special-purpose registry
// marks as not-globally-reachable, plus multicast and the reserved top of
// the space, collapsed into the ranges that matter for an outbound probe.
const V4_BLOCKED: Array<[number, number]> = (
  [
    ["0.0.0.0", "0.255.255.255"], // "this network"
    ["10.0.0.0", "10.255.255.255"], // RFC1918
    ["100.64.0.0", "100.127.255.255"], // CGNAT
    ["127.0.0.0", "127.255.255.255"], // loopback
    ["169.254.0.0", "169.254.255.255"], // link-local — cloud metadata lives here
    ["172.16.0.0", "172.31.255.255"], // RFC1918
    ["192.0.0.0", "192.0.0.255"], // IETF protocol assignments
    ["192.0.2.0", "192.0.2.255"], // TEST-NET-1
    ["192.168.0.0", "192.168.255.255"], // RFC1918
    ["198.18.0.0", "198.19.255.255"], // benchmarking
    ["198.51.100.0", "198.51.100.255"], // TEST-NET-2
    ["203.0.113.0", "203.0.113.255"], // TEST-NET-3
    ["224.0.0.0", "255.255.255.255"], // multicast, reserved, broadcast
  ] as Array<[string, string]>
).map(([lo, hi]) => [ipv4ToInt(lo)!, ipv4ToInt(hi)!]);

// True for anything that is not a globally-routable unicast address — and
// for anything this function cannot parse. Unparseable means "I don't know
// what this resolves to", and the safe answer to that is no.
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.trim().replace(/^\[|\]$/g, "");
  if (bare === "") return true;

  // An IPv4-mapped IPv6 address ("::ffff:127.0.0.1") reaches the IPv4 host,
  // so it must be judged as its IPv4 half.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(bare);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = ipv4ToInt(bare);
  if (v4 !== null) return V4_BLOCKED.some(([lo, hi]) => v4 >= lo && v4 <= hi);

  if (!bare.includes(":")) return true; // not an IP at all
  const v6 = bare.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // unique local fc00::/7
  return false;
}

// Throws UnsafeUrlError unless `raw` is an http(s) URL whose host resolves
// exclusively to public addresses. Returns the parsed URL so the caller
// fetches exactly what was validated rather than re-parsing the string.
//
// Accepted limit: DNS rebinding between this lookup and the caller's fetch
// (TOCTOU). Closing it needs a custom agent that pins the connection to the
// resolved address, which breaks TLS SNI and name-based virtual hosting.
// Documented in docs/security-notes.md rather than solved here.
export async function assertPublicHttpUrl(
  raw: string,
  lookup: LookupFn = (host) => dnsLookup(host, { all: true })
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a URL");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError("scheme not allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal address never reaches the resolver, so judge it directly —
  // otherwise `lookup("127.0.0.1")` would be the thing deciding. Test for a
  // parseable IP, not merely a leading digit: "1and1.example.com" is a
  // hostname and must still go to DNS. Decimal and octal spellings of an
  // IPv4 address ("http://2130706433/") need no special handling — the
  // WHATWG URL parser has already normalized `url.hostname` to dotted quad.
  if (ipv4ToInt(host) !== null || host.includes(":")) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("private address");
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host);
  } catch {
    throw new UnsafeUrlError("host did not resolve");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("host did not resolve");
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("private address");
  }
  return url;
}
