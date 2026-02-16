import glob
import os
import re
import time

import requests
import yt_dlp

from pipeline import config, utils


class VimeoClient:
    def __init__(self, vimeo_user: str = "viewroyal"):
        self.token = config.VIMEO_ACCESS_TOKEN
        self.vimeo_user = vimeo_user
        self.headers = {}
        # Cache to store transcript URLs {uri: url_or_none}
        self.track_url_cache = {}

        if self.token:
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.vimeo.*+json;version=3.4",
                "User-Agent": config.USER_AGENT,
            }
        else:
            print("[Warning] No VIMEO_TOKEN found. Video/Transcript sync may fail.")

    def get_video_map(self, limit=None):
        # ... existing get_video_map ...
        print("\n--- Fetching Video Metadata (Vimeo API) ---")
        if not self.token:
            print("[!] Error: Cannot use API without VIMEO_TOKEN.")
            return {}

        video_map = {}
        api_url = f"https://api.vimeo.com/users/{self.vimeo_user}/videos"
        params = {
            "per_page": 100,
            "page": 1,
            "fields": "uri,name,link,created_time,duration",
        }

        count = 0
        while True:
            try:
                resp = requests.get(api_url, headers=self.headers, params=params)
                if resp.status_code != 200:
                    print(f"[!] API Error {resp.status_code}: {resp.text}")
                    break

                data = resp.json()
                items = data.get("data", [])

                if not items:
                    break

                for item in items:
                    # Check limit before processing
                    if limit and count >= limit:
                        break

                    title = item.get("name", "")
                    link = item.get("link", "")
                    uri = item.get("uri")
                    duration = item.get("duration", 0)

                    date_key = utils.extract_date_from_string(title)
                    if date_key:
                        if date_key not in video_map:
                            video_map[date_key] = []
                        video_map[date_key].append(
                            {
                                "url": link,
                                "title": title,
                                "uri": uri,
                                "duration": duration,
                            }
                        )
                        count += 1

                # Check limit after processing loop to break outer loop
                if limit and count >= limit:
                    break

                if not data.get("paging", {}).get("next"):
                    break

                params["page"] += 1
                time.sleep(0.5)

            except Exception as e:
                print(f"[!] Exception during metadata fetch: {e}")
                break

        print(f"[*] Found {len(video_map)} videos with identifiable dates.")
        return video_map

    def search_video(self, date_str, title_hint=None):
        """
        Attempts to find a matching video for a specific date and title.
        Returns a dict with {'url', 'title', 'uri'} or None.
        """
        if not self.token:
            return None

        # We could use the search API, but usually fetching the latest
        # is enough for new meetings.
        api_url = f"https://api.vimeo.com/users/{self.vimeo_user}/videos"
        params = {
            "per_page": 20,  # Just check recent ones
            "query": date_str,
            "fields": "uri,name,link",
        }

        try:
            resp = requests.get(api_url, headers=self.headers, params=params)
            if resp.status_code != 200:
                return None

            data = resp.json()
            items = data.get("data", [])

            # First pass: look for exact title match
            fallback_match = None
            for item in items:
                title = item.get("name", "")
                link = item.get("link", "")
                uri = item.get("uri")

                v_date = utils.extract_date_from_string(title)
                if v_date == date_str:
                    # Save first date match as fallback
                    if fallback_match is None:
                        fallback_match = {"url": link, "title": title, "uri": uri}

                    # If we have a title hint, try to match it
                    if title_hint:
                        th = title_hint.lower()
                        tl = title.lower()
                        # Check for keyword matches
                        if "council" in th and "council" in tl:
                            return {"url": link, "title": title, "uri": uri}
                        if "committee" in th and ("committee" in tl or "cow" in tl):
                            return {"url": link, "title": title, "uri": uri}
                        if "public hearing" in th and "public hearing" in tl:
                            return {"url": link, "title": title, "uri": uri}

            # No exact match found, return fallback (first date match)
            if fallback_match:
                return fallback_match

        except Exception as e:
            print(f"  [!] Vimeo search error: {e}")

        return None

    def download_video(
        self, video_data, output_folder, include_video=False, download_audio=False
    ):
        """
        video_data: dict containing {'url', 'title', 'uri'}
        """

        # 1. Check existing files
        # If we just want transcript, check VTT
        if not include_video and not download_audio:
            if glob.glob(os.path.join(output_folder, "*.vtt")):
                return

        # If we want video, check MP4
        if include_video:
            if glob.glob(os.path.join(output_folder, "*.mp4")):
                include_video = False  # Already have it

        # If we want audio, check MP3/M4A/WAV
        if download_audio:
            if (
                glob.glob(os.path.join(output_folder, "*.mp3"))
                or glob.glob(os.path.join(output_folder, "*.m4a"))
                or glob.glob(os.path.join(output_folder, "*.wav"))
            ):
                download_audio = False  # Already have it

        # 2. Download Transcript via API (Disabled by user request)
        # self._download_transcript_api(video_data, output_folder)

        # 3. Download Video Binary (if requested)
        if include_video:
            self._download_mp4_ytdlp(video_data["url"], output_folder)

        # 4. Download Audio Binary (if requested)
        if download_audio:
            self._download_audio_ytdlp(video_data["url"], output_folder)

            # Find the file we just downloaded
            # We look for the most recently created file in the folder matching expected extensions
            files = (
                glob.glob(os.path.join(output_folder, "*.mp3"))
                + glob.glob(os.path.join(output_folder, "*.m4a"))
                + glob.glob(os.path.join(output_folder, "*.wav"))
            )

            if files:
                # Return the most recent one
                return max(files, key=os.path.getctime)

        return None

    def _download_transcript_api(self, video_data, output_folder, retry=True):
        """
        Hits /videos/{id}/texttracks.
        """
        uri = video_data.get("uri")
        if not uri:
            return

        video_id = uri.split("/")[-1]

        # --- CACHE CHECK ---
        cached_link = self.track_url_cache.get(uri)
        if cached_link == "NONE":
            return

        download_link = cached_link

        # --- API REQUEST (If not cached) ---
        if not download_link:
            # Rate limit backoff
            time.sleep(1.0)
            api_url = f"https://api.vimeo.com{uri}/texttracks"

            try:
                resp = requests.get(api_url, headers=self.headers)

                if resp.status_code == 429:
                    print(f"    [API] Rate limit hit (429). Sleeping 15s...")
                    time.sleep(15)
                    resp = requests.get(api_url, headers=self.headers)

                if resp.status_code != 200:
                    print(f"    [API] Failed to fetch tracks: {resp.status_code}")
                    return

                data = resp.json()
                tracks = data.get("data", [])

                if not tracks:
                    self.track_url_cache[uri] = "NONE"
                    print(f"    [API] No text tracks found for {video_id}.")
                    return

                # Prefer English
                target_track = None
                for track in tracks:
                    if track.get("language") == "en":
                        target_track = track
                        break
                if not target_track:
                    target_track = tracks[0]

                download_link = target_track.get("link")

                if download_link:
                    self.track_url_cache[uri] = download_link
                else:
                    self.track_url_cache[uri] = "NONE"

            except Exception as e:
                print(f"    [!] Transcript API error: {e}")
                return

        # --- DOWNLOAD ---
        if download_link:
            safe_title = utils.sanitize_filename(video_data["title"])
            save_path = os.path.join(output_folder, f"{safe_title}.vtt")

            if os.path.exists(save_path):
                return

            print(f"    [Transcript] Downloading VTT...")
            try:
                # FIX: Pass headers (Auth + User-Agent) to the file download too
                vtt_resp = requests.get(download_link, headers=self.headers)

                if vtt_resp.status_code == 200:
                    with open(save_path, "wb") as f:
                        f.write(vtt_resp.content)
                elif vtt_resp.status_code in [403, 404] and retry:
                    # If the link expired or failed, clear cache and try once more
                    print(
                        f"    [Retry] Link failed ({vtt_resp.status_code}). Refreshing metadata..."
                    )
                    if uri in self.track_url_cache:
                        del self.track_url_cache[uri]
                    self._download_transcript_api(
                        video_data, output_folder, retry=False
                    )
                else:
                    print(f"    [!] Link download failed: {vtt_resp.status_code}")

            except Exception as e:
                print(f"    [!] Download exception: {e}")

    def _download_mp4_ytdlp(self, public_url, output_folder):
        print(f"    [Video] Downloading MP4...")
        ydl_opts = {
            "format": "bestvideo+bestaudio/best",
            "merge_output_format": "mp4",
            "outtmpl": os.path.join(output_folder, "%(title)s.%(ext)s"),
            "quiet": False,
            "no_warnings": True,
            "no_overwrites": True,
            "ignoreerrors": True,
            "cookiesfrombrowser": (config.COOKIE_BROWSER,),
            "concurrent_fragment_downloads": 25,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([public_url])
        except Exception:
            pass

    def _download_audio_ytdlp(self, public_url, output_folder):
        print(f"    [Audio] Downloading Audio...")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_folder, "%(title)s.%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "quiet": False,
            "no_warnings": True,
            "no_overwrites": True,
            "ignoreerrors": True,
            "cookiesfrombrowser": (config.COOKIE_BROWSER,),
            "concurrent_fragment_downloads": 15,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([public_url])
        except Exception:
            pass
