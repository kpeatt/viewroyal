import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";
import { hashApiKey, timingSafeCompare } from "../lib/api-key";
import { getSupabaseAdminClient } from "~/lib/supabase.server";

/**
 * API key authentication middleware.
 *
 * Extracts the API key from the X-API-Key header or ?apikey query parameter
 * (header takes priority). Hashes the key with SHA-256, looks up by prefix
 * for fast filtering, then timing-safe compares the full hash.
 *
 * On success, sets `apiKeyId` and `userId` in the Hono context.
 */
export const apiKeyAuth = createMiddleware<ApiEnv>(async (c, next) => {
  // 1. Extract API key from header or query param
  const apiKey = c.req.header("X-API-Key") || c.req.query("apikey");

  if (!apiKey) {
    throw new ApiError(
      401,
      "MISSING_API_KEY",
      "API key required. Pass via X-API-Key header or ?apikey query parameter.",
    );
  }

  // 2. Hash the provided key
  const keyHash = await hashApiKey(apiKey);

  // 3. Extract prefix for fast lookup
  const prefix = apiKey.substring(0, 8);

  // 4. Look up by prefix + active status
  const supabase = getSupabaseAdminClient();
  const { data: keyRecord, error } = await supabase
    .from("api_keys")
    .select("id, user_id, key_hash, is_active")
    .eq("key_prefix", prefix)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[API] API key lookup error:", error);
    throw new ApiError(500, "INTERNAL_ERROR", "Failed to validate API key");
  }

  // 5. Timing-safe compare the full hash
  if (!keyRecord || !(await timingSafeCompare(keyHash, keyRecord.key_hash))) {
    throw new ApiError(
      401,
      "INVALID_API_KEY",
      "Invalid API key. Check your key and try again.",
    );
  }

  // 6. Set context variables for downstream handlers
  c.set("apiKeyId", keyRecord.id);
  c.set("userId", keyRecord.user_id);

  await next();
});
