// A log line for an error that may have touched request content.
//
// Under E4 the /api/process/* endpoints are the documented privacy
// exception: they see plaintext the user actively submits — an address, a
// listing URL, a PDF — so that the server can call Gemini or Google Maps on
// the client's behalf. The spec's first requirement is that none of that
// reaches a log on ANY path, errors included, and an error thrown from an
// outbound fetch routinely carries the request URL. For geocode that URL's
// query string holds both the plaintext address and GOOGLE_MAPS_API_KEY.
//
// The error's class and a numeric status are enough to tell a timeout from a
// 429 from a parse failure, and are the only two fields provably free of
// request-derived text. Everything else — message, stack, cause — is not.
export function scrubbedErrorLine(err: unknown): string {
  if (!(err instanceof Error)) return "NonError";
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? `${err.name} status=${status}` : err.name;
}
