export class AppError extends Error {
  constructor(
    public readonly status:
      | 400
      | 401
      | 402
      | 403
      | 404
      | 409
      | 415 // unsupported media type — a file we cannot parse
      | 422
      | 429
      | 500
      | 502
      | 503
      | 504,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
