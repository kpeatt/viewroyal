import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Check if vector search is available (GEMINI_API_KEY is configured)
 */
export function isVectorSearchAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Generate a query embedding using Google's gemini-embedding-001 model.
 * Uses RETRIEVAL_QUERY task type for optimal search performance.
 *
 * @param query The search query text
 * @returns 768-dimensional embedding vector, or null if unavailable
 */
export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { parts: [{ text: query }], role: "user" },
      taskType: TaskType.RETRIEVAL_QUERY,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    } as Parameters<typeof model.embedContent>[0]);

    const embedding = result.embedding.values;

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(`Unexpected embedding dimensions: ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`);
    }

    return embedding;
  } catch (error) {
    console.error("Failed to generate query embedding:", error);
    return null;
  }
}
