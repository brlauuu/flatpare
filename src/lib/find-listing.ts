import { google } from "@ai-sdk/google";
import { generateText, type ToolSet } from "ai";
import { aiAvailable, aiModel, aiProviderOptions, readAiConfig, type AiConfig } from "@/lib/ai-provider";
import { checkListingUrl } from "@/lib/listing-status";
import { scrubbedErrorLine } from "@/lib/log-scrub";
import { assertPublicHttpUrl, type LookupFn } from "@/lib/safe-url";

// Finding a listing's page again when the PDF's link is missing or dead
// (#409). The AI model searches the web with the listing's title, address,
// website and language, and the first link it finds is used, even though it
// may be the wrong one: the person sees it before saving.
//
// Which search runs follows the AI provider (#333):
// - "gateway" (flatpare.com): Google's Web Grounding for Enterprise, which
//   neither logs nor stores what it is sent. Its index is a subset of the web,
//   so a very new listing may not be found; nothing falls back to a search
//   that keeps data.
// - "google" (self-hosted default): Grounding with Google Search, under the
//   same Gemini API terms as the PDF reading (Google keeps reliability logs
//   for up to 3 days).

// What the PDF says about where the listing was published. Read by the
// extraction alongside the apartment's facts, never shown or stored.
export interface ListingHints {
  name: string;
  address: string | null;
  site: string | null;
  language: string | null;
}

// Google answers grounding sources with its own redirect links, which expire;
// the listing's address is where they point.
const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const REQUEST_TIMEOUT_MS = 10_000;

export function listingSearchPrompt(hints: ListingHints): string {
  const facts = [
    `Title: ${hints.name}`,
    hints.address ? `Address: ${hints.address}` : null,
    hints.site ? `Published on: ${hints.site}` : null,
  ].filter((line): line is string => line !== null);
  const language = hints.language ? ` Search in the listing's language (${hints.language}).` : "";
  return `Find the web page of this apartment rental listing.${language}
Prefer the website it was published on, and the town in its address.
${facts.join("\n")}
Answer with the URL of the listing page only, or NONE if you found no page for this listing.`;
}

function searchTools(config: AiConfig): ToolSet {
  return config.provider === "gateway"
    ? { enterprise_web_search: google.tools.enterpriseWebSearch({}) }
    : { google_search: google.tools.googleSearch({}) };
}

function httpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// The candidates in the order they are tried: the pages the search returned,
// first result first (the issue's rule), then the URL the model answered
// with. The model's own answer comes last because it can be invented; a
// search result is a page that exists.
export function candidateUrls(text: string, sources: readonly { url?: string }[]): URL[] {
  const answered = text.match(/https?:\/\/[^\s<>"')\]]+/)?.[0]?.replace(/[.,;:!?]+$/, "");
  const all = [...sources.map((s) => s.url), answered];
  const seen = new Set<string>();
  const out: URL[] = [];
  for (const raw of all) {
    const url = raw ? httpUrl(raw) : null;
    if (url && !seen.has(url.href)) {
      seen.add(url.href);
      out.push(url);
    }
  }
  return out;
}

// One hop of a grounding redirect, read without following it, through the
// same SSRF belt as every other outbound request.
async function resolveGroundingRedirect(
  url: URL,
  fetchImpl: typeof fetch,
  lookup?: LookupFn
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const safe = await assertPublicHttpUrl(url.href, lookup);
    const res = await fetchImpl(safe, { method: "GET", redirect: "manual", signal: controller.signal });
    const location = res.headers?.get("location");
    if (!location) return null;
    const next = httpUrl(new URL(location, safe).href);
    return next && next.hostname !== GROUNDING_REDIRECT_HOST ? next.href : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface FindListingDeps {
  check?: typeof checkListingUrl;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

// The first candidate that is not known to be gone; null when none is.
export async function pickListingUrl(
  candidates: URL[],
  { check = checkListingUrl, fetchImpl = fetch, lookup }: FindListingDeps = {}
): Promise<string | null> {
  for (const candidate of candidates) {
    const url =
      candidate.hostname === GROUNDING_REDIRECT_HOST
        ? await resolveGroundingRedirect(candidate, fetchImpl, lookup)
        : candidate.href;
    if (url && (await check(url)) !== true) return url;
  }
  return null;
}

// Searches for the listing; null when nothing usable was found. Throws when
// the search call itself fails, which the caller treats as "not found".
export async function findListingUrl(hints: ListingHints, deps: FindListingDeps = {}): Promise<string | null> {
  const config = readAiConfig();
  if (!aiAvailable(config)) return null;
  const result = await generateText({
    model: aiModel(config),
    providerOptions: aiProviderOptions(config),
    tools: searchTools(config),
    prompt: listingSearchPrompt(hints),
  });
  const sources = result.sources.filter((s) => s.sourceType === "url");
  return pickListingUrl(candidateUrls(result.text, sources), deps);
}

export interface ListingRepair {
  listingUrl: string | null;
  // True when the link came from the search rather than the PDF.
  found: boolean;
}

// Keeps the PDF's link unless it is missing or known to be gone; then
// searches. A link we cannot check (the site blocks probes) is kept, so a
// search is paid for only when it can help. When the search finds nothing,
// the PDF's link stays, dead or not (decided on #409).
export async function repairListingUrl(
  listingUrl: string | null,
  hints: ListingHints,
  find: (hints: ListingHints) => Promise<string | null> = findListingUrl,
  check: typeof checkListingUrl = checkListingUrl
): Promise<ListingRepair> {
  if (listingUrl && httpUrl(listingUrl) && (await check(listingUrl)) !== true) {
    return { listingUrl, found: false };
  }
  let found: string | null = null;
  try {
    found = await find(hints);
  } catch (err) {
    // The class and status only: the provider's message can quote the request.
    console.error(`[process:parse-pdf] listing search failed: ${scrubbedErrorLine(err)}`);
  }
  return found ? { listingUrl: found, found: true } : { listingUrl, found: false };
}
