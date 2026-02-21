/**
 * Search result serializer.
 *
 * Handles results from multiple content types, each with different
 * source shapes.  Uses allowlist pattern -- explicitly constructs the
 * public API object, never spreads raw DB rows.
 */

/**
 * Truncate text to a maximum length at a word boundary, appending
 * an ellipsis if truncated.
 */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

/**
 * Serialize a search result row from any content type into the
 * unified search result shape.
 *
 * Expected fields vary by type:
 *   - motions:           slug, text_content, plain_english_summary, meetings.slug, meetings.meeting_date
 *   - matters:           slug, title, description, plain_english_summary
 *   - agenda_items:      slug, title, plain_english_summary, debate_summary, meetings.slug, meetings.meeting_date
 *   - key_statements:    statement_text, context, speaker_name, meetings.slug, meetings.meeting_date
 *   - document_sections: section_title, section_text, document_id
 */
export function serializeSearchResult(
  row: any,
  type: string,
  score: number,
  meetingInfo?: { slug: string | null; date: string | null },
) {
  let title: string | null = null;
  let snippet: string | null = null;
  let slug: string | null = null;

  switch (type) {
    case "motion": {
      slug = row.slug ?? null;
      title = row.plain_english_summary
        ? truncateAtWord(row.plain_english_summary, 120)
        : row.text_content
          ? truncateAtWord(row.text_content, 120)
          : null;
      snippet = row.text_content ? truncateAtWord(row.text_content, 200) : null;
      break;
    }
    case "matter": {
      slug = row.slug ?? null;
      title = row.title ?? null;
      const descText = row.plain_english_summary ?? row.description ?? null;
      snippet = descText ? truncateAtWord(descText, 200) : null;
      break;
    }
    case "agenda_item": {
      slug = row.slug ?? null;
      title = row.title ?? null;
      const itemText = row.plain_english_summary ?? row.debate_summary ?? null;
      snippet = itemText ? truncateAtWord(itemText, 200) : null;
      break;
    }
    case "key_statement": {
      // key_statements don't have slugs -- use meeting slug for linking
      slug = meetingInfo?.slug ?? null;
      title = row.speaker_name
        ? `${row.speaker_name}: ${truncateAtWord(row.statement_text ?? "", 100)}`
        : row.statement_text
          ? truncateAtWord(row.statement_text, 120)
          : null;
      snippet = row.statement_text
        ? truncateAtWord(row.statement_text, 200)
        : null;
      break;
    }
    case "document_section": {
      // document_sections don't have slugs -- use meeting slug for linking
      slug = meetingInfo?.slug ?? null;
      title = row.section_title ?? "Document Section";
      snippet = row.section_text
        ? truncateAtWord(row.section_text, 200)
        : null;
      break;
    }
  }

  return {
    type,
    slug,
    title,
    snippet,
    score,
    meeting_slug: meetingInfo?.slug ?? null,
    meeting_date: meetingInfo?.date ?? null,
  };
}
