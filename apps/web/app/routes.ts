import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("meetings", "routes/meetings.tsx"),
  route("meetings/:id", "routes/meeting-detail.tsx"),
  route("meetings/:id/explorer", "routes/meeting-explorer.tsx"),
  route("people", "routes/people.tsx"),
  route("people/:id", "routes/person-profile.tsx"),
  route("people/:id/votes", "routes/person-votes.tsx"),
  route("people/:id/proposals", "routes/person-proposals.tsx"),

  route("matters", "routes/matters.tsx"),
  route("matters/:id", "routes/matter-detail.tsx"),
  route("bylaws", "routes/bylaws.tsx"),
  route("bylaws/:id", "routes/bylaw-detail.tsx"),
  route("elections", "routes/elections.tsx"),
  route("elections/:id", "routes/election-detail.tsx"),
  route("search", "routes/search.tsx"),
  route("ask", "routes/ask.tsx"),
  route("about", "routes/about.tsx"),
  route("alignment", "routes/alignment.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("speaker-alias", "routes/speaker-alias.tsx"),
  route("admin/people", "routes/admin-people.tsx"),

  // API routes
  route("api/ask", "routes/api.ask.tsx"),
  route("api/report-video-failure", "routes/api.report-video-failure.ts"),
  route("api/bylaws/:id/download", "routes/api.bylaws.$id.download.tsx"),
  route("api/intel/:id", "routes/api.intel.tsx"),
  route("api/vimeo-url", "routes/api.vimeo-url.ts"),
] satisfies RouteConfig;
