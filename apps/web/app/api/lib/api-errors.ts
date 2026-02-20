/**
 * Consistent API error class.
 *
 * All API error responses use the shape:
 *   { error: { code, message, status } }
 *
 * Error codes use SCREAMING_SNAKE_CASE.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
      },
    };
  }
}
