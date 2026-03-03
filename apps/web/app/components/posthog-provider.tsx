import { useEffect } from "react";
import { useLocation } from "react-router";
import posthog from "posthog-js";

/**
 * Client-side PostHog analytics provider.
 * Initializes PostHog on mount and tracks $pageview on every route change.
 * Renders nothing -- this is a side-effect-only component.
 *
 * Uses posthog-js directly (not posthog-js/react) to avoid SSR/bundling
 * issues on Cloudflare Workers.
 */
export function PostHogProvider() {
  const { pathname, search } = useLocation();

  // Initialize PostHog once on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const key =
      import.meta.env.VITE_POSTHOG_KEY || process.env.VITE_POSTHOG_KEY || "";

    if (!key) return; // Graceful no-op when key is missing (e.g. local dev)

    posthog.init(key, {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // We track route changes manually (SPA)
    });
  }, []);

  // Track pageview on every route change
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!posthog.__loaded) return; // Skip if PostHog wasn't initialized

    posthog.capture("$pageview");
  }, [pathname, search]);

  return null;
}
