export interface ErrorDetails {
  status?: number;
  url?: string;
  message?: string;
  stack?: string;
  timestamp: string;
}

export async function fetchErrorFromResponse(
  res: Response,
  url: string
): Promise<ErrorDetails> {
  let message: string | undefined;
  try {
    const cloned = res.clone();
    const data = (await cloned.json()) as { error?: unknown };
    if (typeof data?.error === "string") {
      message = data.error;
    }
  } catch {
    try {
      const text = await res.clone().text();
      if (text) message = text.slice(0, 500);
    } catch {
      // give up — status alone is the signal
    }
  }

  return {
    status: res.status,
    url,
    message: message ?? res.statusText ?? undefined,
    timestamp: new Date().toISOString(),
  };
}

export function fetchErrorFromException(
  err: unknown,
  url: string
): ErrorDetails {
  if (err instanceof Error) {
    return {
      url,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    };
  }
  return {
    url,
    message: String(err),
    timestamp: new Date().toISOString(),
  };
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
