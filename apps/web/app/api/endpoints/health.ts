import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../types";
import type { Context } from "hono";

export class HealthEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["System"],
    summary: "Health check",
    description:
      "Returns the current health status of the API. When called with a municipality slug, includes the municipality name.",
    responses: {
      "200": {
        description: "API is healthy",
        content: {
          "application/json": {
            schema: z.object({
              status: z.literal("ok"),
              municipality: z.string().nullable(),
              timestamp: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const muni = c.get("municipality");
    return c.json({
      status: "ok" as const,
      municipality: muni?.name ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
