import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";

/**
 * Generates a unique request ID for every API request.
 * Stored in context variables and added as X-Request-Id response header.
 */
export const requestId = createMiddleware<ApiEnv>(async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
