import os
from typing import List, Optional, Union

import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()


class EmbeddingClient:
    """
    Client for generating text embeddings using Google's Generative AI.
    Uses gemini-embedding-001 with output_dimensionality=768 for efficient storage and HNSW indexing.
    """

    def __init__(
        self, api_key: Optional[str] = None, model: str = "models/gemini-embedding-001"
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "GEMINI_API_KEY not found in environment or provided to constructor."
            )

        self.client = genai.Client(api_key=self.api_key)
        self.model = model
        self.dimension = 768  # Reduced dimension for HNSW compatibility

    def embed_text(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT",
        title: Optional[str] = None,
    ) -> List[float]:
        """
        Generates an embedding for a single string.

        Args:
            text: The text to embed.
            task_type: Purpose of the embedding.
                       Options: 'RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'SEMANTIC_SIMILARITY',
                                'CLASSIFICATION', 'CLUSTERING', 'QUESTION_ANSWERING', 'FACT_CHECKING'
            title: Optional title for the document (only for RETRIEVAL_DOCUMENT).
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        config = {
            "task_type": task_type,
            "output_dimensionality": self.dimension,
        }
        if title:
            config["title"] = title

        try:
            response = self.client.models.embed_content(
                model=self.model, contents=text, config=config
            )
            return response.embeddings[0].values
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return [0.0] * self.dimension

    def embed_batch(
        self,
        texts: List[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
        batch_size: int = 100,
    ) -> List[List[float]]:
        """
        Generates embeddings for a list of strings using batching.
        Google's API supports up to 100 texts per request.
        """
        all_embeddings = []

        # Filter out empty strings but keep track of indices to preserve order
        valid_texts = []
        valid_indices = []
        for idx, text in enumerate(texts):
            if text and text.strip():
                valid_texts.append(text)
                valid_indices.append(idx)

        if not valid_texts:
            return [[0.0] * self.dimension] * len(texts)

        # Process in chunks of batch_size
        for i in range(0, len(valid_texts), batch_size):
            chunk = valid_texts[i : i + batch_size]
            try:
                response = self.client.models.embed_content(
                    model=self.model,
                    contents=chunk,
                    config={
                        "task_type": task_type,
                        "output_dimensionality": self.dimension,
                    },
                )
                all_embeddings.extend([emb.values for emb in response.embeddings])
            except Exception as e:
                print(f"Error in batch embedding chunk {i // batch_size}: {e}")
                # Fill with zeros on failure for this chunk
                all_embeddings.extend([[0.0] * self.dimension] * len(chunk))

        # Reconstruct the full list with original order
        final_results = [[0.0] * self.dimension] * len(texts)
        for idx, embedding in zip(valid_indices, all_embeddings):
            final_results[idx] = embedding

        return final_results

    @staticmethod
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """Utility to calculate similarity between two vectors."""
        a = np.array(v1)
        b = np.array(v2)
        if np.all(a == 0) or np.all(b == 0):
            return 0.0
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def get_embedding_client() -> EmbeddingClient:
    """Singleton-style accessor for the embedding client."""
    return EmbeddingClient()
