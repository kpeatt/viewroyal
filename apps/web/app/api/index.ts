import { Hono } from "hono";
import { cors } from "hono/cors";
import { fromHono } from "chanfana";
import type { ApiEnv } from "./types";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";
import { municipality } from "./middleware/municipality";
import { apiKeyAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rate-limit";
import { HealthEndpoint } from "./endpoints/health";
import { TestAuthEndpoint } from "./endpoints/test-auth";

// Create the base Hono app
const app = new Hono<ApiEnv>();

// Request ID middleware (first, before all others)
app.use("*", requestId);

// CORS for all API routes
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["X-API-Key", "Content-Type"],
    exposeHeaders: ["X-Request-Id", "X-RateLimit-Limit", "Retry-After"],
    maxAge: 86400,
  }),
);

// Global error handler
app.onError(errorHandler);

// Not found handler - consistent error JSON
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `The requested endpoint ${c.req.method} ${c.req.path} does not exist`,
        status: 404,
      },
    },
    404,
  );
});

// Initialize chanfana OpenAPI router
const openapi = fromHono(app, {
  base: "/api/v1",
  docs_url: "/api/v1/docs",
  openapi_url: "/api/v1/openapi.json",
  openapiVersion: "3.1",
  schema: {
    info: {
      title: "ViewRoyal.ai API",
      version: "1.0.0",
      description: "Public API for ViewRoyal.ai civic intelligence platform",
    },
  },
});

// Health endpoint (no municipality scope)
openapi.get("/api/v1/health", HealthEndpoint);

// Municipality-scoped routes: health is unauthenticated
app.use("/api/v1/:municipality/health", municipality);
openapi.get("/api/v1/:municipality/health", HealthEndpoint);

// Authenticated, rate-limited, municipality-scoped routes
app.use("/api/v1/:municipality/test", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/test", TestAuthEndpoint);

export default app;
