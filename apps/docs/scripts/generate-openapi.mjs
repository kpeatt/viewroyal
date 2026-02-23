/**
 * Prebuild script: fetch the live OpenAPI spec from viewroyal.ai,
 * fix known issues (double path prefix, missing tags/servers),
 * write a committed fallback, and generate MDX files for fumadocs.
 *
 * Usage: node scripts/generate-openapi.mjs
 * Wired as "prebuild" in package.json — runs before `next build`.
 */

import { createOpenAPI } from 'fumadocs-openapi/server';
import { generateFiles } from 'fumadocs-openapi';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

// chanfana double-prefixes the base path in both the URL and the path keys.
// The actual serving URL is /api/v1/api/v1/openapi.json (known bug).
const SPEC_URL = 'https://viewroyal.ai/api/v1/api/v1/openapi.json';
const FALLBACK_PATH = './openapi.json';
const OUTPUT_DIR = './content/docs/api-reference';

// Tags defined in the API but not emitted by chanfana into the spec
const TAGS = [
  { name: 'System', description: 'Health checks and API status' },
  { name: 'Meetings', description: 'Council meeting agendas, minutes, and attendance' },
  { name: 'People', description: 'Council members, staff, and their voting records' },
  { name: 'Matters', description: 'Agenda matters, issues, and their lifecycle' },
  { name: 'Motions', description: 'Motions, resolutions, and roll call votes' },
  { name: 'Bylaws', description: 'Municipal bylaws and their status' },
  { name: 'Search', description: 'Cross-content keyword search' },
  { name: 'OCD', description: 'Open Civic Data specification endpoints for civic tech interoperability' },
];

// Map operationId prefixes to tags
const TAG_RULES = [
  { match: /Health/, tag: 'System' },
  { match: /TestAuth/, tag: 'System' },
  { match: /Meeting/, tag: 'Meetings' },
  { match: /People|Person/, tag: 'People' },
  { match: /Matter/, tag: 'Matters' },
  { match: /Motion/, tag: 'Motions' },
  { match: /Bylaw/, tag: 'Bylaws' },
  { match: /Search/, tag: 'Search' },
  { match: /ocd/i, tag: 'OCD' },
];

/**
 * Fetch the live spec with a 10-second timeout.
 * Falls back to the committed openapi.json if the fetch fails.
 */
async function fetchSpec() {
  try {
    const res = await fetch(SPEC_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    console.log('[openapi] Fetched live spec from', SPEC_URL);
    return JSON.parse(text);
  } catch (err) {
    console.warn('[openapi] Live fetch failed, using fallback:', err.message);
    if (!existsSync(FALLBACK_PATH)) {
      throw new Error('No fallback spec found at ' + FALLBACK_PATH);
    }
    return JSON.parse(readFileSync(FALLBACK_PATH, 'utf-8'));
  }
}

/**
 * Fix chanfana's double path prefix: /api/v1/api/v1/... -> /api/v1/...
 */
function fixPaths(spec) {
  const fixedPaths = {};
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const fixed = path.replace(/^\/api\/v1\/api\/v1/, '/api/v1');
    fixedPaths[fixed] = methods;
  }
  spec.paths = fixedPaths;
  return spec;
}

/**
 * Inject tags onto operations based on operationId patterns.
 */
function injectTags(spec) {
  spec.tags = TAGS;
  for (const [, methods] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(methods)) {
      if (typeof operation !== 'object' || !operation.operationId) continue;
      if (operation.tags && operation.tags.length > 0) continue;
      for (const rule of TAG_RULES) {
        if (rule.match.test(operation.operationId)) {
          operation.tags = [rule.tag];
          break;
        }
      }
    }
  }
  return spec;
}

/**
 * Inject servers array and security scheme if missing.
 */
function injectServerAndSecurity(spec) {
  if (!spec.servers || spec.servers.length === 0) {
    spec.servers = [{ url: 'https://viewroyal.ai', description: 'Production' }];
  }

  // Ensure components structure exists
  if (!spec.components) spec.components = {};
  if (!spec.components.securitySchemes) spec.components.securitySchemes = {};

  // Add API key security scheme
  if (!spec.components.securitySchemes.ApiKeyAuth) {
    spec.components.securitySchemes.ApiKeyAuth = {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      description: 'API key for authentication. Get your key at /settings/api-keys.',
    };
  }

  // Enrich the info description
  spec.info.description =
    'Public API for the ViewRoyal.ai civic intelligence platform.\n\n' +
    'Provides access to council meeting data, people, matters, motions, bylaws, ' +
    'and cross-content search for the Town of View Royal, BC.\n\n' +
    '**Authentication:** Pass your API key in the `X-API-Key` header or as a `?apikey=` query parameter. ' +
    'Get your key at [/settings/api-keys](https://viewroyal.ai/settings/api-keys).';

  return spec;
}

// --- Main ---

const spec = await fetchSpec();
fixPaths(spec);
injectTags(spec);
injectServerAndSecurity(spec);

// Write the cleaned spec as the committed fallback
writeFileSync(FALLBACK_PATH, JSON.stringify(spec, null, 2));
console.log('[openapi] Wrote cleaned spec to', FALLBACK_PATH);

// Create the OpenAPI server instance for generateFiles
const openapi = createOpenAPI({
  input: [FALLBACK_PATH],
});

// Generate MDX files grouped by tag, one per operation
await generateFiles({
  input: openapi,
  output: OUTPUT_DIR,
  per: 'operation',
  groupBy: 'tag',
});

console.log('[openapi] Generated API reference MDX files in', OUTPUT_DIR);
