/**
 * Deterministic OCD ID generation using UUID v5 (SHA-1 name-based).
 *
 * Generates stable, spec-compliant OCD identifiers from entity type + bigint
 * primary key.  Uses Web Crypto API (`crypto.subtle.digest`) which is natively
 * available in Cloudflare Workers -- no external UUID library needed.
 *
 * Entity IDs:  `ocd-{type}/{uuid-v5}`  (deterministic from PK)
 * Division IDs: `ocd-division/country:ca/csd:{code}` (geographic, not UUID)
 * Jurisdiction IDs: `ocd-jurisdiction/country:ca/csd:{code}/government`
 */

/**
 * Namespace UUID for ViewRoyal.ai OCD IDs.
 * Generated once and hardcoded -- all UUID v5 derivations use this namespace.
 */
const NAMESPACE = "f47ac10b-58cc-4372-a567-0d02b2c3d479";

/**
 * Parse a UUID hex string into a 16-byte Uint8Array.
 */
function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Format the first 16 bytes of a Uint8Array as a standard UUID string.
 */
function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Generate a UUID v5 from a name string using the ViewRoyal.ai namespace.
 *
 * Concatenates namespace bytes + name bytes, SHA-1 hashes via Web Crypto,
 * sets version 5 bits and RFC 4122 variant bits, returns formatted UUID.
 */
export async function uuidV5(name: string): Promise<string> {
  const namespaceBytes = parseUuid(NAMESPACE);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, namespaceBytes.length);

  const hash = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(hash);

  // Set version 5 (bits 4-7 of byte 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // Set variant 10 (bits 6-7 of byte 8)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

// ---------------------------------------------------------------------------
// Per-entity OCD ID generators
// ---------------------------------------------------------------------------

/** Generate an OCD Person ID from a database primary key. */
export async function ocdPersonId(pk: number): Promise<string> {
  const uuid = await uuidV5(`person:${pk}`);
  return `ocd-person/${uuid}`;
}

/** Generate an OCD Organization ID from a database primary key. */
export async function ocdOrganizationId(pk: number): Promise<string> {
  const uuid = await uuidV5(`organization:${pk}`);
  return `ocd-organization/${uuid}`;
}

/** Generate an OCD Event ID from a database primary key. */
export async function ocdEventId(pk: number): Promise<string> {
  const uuid = await uuidV5(`event:${pk}`);
  return `ocd-event/${uuid}`;
}

/** Generate an OCD Bill ID from a database primary key. */
export async function ocdBillId(pk: number): Promise<string> {
  const uuid = await uuidV5(`bill:${pk}`);
  return `ocd-bill/${uuid}`;
}

/** Generate an OCD Vote ID from a database primary key. */
export async function ocdVoteId(pk: number): Promise<string> {
  const uuid = await uuidV5(`vote:${pk}`);
  return `ocd-vote/${uuid}`;
}

// ---------------------------------------------------------------------------
// Division-based IDs (geographic, NOT UUID-based)
// ---------------------------------------------------------------------------

/**
 * Generate an OCD Division ID from a StatsCan Census Subdivision code.
 * Division IDs identify a geographic area, not a governing body.
 */
export function ocdDivisionId(csdCode: string): string {
  return `ocd-division/country:ca/csd:${csdCode}`;
}

/**
 * Generate an OCD Jurisdiction ID from a StatsCan Census Subdivision code.
 * Jurisdiction IDs identify the governing body within a division.
 */
export function ocdJurisdictionId(csdCode: string): string {
  return `ocd-jurisdiction/country:ca/csd:${csdCode}/government`;
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/**
 * Pre-compute OCD IDs for an array of primary keys.
 *
 * Avoids the async-in-map pitfall by using `Promise.all()` to resolve all
 * IDs in parallel, returning a Map from PK to OCD ID string.
 */
export async function ocdIds(
  type: string,
  pks: number[],
): Promise<Map<number, string>> {
  const generators: Record<string, (pk: number) => Promise<string>> = {
    person: ocdPersonId,
    organization: ocdOrganizationId,
    event: ocdEventId,
    bill: ocdBillId,
    vote: ocdVoteId,
  };

  const generator = generators[type];
  if (!generator) {
    throw new Error(`Unknown OCD entity type: ${type}`);
  }

  const entries = await Promise.all(
    pks.map(async (pk) => [pk, await generator(pk)] as const),
  );

  return new Map(entries);
}
