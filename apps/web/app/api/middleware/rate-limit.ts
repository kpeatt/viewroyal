import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";

/**
 * Rate limiting middleware using Cloudflare Workers Rate Limit binding.
 *
 * Expects auth middleware to run first (sets apiKeyId in context).
 * Rate limits are scoped per API key for fair usage.
 *
 * Uses the API_RATE_LIMITER binding configured in wrangler.toml.
 */
export const rateLimit = createMiddleware<ApiEnv>(async (c, next) => {
  const apiKeyId = c.get("apiKeyId");

  // Rate limiter binding from wrangler.toml [[ratelimits]]
  const limiter = c.env.API_RATE_LIMITER;

  if (limiter && apiKeyId) {
    const { success } = await limiter.limit({ key: `api:${apiKeyId}` });

    if (!success) {
      throw new ApiError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "Rate limit exceeded. Please wait before making more requests.",
        { "Retry-After": "60" },
      );
    }
  }

  // Add rate limit headers to response
  c.header("X-RateLimit-Limit", "100");

  await next();
});
