/// <reference types="@cloudflare/workers-types" />

/**
 * API key utilities for hashing, comparison, and generation.
 *
 * Keys are stored as SHA-256 hashes. Comparison uses timing-safe equality
 * by double-hashing both inputs to guarantee equal-length buffers.
 */

// Cloudflare Workers' crypto.subtle extends standard SubtleCrypto with timingSafeEqual
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
};

/**
 * Hash an API key with SHA-256. Returns lowercase hex string.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe comparison of two strings.
 *
 * Both inputs are hashed with SHA-256 first to produce fixed 32-byte buffers,
 * then compared with crypto.subtle.timingSafeEqual(). This avoids the
 * length-mismatch throw that timingSafeEqual has, and prevents timing attacks.
 */
export async function timingSafeCompare(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return subtle.timingSafeEqual(hashA, hashB);
}

/**
 * Generate a cryptographically random API key.
 *
 * Format: "vr_" + 64 hex chars (32 random bytes) = 67 chars total.
 * The "vr_" prefix makes keys visually identifiable.
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `vr_${hex}`;
}
