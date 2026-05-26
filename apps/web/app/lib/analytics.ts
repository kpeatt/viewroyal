import posthog from "posthog-js";

/**
 * Track a custom event via PostHog.
 * Guards against SSR (no `window`) and uninitialized PostHog.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, any>,
): void {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;
  posthog.capture(name, properties);
}
