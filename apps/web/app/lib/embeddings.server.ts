import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!OPENAI_API_KEY) {
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

/**
 * Check if vector search is available (OPENAI_API_KEY is configured)
 */
export function isVectorSearchAvailable(): boolean {
  return !!OPENAI_API_KEY;
}

/**
 * Generate a query embedding using OpenAI's text-embedding-3-small model.
 *
 * @param query The search query text
 * @returns 768-dimensional embedding vector, or null if unavailable
 */
export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const openai = getClient();
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Failed to generate query embedding:", error);
    return null;
  }
}
