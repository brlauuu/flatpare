// Finds the listing link in text a person pasted or shared (#190). Pure.

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
