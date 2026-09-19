// An error that already knows which HTTP status it should become.
// Route handlers hand it to apiErrorResponse (src/lib/api-route.ts).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    // Extra JSON fields for the response body, beside `error`. Used by the
    // conflict answers a client acts on: `{ error: "Stale key", keyVersion }`.
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}
