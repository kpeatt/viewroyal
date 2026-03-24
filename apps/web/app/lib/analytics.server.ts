const POSTHOG_HOST = "https://k.viewroyal.ai";

/**
 * Fire-and-forget server-side PostHog event via HTTP.
 * Uses fetch() directly since posthog-node doesn't run on Cloudflare Workers.
 *
 * Pass `waitUntil` from Cloudflare's ExecutionContext to keep the fetch alive
 * after the response stream closes (required for SSE/streaming endpoints).
 */
export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, any>,
  waitUntil?: (promise: Promise<any>) => void,
): void {
  const apiKey =
    process.env.VITE_POSTHOG_KEY ||
    (typeof globalThis !== "undefined" &&
      (globalThis as any).__VITE_POSTHOG_KEY) ||
    "";

  if (!apiKey) return;

  const promise = fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: { ...properties, $lib: "server" },
    }),
  }).catch(() => {
    // Fire-and-forget: swallow errors to avoid blocking the response
  });

  if (waitUntil) {
    waitUntil(promise);
  }
}
