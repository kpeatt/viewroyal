import { createOpenAPI } from 'fumadocs-openapi/server';

/**
 * OpenAPI server instance for fumadocs.
 *
 * Reads the local openapi.json (produced by the prebuild script).
 * Code samples (curl, JavaScript, Python, Go, Java, C#) are provided
 * by fumadocs-openapi's built-in generators — no custom config needed.
 *
 * This file is server-only. Imported by components/api-page.tsx.
 */
export const openapi = createOpenAPI({
  input: ['./openapi.json'],
});
