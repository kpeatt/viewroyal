import { Hono } from "hono";
import { cors } from "hono/cors";
import { fromHono } from "chanfana";
import { z } from "zod";
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
import { SearchEndpoint } from "./endpoints/search";
import ocdApp from "./ocd/router";

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
// NOTE: docs_url and openapi_url are relative to `base` -- chanfana prepends base automatically.
// Using "/docs" and "/openapi.json" produces /api/v1/docs and /api/v1/openapi.json.
const openapi = fromHono(app, {
  base: "/api/v1",
  docs_url: "/docs",
  openapi_url: "/openapi.json",
  openapiVersion: "3.1",
  schema: {
    info: {
      title: "ViewRoyal.ai API",
      version: "1.0.0",
      description:
        "Public API for the ViewRoyal.ai civic intelligence platform.\n\n" +
        "Provides access to council meeting data, people, matters, motions, bylaws, " +
        "and cross-content search for the Town of View Royal, BC.\n\n" +
        "**Authentication:** Pass your API key in the `X-API-Key` header or as a `?apikey=` query parameter. " +
        "Get your key at [/settings/api-keys](/settings/api-keys).\n\n" +
        "**Open Civic Data:** OCD-standard endpoints are available under the OCD tag for civic tech interoperability.",
    },
    tags: [
      { name: "System", description: "Health checks and API status" },
      {
        name: "Meetings",
        description: "Council meeting agendas, minutes, and attendance",
      },
      {
        name: "People",
        description: "Council members, staff, and their voting records",
      },
      {
        name: "Matters",
        description: "Agenda matters, issues, and their lifecycle",
      },
      {
        name: "Motions",
        description: "Motions, resolutions, and roll call votes",
      },
      { name: "Bylaws", description: "Municipal bylaws and their status" },
      { name: "Search", description: "Cross-content keyword search" },
      {
        name: "OCD",
        description:
          "Open Civic Data specification endpoints for civic tech interoperability",
      },
    ],
  },
});

// Register API key security scheme
openapi.registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description:
    "API key for authentication. Get your key at /settings/api-keys. " +
    "Alternatively, pass as ?apikey= query parameter.",
});

// Register shared error response schema
openapi.registry.registerComponent("schemas", "ApiError", {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "NOT_FOUND" },
        message: { type: "string", example: "Resource not found" },
        status: { type: "integer", example: 404 },
      },
      required: ["code", "message", "status"],
    },
  },
  required: ["error"],
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

// Search
app.use("/api/v1/:municipality/search", apiKeyAuth, rateLimit, municipality);
openapi.get("/api/v1/:municipality/search", SearchEndpoint);

// OCD interoperability endpoints (public, no auth/rate-limit)
app.route("/api/ocd", ocdApp);

// Register OCD endpoints in the OpenAPI spec for documentation.
// These paths are outside the chanfana base (/api/v1) but registerPath
// adds them to the spec JSON regardless.
const ocdEntities = [
  { name: "jurisdictions", singular: "jurisdiction" },
  { name: "organizations", singular: "organization" },
  { name: "people", singular: "person" },
  { name: "events", singular: "event" },
  { name: "bills", singular: "bill" },
  { name: "votes", singular: "vote" },
] as const;

for (const entity of ocdEntities) {
  // List endpoint
  openapi.registry.registerPath({
    method: "get",
    path: `/api/ocd/{municipality}/${entity.name}`,
    tags: ["OCD"],
    summary: `List OCD ${entity.name}`,
    description: `Returns a paginated list of OCD ${entity.name} for the given municipality.`,
    request: {
      params: z.object({ municipality: z.string() }),
      query: z.object({
        page: z.number().int().optional().default(1),
        per_page: z.number().int().optional().default(20),
      }),
    },
    responses: {
      "200": { description: `Paginated list of OCD ${entity.name}` },
    },
  });

  // Detail endpoint
  openapi.registry.registerPath({
    method: "get",
    path: `/api/ocd/{municipality}/${entity.name}/{id}`,
    tags: ["OCD"],
    summary: `Get OCD ${entity.singular} by ID`,
    description: `Returns a single OCD ${entity.singular} by its OCD identifier.`,
    request: {
      params: z.object({ municipality: z.string(), id: z.string() }),
    },
    responses: {
      "200": { description: `OCD ${entity.singular} detail` },
    },
  });
}

export default app;
