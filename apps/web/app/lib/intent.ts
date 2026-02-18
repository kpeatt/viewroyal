/**
 * Heuristic query intent classifier.
 *
 * Distinguishes keyword queries (e.g. "tree bylaw", "parking")
 * from natural language questions (e.g. "What did council decide about housing?").
 *
 * Ambiguous queries default to 'question' so the AI answer tab
 * is shown (per user decision in CONTEXT.md).
 */

const QUESTION_STARTERS = [
  "who",
  "what",
  "when",
  "where",
  "why",
  "how",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "should",
  "has",
  "have",
  "tell me",
  "explain",
  "describe",
  "compare",
];

export type QueryIntent = "question" | "keyword";

export function classifyIntent(query: string): QueryIntent {
  const q = query.trim().toLowerCase();

  if (!q) return "keyword";

  // 1. Ends with question mark -> question
  if (q.endsWith("?")) return "question";

  // 2. Multi-word starters (check before single-word to match "tell me" etc.)
  const multiWordStarters = QUESTION_STARTERS.filter((s) => s.includes(" "));
  if (multiWordStarters.some((starter) => q.startsWith(starter + " ") || q === starter)) {
    return "question";
  }

  // 3. Starts with a question word -> question
  const firstWord = q.split(/\s+/)[0];
  if (QUESTION_STARTERS.includes(firstWord)) return "question";

  // 4. Short queries (1-3 words, no question markers) -> keyword
  const wordCount = q.split(/\s+/).length;
  if (wordCount <= 3) return "keyword";

  // 5. Longer queries (5+ words) without markers -> default to question
  //    (ambiguous queries go to AI answer per user decision)
  if (wordCount >= 5) return "question";

  // 6. Default (4 words): ambiguous -> question (AI per user decision)
  return "question";
}
