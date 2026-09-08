// Thin fetch wrappers for the envelope routes. Every non-2xx becomes an
// ApiClientError carrying the status and the parsed JSON body, so callers
// can branch on `status === 409 && message === "Stale version"`.
export class ApiClientError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message =
      typeof record.error === "string" ? record.error : `Request failed (${res.status})`;
    throw new ApiClientError(res.status, message, record);
  }
  return body as T;
}

export async function getJson<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url));
}

export async function sendJson<T>(
  method: "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown
): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}
