"""Video source clients.

Currently supports:
- VimeoClient: Full Vimeo API + yt-dlp integration
- YouTubeClient: Stub for future YouTube support
"""


class YouTubeClient:
    """Stub for YouTube video source. To be implemented for municipalities
    that publish meeting recordings on YouTube (e.g. RDOS).

    Expected source_config.video_source:
        {"type": "youtube", "channel": "RDOS"}
    """

    def __init__(self, channel: str = ""):
        self.channel = channel

    def get_video_map(self, limit=None):
        print(f"  [YouTube] Video sync not yet implemented (channel: {self.channel})")
        return {}

    def download_video(self, video_data, output_folder, **kwargs):
        print("  [YouTube] Video download not yet implemented")
        return None
