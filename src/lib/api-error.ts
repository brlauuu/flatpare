// An error that already knows which HTTP status it should become.
// Route handlers hand it to apiErrorResponse (src/lib/api-route.ts).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
