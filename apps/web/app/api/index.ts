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
import { ListMeetings } from "./endpoints/meetings/list";
import { GetMeeting } from "./endpoints/meetings/detail";
import { ListPeople } from "./endpoints/people/list";
import { GetPerson } from "./endpoints/people/detail";
import { ListMatters } from "./endpoints/matters/list";
import { GetMatter } from "./endpoints/matters/detail";
import { ListMotions } from "./endpoints/motions/list";
import { GetMotion } from "./endpoints/motions/detail";
import { ListBylaws } from "./endpoints/bylaws/list";
import { GetBylaw } from "./endpoints/bylaws/detail";

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

// Meetings
app.use("/api/v1/:municipality/meetings", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/meetings", ListMeetings);
app.use(
  "/api/v1/:municipality/meetings/:slug",
  apiKeyAuth,
  rateLimit,
  municipality,
);
openapi.get("/api/v1/:municipality/meetings/:slug", GetMeeting);

// People
app.use("/api/v1/:municipality/people", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/people", ListPeople);
app.use(
  "/api/v1/:municipality/people/:slug",
  apiKeyAuth,
  rateLimit,
  municipality,
);
openapi.get("/api/v1/:municipality/people/:slug", GetPerson);

// Matters
app.use("/api/v1/:municipality/matters", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/matters", ListMatters);
app.use(
  "/api/v1/:municipality/matters/:slug",
  apiKeyAuth,
  rateLimit,
  municipality,
);
openapi.get("/api/v1/:municipality/matters/:slug", GetMatter);

// Motions
app.use("/api/v1/:municipality/motions", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/motions", ListMotions);
app.use(
  "/api/v1/:municipality/motions/:slug",
  apiKeyAuth,
  rateLimit,
  municipality,
);
openapi.get("/api/v1/:municipality/motions/:slug", GetMotion);

// Bylaws
app.use("/api/v1/:municipality/bylaws", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/bylaws", ListBylaws);
app.use(
  "/api/v1/:municipality/bylaws/:slug",
  apiKeyAuth,
  rateLimit,
  municipality,
);
openapi.get("/api/v1/:municipality/bylaws/:slug", GetBylaw);

export default app;
