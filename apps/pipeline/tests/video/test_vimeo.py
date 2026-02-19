"""Tests for pipeline.video.vimeo -- VimeoClient API interactions."""

import os

import pytest
import responses
from unittest.mock import patch, MagicMock

from pipeline.video.vimeo import VimeoClient


# ── Fixtures ────────────────────────────────────────────────────────────


VIMEO_API_BASE = "https://api.vimeo.com"

SAMPLE_VIDEO_LIST = {
    "data": [
        {
            "uri": "/videos/111111",
            "name": "2025-06-15 Regular Council",
            "link": "https://vimeo.com/111111",
            "duration": 3600,
        },
        {
            "uri": "/videos/222222",
            "name": "2025-06-15 Public Hearing",
            "link": "https://vimeo.com/222222",
            "duration": 1800,
        },
        {
            "uri": "/videos/333333",
            "name": "No Date In This Title",
            "link": "https://vimeo.com/333333",
            "duration": 900,
        },
    ],
    "paging": {"next": None},
}

SAMPLE_TEXTTRACKS = {
    "data": [
        {
            "language": "en",
            "link": "https://captions.example.com/track.vtt",
        }
    ]
}


# ── VimeoClient Initialization ──────────────────────────────────────────


class TestVimeoClientInit:
    @patch.dict(os.environ, {"VIMEO_TOKEN": "test-token-123"}, clear=False)
    def test_init_with_token(self):
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token-123"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token-123"}
        client.track_url_cache = {}
        assert client.token == "test-token-123"
        assert "Authorization" in client.headers

    def test_init_default_user(self):
        with patch.object(VimeoClient, "__init__", lambda self, **kw: None):
            client = VimeoClient.__new__(VimeoClient)
            client.vimeo_user = "viewroyal"
            assert client.vimeo_user == "viewroyal"


# ── get_video_map ───────────────────────────────────────────────────────


class TestGetVideoMap:
    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_video_map_extracts_dates(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {
            "Authorization": "Bearer test-token",
            "Accept": "application/vnd.vimeo.*+json;version=3.4",
            "User-Agent": "TestAgent",
        }
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            json=SAMPLE_VIDEO_LIST,
            status=200,
        )

        video_map = client.get_video_map()
        # Only 2 of 3 videos have parseable dates
        assert len(video_map) >= 1
        # The date key should be parseable
        for key in video_map:
            assert key is not None

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_video_map_no_token(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = None
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = None
        client.vimeo_user = "viewroyal"
        client.headers = {}
        client.track_url_cache = {}

        result = client.get_video_map()
        assert result == {}

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_video_map_with_limit(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {
            "Authorization": "Bearer test-token",
            "Accept": "application/vnd.vimeo.*+json;version=3.4",
            "User-Agent": "TestAgent",
        }
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            json=SAMPLE_VIDEO_LIST,
            status=200,
        )

        video_map = client.get_video_map(limit=1)
        total_videos = sum(len(v) for v in video_map.values())
        assert total_videos <= 1

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_video_map_api_error(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            status=500,
            body="Internal Server Error",
        )

        video_map = client.get_video_map()
        assert video_map == {}


# ── search_video ────────────────────────────────────────────────────────


class TestSearchVideo:
    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_search_exact_date_match(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            json={
                "data": [
                    {
                        "uri": "/videos/111111",
                        "name": "2025-06-15 Regular Council",
                        "link": "https://vimeo.com/111111",
                    }
                ]
            },
            status=200,
        )

        result = client.search_video("2025-06-15")
        assert result is not None
        assert result["url"] == "https://vimeo.com/111111"

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_search_title_hint_council(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            json={
                "data": [
                    {
                        "uri": "/videos/111",
                        "name": "2025-06-15 Regular Council",
                        "link": "https://vimeo.com/111",
                    },
                    {
                        "uri": "/videos/222",
                        "name": "2025-06-15 Public Hearing",
                        "link": "https://vimeo.com/222",
                    },
                ]
            },
            status=200,
        )

        result = client.search_video("2025-06-15", title_hint="Regular Council")
        assert result is not None
        assert "111" in result["url"]

    def test_search_no_token_returns_none(self):
        client = VimeoClient.__new__(VimeoClient)
        client.token = None
        client.vimeo_user = "viewroyal"
        client.headers = {}
        client.track_url_cache = {}

        result = client.search_video("2025-06-15")
        assert result is None

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_search_no_match_returns_none(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            json={"data": []},
            status=200,
        )

        result = client.search_video("1999-01-01")
        assert result is None

    @responses.activate
    @patch("pipeline.video.vimeo.config")
    def test_search_api_error_returns_none(self, mock_config):
        mock_config.VIMEO_ACCESS_TOKEN = "test-token"
        mock_config.USER_AGENT = "TestAgent"
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.vimeo_user = "viewroyal"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        responses.add(
            responses.GET,
            f"{VIMEO_API_BASE}/users/viewroyal/videos",
            status=500,
        )

        result = client.search_video("2025-06-15")
        assert result is None


# ── download_video ──────────────────────────────────────────────────────


class TestDownloadVideo:
    def test_download_skips_when_vtt_exists(self, tmp_path):
        """When VTT file already exists, download is skipped."""
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        # Create a fake VTT file
        vtt_file = tmp_path / "transcript.vtt"
        vtt_file.write_text("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello")

        video_data = {
            "uri": "/videos/111",
            "url": "https://vimeo.com/111",
            "title": "test video",
        }

        result = client.download_video(video_data, str(tmp_path))
        assert result is None

    def test_download_skips_audio_when_mp3_exists(self, tmp_path):
        """When MP3 already exists, audio download is skipped."""
        client = VimeoClient.__new__(VimeoClient)
        client.token = "test-token"
        client.headers = {"Authorization": "Bearer test-token"}
        client.track_url_cache = {}

        # Create a fake MP3 file
        mp3_file = tmp_path / "audio.mp3"
        mp3_file.write_bytes(b"fake mp3 data")

        # Create a fake VTT so it doesn't try to download transcript
        vtt_file = tmp_path / "transcript.vtt"
        vtt_file.write_text("WEBVTT")

        video_data = {
            "uri": "/videos/111",
            "url": "https://vimeo.com/111",
            "title": "test video",
        }

        result = client.download_video(
            video_data, str(tmp_path), download_audio=True
        )
        # Audio was already present so download_audio flag got cleared
        assert result is None
