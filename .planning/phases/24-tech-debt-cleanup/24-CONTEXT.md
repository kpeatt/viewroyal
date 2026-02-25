# Phase 24: Tech Debt Cleanup - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up the documentation build and deploy pipeline so it's self-contained and production-ready. Fix duplicate prebuild execution, add a one-command deploy script, make wrangler a direct dependency, and configure the custom domain. No new features — strictly build/deploy hygiene.

</domain>

<decisions>
## Implementation Decisions

### Deploy script behavior
- Deploy script: `tsc --noEmit && pnpm build && wrangler deploy`
- Typecheck before build is the only addition vs the apps/web pattern
- Prebuild (OpenAPI fetch + MDX generation) runs as part of `pnpm build`, not separately in deploy
- Wrangler config inherited from wrangler.toml — no explicit project name in script

### Build deduplication
- Remove generate-openapi.mjs from postinstall — it belongs in the build chain only
- If postinstall only existed for OpenAPI generation, remove the hook entirely
- Prebuild regenerates MDX from spec every time (simple, fast ~1s, no hash-checking)
- Preserve existing fallback-to-committed-spec behavior for offline builds

### Claude's Discretion
- Custom domain DNS configuration (docs.viewroyal.ai) — document steps if blocked by DNS propagation or access
- Wrangler devDependency addition approach
- Exact prebuild script placement in package.json scripts chain

</decisions>

<specifics>
## Specific Ideas

No specific requirements — decisions are clear and mechanical. Follow existing apps/web patterns where applicable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-tech-debt-cleanup*
*Context gathered: 2026-02-25*
