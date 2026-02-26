---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [QUICK-7]
must_haves:
  truths:
    - "All internal links on docs.viewroyal.ai resolve to valid pages (no 404s)"
    - "Content body links match sidebar navigation links (no /docs/ prefix)"
  artifacts: []
  key_links: []
---

<objective>
Fix broken `/docs/`-prefixed links on the live docs.viewroyal.ai site by rebuilding and redeploying.

Purpose: The live docs site at docs.viewroyal.ai has broken internal links in every content page. Links in the main body (e.g., `/docs/guides/authentication`, `/docs/api-reference`) all 404 because the site serves pages at the root (`/guides/authentication`, `/api-reference`). The codebase already contains the fix (commits `56fe5617` and `7ffb6954` corrected `baseUrl` and replaced 18 broken cross-links), but the deployed version predates these fixes. A rebuild and redeploy will resolve all broken links.

Output: Working docs site with zero broken internal links.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/docs/package.json
@apps/docs/wrangler.toml
@apps/docs/lib/source.ts
@apps/docs/next.config.mjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild and redeploy docs site to Cloudflare</name>
  <files>apps/docs/out/</files>
  <action>
Run the full docs deploy pipeline from `apps/docs/`:

```bash
cd apps/docs && pnpm deploy
```

This runs: `tsc --noEmit && pnpm build && wrangler deploy`

The build will:
1. Run the prebuild script (`generate-openapi.mjs`) to fetch/generate OpenAPI MDX
2. Run `next build` which statically exports to `out/`
3. Deploy the `out/` directory to Cloudflare via wrangler

The `baseUrl: '/'` in `lib/source.ts` ensures all generated page URLs use root-relative paths (no `/docs/` prefix). The MDX content files already have correct links (fixed in commit `7ffb6954`).

If the deploy fails due to auth, the user will need to run `wrangler login` first.
  </action>
  <verify>
After deploy completes, verify the broken links are fixed:

```bash
# Check that no /docs/ prefixed links exist on key pages
for page in "/" "/guides/getting-started" "/guides/authentication" "/reference/ocd-standard"; do
  count=$(curl -s "https://docs.viewroyal.ai${page}" | grep -c 'href="/docs/')
  echo "${page}: ${count} broken links"
done
```

All pages should report 0 broken links.

Also spot-check that a previously broken link now works:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://docs.viewroyal.ai/guides/authentication"
```
Should return 200.
  </verify>
  <done>
All internal links on docs.viewroyal.ai use root-relative paths (e.g., `/guides/authentication`, `/api-reference`). Zero pages contain `/docs/`-prefixed hrefs. All linked pages return 200.
  </done>
</task>

</tasks>

<verification>
- `curl -s "https://docs.viewroyal.ai/" | grep -c 'href="/docs/'` returns 0
- `curl -s "https://docs.viewroyal.ai/guides/getting-started" | grep -c 'href="/docs/'` returns 0
- `curl -s "https://docs.viewroyal.ai/reference/ocd-standard" | grep -c 'href="/docs/'` returns 0
- All 5 previously broken link targets on the index page (`/guides/getting-started`, `/guides/authentication`, `/guides/pagination`, `/guides/error-handling`, `/api-reference`) return HTTP 200
</verification>

<success_criteria>
Zero `/docs/`-prefixed links remain on any page of docs.viewroyal.ai. All internal cross-links navigate to valid pages.
</success_criteria>

<output>
After completion, create `.planning/quick/7-the-docs-site-has-a-lot-of-broken-links-/7-SUMMARY.md`
</output>
