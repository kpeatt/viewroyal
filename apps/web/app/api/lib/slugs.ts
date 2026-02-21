/**
 * Slug generation utilities for all API-facing entity types.
 *
 * Slugs are human-readable, deterministic identifiers derived from entity data.
 * They are generated once at insert time and never change.
 * ASCII-only (sufficient for BC civic data).
 */

/**
 * Convert a string to a URL-safe slug.
 *
 * - Lowercases the input
 * - Replaces non-alphanumeric characters with hyphens
 * - Trims leading/trailing hyphens
 * - Truncates to maxLength
 * - Removes trailing hyphen if truncation cut mid-word
 */
export function slugify(text: string, maxLength = 60): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, maxLength)
    .replace(/-$/, "");
}

/**
 * Meeting slug: `{date}-{slugified-type}`.
 * Example: `2024-01-15-regular-council`
 */
export function meetingSlug(date: string, type: string): string {
  return `${date}-${slugify(type)}`;
}

/**
 * Person slug: `{slugified-name}`.
 * Example: `david-screech`
 */
export function personSlug(name: string): string {
  return slugify(name);
}

/**
 * Matter slug: `{id}-{slugified-title}`.
 * ID prefix guarantees uniqueness.
 * Example: `2600-ocp-project-update`
 */
export function matterSlug(id: number, title: string): string {
  return `${id}-${slugify(title, 50)}`;
}

/**
 * Motion slug: `m-{id}`.
 * Motions lack human-readable unique identifiers.
 */
export function motionSlug(id: number): string {
  return `m-${id}`;
}

/**
 * Bylaw slug: `{slugified-bylaw-number}` if available, else `{id}-{slugified-title}`.
 * Example: `1154` or `43-tree-protection-bylaw`
 */
export function bylawSlug(
  id: number,
  bylawNumber: string | null,
  title: string,
): string {
  if (bylawNumber) return slugify(bylawNumber);
  return `${id}-${slugify(title, 50)}`;
}

/**
 * Agenda item slug: `{meetingId}-{itemOrder}-{slugified-title}`.
 * Uses meetingId + itemOrder for uniqueness since agenda_items lack
 * their own municipality_id column.
 * Example: `42-3-ocp-project-update`
 */
export function agendaItemSlug(
  meetingId: number,
  itemOrder: number,
  title: string,
): string {
  return `${meetingId}-${itemOrder}-${slugify(title, 40)}`;
}
