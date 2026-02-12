import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// This file is intended for the browser.
// The server build fails if `createBrowserClient` is called in the global scope
// in a non-browser environment (like Cloudflare Workers) because it sets up timers.

// We make the initialization conditional on the environment.
const isBrowser = typeof window !== "undefined";

/**
 * The Supabase client for use in browser environments (React components, etc.).
 * In server environments (loaders, actions), this will be a dummy object.
 * Server-side logic must use `createSupabaseServerClient` or `getSupabaseAdminClient`
 * from `app/lib/supabase.server.ts`.
 */
const supabase: SupabaseClient = isBrowser
  ? createBrowserClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    )
  : ({} as SupabaseClient); // Provide a dummy object for the server build to prevent type errors.

// This check will only run in the browser, preventing server-side errors
// if the env vars are somehow not available during the server build.
if (
  isBrowser &&
  (!import.meta.env.VITE_SUPABASE_URL ||
    !import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
) {
  throw new Error(
    "Missing Supabase URL or Anon Key on the client. Check your .env file.",
  );
}

export default supabase;
