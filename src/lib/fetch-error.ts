export interface ErrorDetails {
  status?: number;
  url?: string;
  message?: string;
  stack?: string;
  timestamp: string;
}

// For errors thrown by the household store or a process client rather than
// by a fetch the page made itself: no URL to report, but ApiClientError and
// ParsePdfError carry the HTTP status, which is worth surfacing.
export function errorDetailsFromException(err: unknown): ErrorDetails {
  const status =
    typeof err === "object" && err !== null && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  if (err instanceof Error) {
    return { status, message: err.message, stack: err.stack, timestamp: new Date().toISOString() };
  }
  return { status, message: String(err), timestamp: new Date().toISOString() };
}

export function serializeErrorDetails(
  headline: string,
  details: ErrorDetails
): string {
  const lines = [headline];
  if (details.status !== undefined) lines.push(`Status: ${details.status}`);
  if (details.url) lines.push(`URL: ${details.url}`);
  if (details.message) lines.push(`Message: ${details.message}`);
  if (details.timestamp) lines.push(`Time: ${details.timestamp}`);
  if (details.stack) lines.push("", "Stack:", details.stack);
  return lines.join("\n");
}
