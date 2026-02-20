import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../types";
import type { Context } from "hono";

/**
 * Test endpoint for verifying the auth + rate limit stack.
 *
 * Requires a valid API key. Returns the authenticated context
 * (API key ID, municipality, request ID) to confirm everything works.
 *
 * Path: /api/v1/:municipality/test
 */
export class TestAuthEndpoint extends OpenAPIRoute {
  schema = {
    summary: "Test authenticated endpoint",
    description:
      "Returns API key info and municipality context. Requires valid API key.",
    responses: {
      "200": {
        description: "Authentication successful",
        content: {
          "application/json": {
            schema: z.object({
              authenticated: z.literal(true),
              apiKeyId: z.string(),
              municipality: z.string().nullable(),
              requestId: z.string(),
            }),
          },
        },
      },
      "401": {
        description: "Missing or invalid API key",
      },
      "429": {
        description: "Rate limit exceeded",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const muni = c.get("municipality");
    return c.json({
      authenticated: true as const,
      apiKeyId: c.get("apiKeyId") ?? "",
      municipality: muni?.name ?? null,
      requestId: c.get("requestId"),
    });
  }
}
