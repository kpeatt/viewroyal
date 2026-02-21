/**
 * OCD sub-router.
 *
 * Mounts all Open Civic Data endpoints under `/api/ocd/:municipality/`.
 * Uses the municipality middleware for slug resolution but does NOT apply
 * apiKeyAuth or rateLimit -- OCD endpoints are publicly accessible.
 *
 * Discovery endpoint at `GET /:municipality/` lists all available entity URLs.
 */

import { Hono } from "hono";
import type { ApiEnv } from "../types";
import { municipality } from "../middleware/municipality";

// Endpoint handlers
import { listJurisdictions, getJurisdiction } from "./endpoints/jurisdictions";
import { listOrganizations, getOrganization } from "./endpoints/organizations";
import { listPeople, getPerson } from "./endpoints/people";

const ocdApp = new Hono<ApiEnv>();

// Municipality middleware for all OCD routes
ocdApp.use("/:municipality/*", municipality);

// Discovery endpoint -- lists all available OCD entity URLs
ocdApp.get("/:municipality/", (c) => {
  const slug = c.req.param("municipality");
  return c.json({
    jurisdictions_url: `/api/ocd/${slug}/jurisdictions`,
    organizations_url: `/api/ocd/${slug}/organizations`,
    people_url: `/api/ocd/${slug}/people`,
    events_url: `/api/ocd/${slug}/events`,
    bills_url: `/api/ocd/${slug}/bills`,
    votes_url: `/api/ocd/${slug}/votes`,
  });
});

// Jurisdiction routes
ocdApp.get("/:municipality/jurisdictions", listJurisdictions);
ocdApp.get("/:municipality/jurisdictions/:id{.+}", getJurisdiction);

// Organization routes
ocdApp.get("/:municipality/organizations", listOrganizations);
ocdApp.get("/:municipality/organizations/:id{.+}", getOrganization);

// People routes
ocdApp.get("/:municipality/people", listPeople);
ocdApp.get("/:municipality/people/:id{.+}", getPerson);

// Plan 03 will add:
// - Event routes (GET /:municipality/events, GET /:municipality/events/:id)
// - Bill routes (GET /:municipality/bills, GET /:municipality/bills/:id)
// - Vote routes (GET /:municipality/votes, GET /:municipality/votes/:id)

export default ocdApp;
