// Finds the listing link in text a person pasted or shared (#190). Pure.
import { emptyApartment, type Apartment } from "./types";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

export function firstHttpUrl(text: string): string | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const candidate = match[0].replace(/[.,;:!?)]+$/, "");
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return candidate;
    } catch {
      // Not a URL; try the next one.
    }
  }
  return null;
}

export function isHttpUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// An apartment made from a link alone (#413): a pasted or shared link, or a
// draft saved before #413. Not processed, so it costs nothing until someone
// adds its address or its PDF. Named after the page's title when there is
// one, else the site it is on.
export function apartmentFromLink(url: string, title: string | null): Apartment {
  return { ...emptyApartment(title?.trim() || hostOf(url)), listingUrl: url };
}
