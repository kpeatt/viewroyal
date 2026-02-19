"""Tests for pipeline.ingestion.embed module.

Covers: generate_embeddings, MAX_EMBED_CHARS, TABLE_CONFIG, get_openai_client
"""

import pytest
from unittest.mock import patch, MagicMock

from pipeline.ingestion.embed import (
    generate_embeddings,
    TABLE_CONFIG,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    MAX_EMBED_CHARS,
    API_BATCH_SIZE,
    DEFAULT_MIN_WORDS,
)


# --- Constants ---


class TestEmbedConstants:
    def test_embedding_model(self):
        assert EMBEDDING_MODEL == "text-embedding-3-small"

    def test_embedding_dimensions(self):
        assert EMBEDDING_DIMENSIONS == 384

    def test_max_embed_chars(self):
        assert MAX_EMBED_CHARS == 8000

    def test_api_batch_size(self):
        assert API_BATCH_SIZE == 128

    def test_table_config_has_expected_tables(self):
        expected_tables = {
            "agenda_items", "motions", "matters", "meetings",
            "bylaws", "bylaw_chunks", "documents", "key_statements",
            "document_sections",
        }
        assert set(TABLE_CONFIG.keys()) == expected_tables

    def test_each_table_has_select_and_text_fn(self):
        for table, config in TABLE_CONFIG.items():
            assert "select" in config, f"{table} missing 'select'"
            assert "text_fn" in config, f"{table} missing 'text_fn'"

    def test_default_min_words_covers_all_tables(self):
        for table in TABLE_CONFIG:
            assert table in DEFAULT_MIN_WORDS, f"{table} missing from DEFAULT_MIN_WORDS"


# --- generate_embeddings ---


class TestGenerateEmbeddings:
    def test_single_text(self):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.embedding = [0.1] * 384
        mock_response.data = [mock_item]
        mock_client.embeddings.create.return_value = mock_response

        result = generate_embeddings(mock_client, ["test text"])
        assert len(result) == 1
        assert len(result[0]) == 384
        mock_client.embeddings.create.assert_called_once_with(
            model=EMBEDDING_MODEL,
            input=["test text"],
            dimensions=EMBEDDING_DIMENSIONS,
        )

    def test_batch_texts(self):
        mock_client = MagicMock()
        mock_response = MagicMock()
        items = []
        for _ in range(5):
            item = MagicMock()
            item.embedding = [0.1] * 384
            items.append(item)
        mock_response.data = items
        mock_client.embeddings.create.return_value = mock_response

        result = generate_embeddings(mock_client, ["text1", "text2", "text3", "text4", "text5"])
        assert len(result) == 5

    def test_rate_limit_retry(self):
        mock_client = MagicMock()
        # First call raises rate limit, second succeeds
        mock_item = MagicMock()
        mock_item.embedding = [0.1] * 384
        mock_response = MagicMock()
        mock_response.data = [mock_item]
        mock_client.embeddings.create.side_effect = [
            Exception("429 rate_limit_exceeded"),
            mock_response,
        ]

        with patch("pipeline.ingestion.embed.time.sleep"):
            result = generate_embeddings(mock_client, ["test"])
        assert len(result) == 1

    def test_non_rate_limit_error_raises(self):
        mock_client = MagicMock()
        mock_client.embeddings.create.side_effect = Exception("Server Error 500")

        with pytest.raises(Exception, match="Server Error 500"):
            generate_embeddings(mock_client, ["test"])

    def test_rate_limit_exhausted_raises(self):
        mock_client = MagicMock()
        mock_client.embeddings.create.side_effect = Exception("429 rate_limit_exceeded")

        with patch("pipeline.ingestion.embed.time.sleep"):
            with pytest.raises(Exception, match="429"):
                generate_embeddings(mock_client, ["test"])


# --- TABLE_CONFIG text functions ---


class TestTableConfigTextFns:
    def test_motions_text_fn(self):
        fn = TABLE_CONFIG["motions"]["text_fn"]
        row = (1, "THAT Council approve the application")
        assert fn(row) == "THAT Council approve the application"

    def test_motions_text_fn_none(self):
        fn = TABLE_CONFIG["motions"]["text_fn"]
        row = (1, None)
        assert fn(row) == ""

    def test_matters_text_fn_prefers_summary(self):
        fn = TABLE_CONFIG["matters"]["text_fn"]
        row = (1, "Summary text", "Title text")
        assert fn(row) == "Summary text"

    def test_matters_text_fn_falls_back_to_title(self):
        fn = TABLE_CONFIG["matters"]["text_fn"]
        row = (1, None, "Title text")
        assert fn(row) == "Title text"

    def test_meetings_text_fn(self):
        fn = TABLE_CONFIG["meetings"]["text_fn"]
        row = (1, "Council discussed zoning changes")
        assert fn(row) == "Council discussed zoning changes"

    def test_documents_text_fn(self):
        fn = TABLE_CONFIG["documents"]["text_fn"]
        row = (1, "Staff Report", "Full text of the report")
        result = fn(row)
        assert "Staff Report" in result
        assert "Full text of the report" in result

    def test_key_statements_text_fn(self):
        fn = TABLE_CONFIG["key_statements"]["text_fn"]
        row = (1, "Traffic increased 40%", "During rezoning debate")
        result = fn(row)
        assert "Traffic increased" in result
        assert "rezoning debate" in result

    def test_document_sections_text_fn(self):
        fn = TABLE_CONFIG["document_sections"]["text_fn"]
        row = (1, "Background", "This section provides background information.")
        result = fn(row)
        assert "Background" in result
        assert "background information" in result

    def test_bylaws_text_fn(self):
        fn = TABLE_CONFIG["bylaws"]["text_fn"]
        row = (1, "Noise Control Bylaw", "Controls noise levels in View Royal")
        result = fn(row)
        assert "Noise Control Bylaw" in result

    def test_bylaw_chunks_text_fn(self):
        fn = TABLE_CONFIG["bylaw_chunks"]["text_fn"]
        row = (1, "Section 3.1 noise levels shall not exceed...")
        assert fn(row) == "Section 3.1 noise levels shall not exceed..."


# --- get_openai_client ---


class TestGetOpenAIClient:
    @patch("pipeline.ingestion.embed.OPENAI_API_KEY", None)
    def test_no_api_key_raises(self):
        from pipeline.ingestion.embed import get_openai_client
        with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
            get_openai_client()

    @patch("pipeline.ingestion.embed.OPENAI_API_KEY", "test-key")
    @patch("openai.OpenAI")
    def test_creates_client(self, mock_openai):
        from pipeline.ingestion.embed import get_openai_client
        client = get_openai_client()
        mock_openai.assert_called_once_with(api_key="test-key", max_retries=5)
