/**
 * OCD Event serializer.
 *
 * Maps meeting rows to OCD Event objects.  Follows the allowlist pattern:
 * explicitly construct new objects with only public fields.  Never spread
 * `...row`.  All OCD spec fields are present (null when empty).
 *
 * Events are the most complex OCD entity -- they include inline agenda items,
 * participants (from attendance), media (video recordings), documents (agenda
 * and minutes PDFs), and links.
 */

/**
 * Map internal meeting type strings to OCD Event classification values.
 *
 * - Regular Council, Special Council, Committee of the Whole -> "meeting"
 * - Public Hearing, Board of Variance -> "hearing"
 * - Standing Committee, Advisory Committee -> "meeting"
 * - default -> "meeting"
 */
export function mapMeetingTypeToClassification(type: string | null): string {
  if (!type) return "meeting";

  switch (type) {
    case "Regular Council":
    case "Special Council":
    case "Committee of the Whole":
    case "Standing Committee":
    case "Advisory Committee":
      return "meeting";
    case "Public Hearing":
    case "Board of Variance":
      return "hearing";
    default:
      return "meeting";
  }
}

/**
 * Serialize a meeting row for list views (lightweight, no nested data).
 *
 * @param meeting - Row from the meetings table
 * @param ocdId - Pre-computed OCD ID for this event
 */
export function serializeEventSummary(meeting: any, ocdId: string) {
  return {
    id: ocdId,
    name: meeting.title ?? null,
    description: meeting.summary ?? "",
    classification: mapMeetingTypeToClassification(meeting.type),
    start_time: meeting.meeting_date
      ? `${meeting.meeting_date}T00:00:00-08:00`
      : null,
    timezone: "America/Vancouver",
    end_time: null as string | null,
    all_day: false,
    status: "passed",
    location: {
      url: null as string | null,
      name: "View Royal Town Hall",
      coordinates: null as { latitude: number; longitude: number } | null,
    },
    sources: [
      {
        url: meeting.agenda_url ?? meeting.minutes_url ?? "",
        note: null as string | null,
      },
    ],
    created_at: meeting.created_at ?? null,
    updated_at: meeting.created_at ?? null,
  };
}

/**
 * Serialize a meeting row for detail views with full nested data.
 *
 * @param meeting - Row from the meetings table
 * @param ocdId - Pre-computed OCD ID for this event
 * @param related - Related data: agenda items, attendance records, attendee OCD IDs
 */
export function serializeEventDetail(
  meeting: any,
  ocdId: string,
  related: {
    agendaItems: any[];
    attendance: any[];
    attendeeOcdIds: Map<number, string>;
  },
) {
  // Build media array from video_url
  const media: any[] = meeting.video_url
    ? [
        {
          note: "Video recording",
          date: meeting.meeting_date ?? null,
          offset: null as number | null,
          links: [
            {
              media_type: "text/html",
              url: meeting.video_url,
              text: "",
            },
          ],
        },
      ]
    : [];

  // Build links array from agenda_url and minutes_url
  const links: any[] = [];
  if (meeting.agenda_url) {
    links.push({ url: meeting.agenda_url, note: "Agenda" });
  }
  if (meeting.minutes_url) {
    links.push({ url: meeting.minutes_url, note: "Minutes" });
  }

  // Build participants from attendance records
  const participants = (related.attendance ?? []).map((a: any) => ({
    note: "attendee",
    name: a.person?.name ?? null,
    entity_type: "person",
    entity_name: a.person?.name ?? null,
    entity_id: a.person?.id
      ? (related.attendeeOcdIds.get(a.person.id) ?? null)
      : null,
  }));

  // Build inline agenda from agenda items
  const agenda = (related.agendaItems ?? []).map((item: any) => ({
    description: item.title ?? null,
    classification: item.category ?? null,
    order: item.item_order ?? null,
    subjects: [] as string[],
    notes: [] as string[],
    related_entities: [] as any[],
    media: [] as any[],
  }));

  // Build documents from agenda_url and minutes_url
  const documents: any[] = [];
  if (meeting.agenda_url) {
    documents.push({
      note: "Agenda document",
      date: meeting.meeting_date ?? null,
      media_type: "application/pdf",
      url: meeting.agenda_url,
      text: "",
      links: [] as any[],
    });
  }
  if (meeting.minutes_url) {
    documents.push({
      note: "Minutes document",
      date: meeting.meeting_date ?? null,
      media_type: "application/pdf",
      url: meeting.minutes_url,
      text: "",
      links: [] as any[],
    });
  }

  return {
    // Summary fields
    id: ocdId,
    name: meeting.title ?? null,
    description: meeting.summary ?? "",
    classification: mapMeetingTypeToClassification(meeting.type),
    start_time: meeting.meeting_date
      ? `${meeting.meeting_date}T00:00:00-08:00`
      : null,
    timezone: "America/Vancouver",
    end_time: null as string | null,
    all_day: false,
    status: "passed",
    location: {
      url: null as string | null,
      name: "View Royal Town Hall",
      coordinates: null as { latitude: number; longitude: number } | null,
    },
    sources: [
      {
        url: meeting.agenda_url ?? meeting.minutes_url ?? "",
        note: null as string | null,
      },
    ],
    created_at: meeting.created_at ?? null,
    updated_at: meeting.created_at ?? null,

    // Detail-only fields
    media,
    links,
    participants,
    agenda,
    documents,
  };
}
