/**
 * Cross-reference detection utility.
 * Detects bylaw mentions (e.g., "Bylaw No. 1059") in document section text
 * and resolves them against known bylaws from the database.
 */

export interface CrossReference {
  pattern: string; // The matched text, e.g., "Bylaw No. 1059"
  bylawNumber: string; // The extracted number, e.g., "1059"
  targetType: "bylaw"; // Future: could expand to "document"
  targetId: number; // bylaws.id
  targetTitle: string; // bylaws.title
  targetUrl: string; // "/bylaws/{id}"
  sectionOrders: number[]; // Which section_orders contain this reference
}

export interface BylawRecord {
  id: number;
  title: string;
  bylaw_number: string;
}

/**
 * Regex to match bylaw references like "Bylaw No. 1059" or "Bylaw No. 1059, 2020".
 * Captures just the bylaw number (digits), ignoring any trailing year suffix.
 */
const BYLAW_RE = /\bBylaw\s+No\.\s*(\d+)(?:\s*,\s*\d{4})?\b/gi;

/**
 * Detect cross-references to bylaws in document sections.
 *
 * Scans each section's text for bylaw number patterns, resolves them
 * against the provided bylaw list (filtering out false positives),
 * deduplicates across sections, and returns sorted results.
 */
export function detectCrossReferences(
  sections: Array<{ section_text: string; section_order: number }>,
  bylaws: BylawRecord[],
): CrossReference[] {
  // Build lookup map: bylaw_number -> BylawRecord
  const bylawMap = new Map<string, BylawRecord>();
  for (const b of bylaws) {
    bylawMap.set(b.bylaw_number, b);
  }

  // Track cross-references by bylaw number for deduplication
  const refMap = new Map<string, CrossReference>();

  for (const section of sections) {
    // Reset regex lastIndex for each section (global regex is stateful)
    BYLAW_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = BYLAW_RE.exec(section.section_text)) !== null) {
      const bylawNumber = match[1];
      const bylaw = bylawMap.get(bylawNumber);

      if (!bylaw) continue; // Not in database -- filter false positive

      const existing = refMap.get(bylawNumber);
      if (existing) {
        // Deduplicate: merge sectionOrders
        if (!existing.sectionOrders.includes(section.section_order)) {
          existing.sectionOrders.push(section.section_order);
        }
      } else {
        refMap.set(bylawNumber, {
          pattern: `Bylaw No. ${bylawNumber}`,
          bylawNumber,
          targetType: "bylaw",
          targetId: bylaw.id,
          targetTitle: bylaw.title,
          targetUrl: `/bylaws/${bylaw.id}`,
          sectionOrders: [section.section_order],
        });
      }
    }
  }

  // Sort by first occurrence (lowest sectionOrder first)
  return Array.from(refMap.values()).sort(
    (a, b) => a.sectionOrders[0] - b.sectionOrders[0],
  );
}
