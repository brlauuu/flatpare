type ParsePdfErrorReason = "quota" | "invalid_pdf" | "unknown";

interface ClassifiedParsePdfError {
  reason: ParsePdfErrorReason;
  message: string;
  retryAfterSeconds?: number;
  status: number;
}

const QUOTA_PATTERN = /quota|rate limit|too many requests|retry after/i;
const INVALID_PDF_PATTERN = /invalid|corrupt|unsupported|exceeded.*token|token.*exceed/i;

function extractRetryAfterSeconds(message: string): number | undefined {
  const seconds = message.match(/retry (?:after|in) (\d+)\s*(?:s|sec|seconds)\b/i);
  if (seconds) return clamp(parseInt(seconds[1], 10));

  const minutes = message.match(/retry (?:after|in) (\d+)\s*m(?:in(?:ute)?s?)?\b/i);
  if (minutes) return clamp(parseInt(minutes[1], 10) * 60);

  const hours = message.match(/retry (?:after|in) (\d+)\s*h(?:ours?)?\b/i);
  if (hours) return clamp(parseInt(hours[1], 10) * 3600);

  // Bare number (no unit) immediately after "retry after" defaults to seconds.
  const bare = message.match(/retry (?:after|in) (\d+)\b/i);
  if (bare) return clamp(parseInt(bare[1], 10));

  return undefined;
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 3600) return 3600;
  return n;
}

function formatQuotaMessage(retryAfter: number | undefined): string {
  if (retryAfter === undefined) {
    return "AI quota exceeded — try again shortly.";
  }
  if (retryAfter < 60) {
    return `AI quota exceeded — try again in ${retryAfter}s.`;
  }
  const m = Math.floor(retryAfter / 60);
  const s = retryAfter % 60;
  return s === 0
    ? `AI quota exceeded — try again in ${m}m.`
    : `AI quota exceeded — try again in ${m}m ${s}s.`;
}

function getStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
  }
  return undefined;
}

export function classifyParsePdfError(err: unknown): ClassifiedParsePdfError {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const status = getStatus(err);

  const isQuota = status === 429 || QUOTA_PATTERN.test(message);
  if (isQuota) {
    const retryAfterSeconds = extractRetryAfterSeconds(message);
    return {
      reason: "quota",
      message: formatQuotaMessage(retryAfterSeconds),
      retryAfterSeconds,
      status: 429,
    };
  }

  if (INVALID_PDF_PATTERN.test(message)) {
    return {
      reason: "invalid_pdf",
      message: "Couldn't read this PDF. It may be corrupted or an unsupported format.",
      status: 400,
    };
  }

  return {
    reason: "unknown",
    message: message ? `Parsing failed: ${message}` : "Parsing failed.",
    status: 500,
  };
}
