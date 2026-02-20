import type { ErrorHandler } from "hono";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";

/**
 * Global error handler for the Hono API app.
 *
 * - Catches ApiError and returns its JSON with correct status.
 * - Catches chanfana InputValidationException and reformats to consistent shape.
 * - Catches all other errors and returns 500 INTERNAL_ERROR.
 */
export const errorHandler: ErrorHandler<ApiEnv> = (err, c) => {
  // Known API errors
  if (err instanceof ApiError) {
    if (err.headers) {
      for (const [key, value] of Object.entries(err.headers)) {
        c.header(key, value);
      }
    }
    return c.json(err.toJSON(), err.status as 400);
  }

  // chanfana validation errors
  if (
    err.name === "InputValidationException" ||
    (err.message && err.message.includes("validation"))
  ) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.message || "Request validation failed",
          status: 400,
        },
      },
      400,
    );
  }

  // Unexpected errors
  console.error("[API] Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        status: 500,
      },
    },
    500,
  );
};
