import os
import time
import json
from google import genai
from google.genai import types

from src.core import config

class GeminiDiarizer:
    def __init__(self):
        self.api_key = config.GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment.")

        self.client = genai.Client(api_key=self.api_key)

        # Use latest Gemini Flash for speed and long context
        self.model_name = "gemini-flash-latest"

    def _upload_and_wait(self, audio_path):
        """Upload audio file and wait for processing."""
        print(f"[Diarizer] Uploading {os.path.basename(audio_path)} to Gemini...")

        audio_file = self.client.files.upload(file=audio_path)

        print(f"    [Diarizer] Waiting for processing...", end="", flush=True)
        while audio_file.state.name == "PROCESSING":
            time.sleep(2)
            print(".", end="", flush=True)
            audio_file = self.client.files.get(name=audio_file.name)

        if audio_file.state.name == "FAILED":
            print("\n    [!] Audio processing failed.")
            return None

        print(" Done.")
        return audio_file

    def get_speaker_map(self, audio_path, context=None):
        """
        Analyze audio and return speaker identification mapping.

        Returns:
            {
                "speaker_aliases": [
                    {"label": "Speaker_01", "name": "Mayor David Screech", "confidence": 0.95},
                    ...
                ],
                "speaker_segments": [
                    {"start": 0.0, "end": 5.2, "speaker": "Mayor David Screech"},
                    {"start": 5.2, "end": 12.8, "speaker": "Councillor Mattson"},
                    ...
                ]
            }
        """
        try:
            audio_file = self._upload_and_wait(audio_path)
            if not audio_file:
                return None

            context_prompt = ""
            if context:
                context_prompt = f"""
Use this meeting context to identify speakers by their real names:
{context[:8000]}
"""

            prompt = f"""
Analyze this audio from a Town of View Royal council meeting.
{context_prompt}

Your task is to identify WHO is speaking. Do NOT transcribe the words.

Return a JSON object with:

"speaker_aliases": A list mapping each unique voice to a real name:
  - "label": A generic ID like "Speaker_01", "Speaker_02", etc.
  - "name": The person's real name (e.g., "Mayor David Screech", "Councillor Mattson")
  - "confidence": How confident you are (0.0 to 1.0)

Use context clues like:
- How people address each other ("Thank you, Councillor Mattson")
- Role references ("The Mayor noted...", "Staff reported...")
- Voice characteristics

Return ONLY the JSON object with speaker_aliases.
"""

            print(f"    [Diarizer] Analyzing speakers with {self.model_name}...")

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt, audio_file],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    safety_settings=[
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        )
                    ]
                )
            )

            # Cleanup remote file
            self.client.files.delete(name=audio_file.name)

            return response.text

        except Exception as e:
            print(f"\n    [!] Diarization Error: {e}")
            return None

    def get_speaker_segments(self, audio_path, context=None):
        """
        Pass 2: Get consolidated speaker segments with timestamps.

        Returns speaker segments for time-based alignment with local transcript.
        Each segment represents when one speaker talks continuously.

        Returns:
            {
                "speaker_segments": [
                    {"start": 0.0, "end": 45.2, "speaker": "Mayor Screech"},
                    {"start": 45.2, "end": 52.1, "speaker": "Councillor Mattson"},
                    ...
                ]
            }
        """
        try:
            audio_file = self._upload_and_wait(audio_path)
            if not audio_file:
                return None

            context_prompt = ""
            if context:
                context_prompt = f"""
Use this meeting context to identify speakers by their real names:
{context[:8000]}
"""

            prompt = f"""
Analyze this audio from a Town of View Royal council meeting.
{context_prompt}

Return speaker segments for this audio. Each segment is when one speaker
talks continuously. Merge adjacent utterances from the same speaker.

Return a JSON object with:

"speaker_segments": A list of segments with:
  - "start": Start time in seconds (float)
  - "end": End time in seconds (float)
  - "speaker": The person's real name (e.g., "Mayor David Screech", "Councillor Mattson")

Only record when the speaker CHANGES. Keep output concise.
Focus on accuracy of speaker identification over exact timestamps.

Example output:
{{"speaker_segments": [
    {{"start": 0.0, "end": 45.2, "speaker": "Mayor Screech"}},
    {{"start": 45.2, "end": 52.1, "speaker": "Councillor Mattson"}}
]}}
"""

            print(f"    [Diarizer] Getting speaker segments with {self.model_name}...")

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt, audio_file],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=16384,
                    safety_settings=[
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                            threshold=types.HarmBlockThreshold.BLOCK_NONE
                        )
                    ]
                )
            )

            # Cleanup remote file
            self.client.files.delete(name=audio_file.name)

            return response.text

        except Exception as e:
            print(f"\n    [!] Speaker segments error: {e}")
            return None

    def diarize_audio(self, audio_path, context=None):
        """
        Legacy method - returns full transcript with speaker labels.
        For new code, prefer get_speaker_map() which is more token-efficient.
        """
        return self.get_speaker_map(audio_path, context)