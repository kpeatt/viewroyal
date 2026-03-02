import type { TranscriptSegment, Person } from "./types";

export interface SubSegment {
  id: string; // e.g. "seg-{parentId}-{index}"
  parentId: number; // original TranscriptSegment.id
  speaker_name?: string;
  speaker_role?: string;
  person_id: number | null;
  person?: Person;
  start_time: number; // interpolated from parent
  end_time: number; // interpolated from parent
  text_content: string; // 1-2 sentences
}

/**
 * Splits a single TranscriptSegment into sentence-level SubSegments
 * with interpolated timestamps proportional to character position.
 */
export function splitSegmentIntoSentences(
  segment: TranscriptSegment,
): SubSegment[] {
  const text = segment.text_content.trim();

  // If already short or single sentence, return as-is
  if (text.length < 120) {
    return [makeSubSegment(segment, text, 0, 0)];
  }

  // Split on sentence boundaries, keeping punctuation with preceding sentence
  let sentences = text.split(/(?<=[.!?])\s+/);

  // If only 1 sentence after split, return as single sub-segment
  if (sentences.length <= 1) {
    return [makeSubSegment(segment, text, 0, 0)];
  }

  // Merge very short sentences (under 15 chars) with the next one
  const merged: string[] = [];
  let carry = "";
  for (let i = 0; i < sentences.length; i++) {
    const current = carry ? carry + " " + sentences[i] : sentences[i];
    carry = "";

    if (current.length < 15 && i < sentences.length - 1) {
      // Too short, carry to next
      carry = current;
    } else {
      merged.push(current);
    }
  }
  // If there's a leftover carry, append to last merged sentence
  if (carry && merged.length > 0) {
    merged[merged.length - 1] = merged[merged.length - 1] + " " + carry;
  } else if (carry) {
    merged.push(carry);
  }

  // If merging collapsed everything to 1, return as single
  if (merged.length <= 1) {
    return [makeSubSegment(segment, text, 0, 0)];
  }

  const totalChars = text.length;
  const duration = segment.end_time - segment.start_time;
  const results: SubSegment[] = [];
  let charOffset = 0;

  for (let i = 0; i < merged.length; i++) {
    const sentence = merged[i];
    const subStart =
      segment.start_time + (charOffset / totalChars) * duration;
    const subEnd =
      segment.start_time +
      ((charOffset + sentence.length) / totalChars) * duration;

    results.push(makeSubSegment(segment, sentence, subStart, i));

    // Set end_time separately (for the last one, use parent end_time)
    results[results.length - 1].end_time =
      i === merged.length - 1 ? segment.end_time : subEnd;

    charOffset += sentence.length + 1; // +1 for the space between sentences
  }

  return results;
}

function makeSubSegment(
  parent: TranscriptSegment,
  text: string,
  startTime: number,
  index: number,
): SubSegment {
  return {
    id: `seg-${parent.id}-${index}`,
    parentId: parent.id,
    speaker_name: parent.speaker_name,
    speaker_role: parent.speaker_role,
    person_id: parent.person_id,
    person: parent.person,
    start_time: index === 0 ? parent.start_time : startTime,
    end_time: parent.end_time,
    text_content: text,
  };
}

/**
 * Splits an array of TranscriptSegments into sentence-level SubSegments.
 */
export function splitTranscript(
  segments: TranscriptSegment[],
): SubSegment[] {
  return segments
    .flatMap((seg) => splitSegmentIntoSentences(seg))
    .sort((a, b) => a.start_time - b.start_time);
}

/**
 * Finds the SubSegment active at the given time.
 */
export function findCurrentSubSegment(
  subSegments: SubSegment[],
  currentTime: number,
): SubSegment | undefined {
  return subSegments.find(
    (s) => currentTime >= s.start_time && currentTime < s.end_time,
  );
}
