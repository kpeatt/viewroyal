const BASE = "https://viewroyal.ai";

export function ogImageUrl(
  title: string,
  opts?: { subtitle?: string; type?: string },
): string {
  const params = new URLSearchParams({ title });
  if (opts?.subtitle) params.set("subtitle", opts.subtitle);
  if (opts?.type) params.set("type", opts.type);
  return `${BASE}/api/og-image?${params.toString()}`;
}

export function ogUrl(path: string): string {
  return `${BASE}${path}`;
}
