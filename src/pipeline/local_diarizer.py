"""
Local transcription and speaker diarization using senko + parakeet.

Uses senko for diarization (with voice fingerprinting via CAM++ embeddings)
and parakeet-mlx for transcription, running entirely on Apple Silicon.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


class LocalDiarizer:
    """
    Local diarization pipeline using senko + parakeet.

    Extracts speaker centroids (voice fingerprints) from senko's CAM++ embeddings
    and can match them against known speakers in the database.
    """

    def __init__(self, supabase_client=None, use_parakeet=False):
        """
        Initialize the LocalDiarizer.

        Args:
            supabase_client: Optional Supabase client for fingerprint matching
            use_parakeet: Ignored, kept for API compatibility
        """
        print("[LocalDiarizer] Initializing senko + parakeet pipeline...")
        self.supabase = supabase_client
        self._senko_diarizer = None
        self._known_fingerprints = None

    def _get_senko_diarizer(self):
        """Lazily initialize the senko diarizer."""
        if self._senko_diarizer is None:
            try:
                import senko

                print("    [Init] Loading senko diarizer (CoreML)...")
                self._senko_diarizer = senko.Diarizer(device="auto", quiet=False)
            except ImportError as e:
                print(f"    [!] Failed to import senko: {e}")
                print(
                    '    [!] Install with: uv add "senko @ git+https://github.com/narcotic-sh/senko"'
                )
                raise
        return self._senko_diarizer

    def _load_known_fingerprints(self):
        """Load known voice fingerprints from database."""
        if self._known_fingerprints is not None:
            return self._known_fingerprints

        if self.supabase is None:
            self._known_fingerprints = {}
            return self._known_fingerprints

        print("    [Fingerprints] Loading known voice fingerprints...")
        try:
            result = (
                self.supabase.table("voice_fingerprints")
                .select(
                    "id, person_id, embedding, people!voice_fingerprints_person_id_fkey(name)"
                )
                .execute()
            )

            self._known_fingerprints = {}
            for row in result.data:
                if row["embedding"] and row["people"]:
                    self._known_fingerprints[row["id"]] = {
                        "person_id": row["person_id"],
                        "person_name": row["people"]["name"],
                        "embedding": np.array(row["embedding"], dtype=np.float32),
                    }
            print(
                f"    [Fingerprints] Loaded {len(self._known_fingerprints)} known speakers"
            )
        except Exception as e:
            print(f"    [!] Failed to load fingerprints: {e}")
            self._known_fingerprints = {}

        return self._known_fingerprints

    def _match_speaker_to_known(
        self, centroid: np.ndarray, threshold: float = 0.75
    ) -> Optional[dict]:
        """
        Match a speaker centroid against known fingerprints.

        Args:
            centroid: 192-dim CAM++ embedding
            threshold: Minimum cosine similarity to consider a match

        Returns:
            Dict with person_id, person_name, similarity if matched, else None
        """
        known = self._load_known_fingerprints()
        if not known:
            return None

        best_match = None
        best_similarity = threshold

        for fp_id, fp_data in known.items():
            similarity = cosine_similarity(centroid, fp_data["embedding"])
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = {
                    "fingerprint_id": fp_id,
                    "person_id": fp_data["person_id"],
                    "person_name": fp_data["person_name"],
                    "similarity": similarity,
                }

        return best_match

    def _prepare_audio(
        self, audio_path: str, limit_duration: Optional[int] = None
    ) -> Optional[str]:
        """
        Convert audio to 16kHz mono WAV for senko.

        Args:
            audio_path: Path to input audio
            limit_duration: Optional duration limit in seconds

        Returns:
            Path to converted WAV file
        """
        clean_name = os.path.basename(audio_path).replace(" ", "_")
        temp_filename = f"temp_proc_{clean_name}.wav"
        temp_path = os.path.join(os.path.dirname(audio_path), temp_filename)

        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            audio_path,
            "-ac",
            "1",  # Mono
            "-ar",
            "16000",  # 16kHz
            "-acodec",
            "pcm_s16le",  # 16-bit PCM
        ]

        if limit_duration:
            print(f"    [Test Mode] Limiting audio to {limit_duration} seconds...")
            cmd.extend(["-t", str(limit_duration)])
        else:
            print("    [Preprocessing] Converting to 16kHz mono WAV...")

        cmd.append(temp_path)

        try:
            subprocess.run(
                cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
            )
            return temp_path
        except subprocess.CalledProcessError as e:
            print(f"    [!] FFmpeg Error: {e.stderr.decode()}")
            return None
        except FileNotFoundError:
            print("    [!] FFmpeg not found. Please install ffmpeg.")
            return None

    def _run_transcription(self, wav_path: str) -> list:
        """
        Run transcription using parakeet-mlx via uvx.

        Returns list of segments with start, end, text.
        """
        print("    [Transcription] Running parakeet-mlx...")

        with tempfile.TemporaryDirectory() as tmp_dir:
            try:
                result = subprocess.run(
                    [
                        "uvx",
                        "parakeet-mlx>=0.4,<1",
                        wav_path,
                        "--output-format",
                        "json",
                        "--output-dir",
                        tmp_dir,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=3600,
                )

                if result.returncode != 0:
                    print(f"    [!] Parakeet failed: {result.stderr}")
                    return []

                # Find output JSON
                json_files = list(Path(tmp_dir).glob("*.json"))
                if not json_files:
                    print("    [!] No transcription output found")
                    return []

                with open(json_files[0], "r") as f:
                    data = json.load(f)

                segments = []
                for seg in data.get("segments", data.get("sentences", [])):
                    text = seg.get("text", "").strip()
                    start = seg.get("start")
                    end = seg.get("end")
                    if text and start is not None and end is not None:
                        segments.append(
                            {"start": float(start), "end": float(end), "text": text}
                        )

                print(f"    [Transcription] Got {len(segments)} segments")
                return segments

            except subprocess.TimeoutExpired:
                print("    [!] Transcription timed out")
                return []
            except Exception as e:
                print(f"    [!] Transcription error: {e}")
                return []

    def diarize_audio(
        self,
        audio_path: str,
        context=None,
        limit_duration: Optional[int] = None,
        existing_transcript: Optional[list] = None,
        force_regenerate: bool = False,
    ) -> Optional[str]:
        """
        Transcribe and diarize audio, with voice fingerprint matching.

        Args:
            audio_path: Path to audio file
            context: Ignored, kept for API compatibility
            limit_duration: Optional duration limit for testing
            existing_transcript: Optional list of segments to reuse (skips STT)
            force_regenerate: If True, ignore cached results and regenerate

        Returns:
            JSON string with speaker-attributed transcript
        """
        print(f"[LocalDiarizer] Processing {os.path.basename(audio_path)}...")

        # Check for cached result
        output_json_path = os.path.splitext(audio_path)[0] + ".json"

        if (
            os.path.exists(output_json_path)
            and not existing_transcript
            and not force_regenerate
        ):
            print(
                f"    [Cache] Found existing transcript at {os.path.basename(output_json_path)}"
            )
            try:
                with open(output_json_path, "r") as f:
                    cached = json.load(f)
                    # Check if it has centroids (new format) - if so, return as-is
                    if isinstance(cached, dict) and cached.get("speaker_centroids"):
                        return json.dumps(cached.get("segments", []), indent=2)
                    # Check if it's already in our format (old format without centroids)
                    if isinstance(cached, list) and cached and "speaker" in cached[0]:
                        # Old format - needs regeneration to get centroids
                        print(
                            "    [Cache] Old format without centroids, regenerating..."
                        )
                    else:
                        return json.dumps(cached, indent=2)
            except Exception as e:
                print(f"    [!] Cache read failed: {e}, reprocessing...")

        # Prepare audio
        wav_path = self._prepare_audio(audio_path, limit_duration)
        if not wav_path:
            return None

        try:
            # Run diarization with senko
            print("    [Diarization] Running senko...")
            diarizer = self._get_senko_diarizer()
            diarization_result = diarizer.diarize(wav_path)

            if diarization_result is None:
                print("    [!] No speech detected in audio")
                return None

            speaker_segments = diarization_result.get("merged_segments", [])
            speaker_centroids = diarization_result.get("speaker_centroids", {})

            print(
                f"    [Diarization] Found {len(set(s['speaker'] for s in speaker_segments))} speakers"
            )

            # Match speakers to known fingerprints
            speaker_mapping = {}
            speaker_aliases = []  # For AI refiner compatibility
            fingerprint_matches = {}  # Full match details

            for speaker_id, centroid in speaker_centroids.items():
                if isinstance(centroid, np.ndarray):
                    match = self._match_speaker_to_known(centroid)
                    if match:
                        speaker_mapping[speaker_id] = match["person_name"]
                        fingerprint_matches[speaker_id] = match
                        # Add to speaker_aliases in the format AI refiner expects
                        speaker_aliases.append(
                            {
                                "label": speaker_id,
                                "name": match["person_name"],
                                "person_id": match["person_id"],
                                "confidence": match["similarity"],
                                "source": "voice_fingerprint",
                            }
                        )
                        print(
                            f"    [Match] {speaker_id} -> {match['person_name']} ({match['similarity']:.2%})"
                        )

            # Run transcription (or use existing)
            if existing_transcript:
                print("    [Transcription] Using existing segments (skipping STT)...")
                transcription = []
                for s in existing_transcript:
                    # Normalize keys
                    start = (
                        s.get("start")
                        if s.get("start") is not None
                        else s.get("start_time")
                    )
                    end = (
                        s.get("end") if s.get("end") is not None else s.get("end_time")
                    )
                    text = s.get("text", "")
                    if start is not None and end is not None:
                        transcription.append(
                            {"start": float(start), "end": float(end), "text": text}
                        )
            else:
                transcription = self._run_transcription(wav_path)

            if not transcription:
                print("    [!] Transcription failed or empty")
                return None

            # Merge transcription with diarization
            final_transcript = self._merge_results(
                transcription, speaker_segments, speaker_mapping
            )

            # Build speaker samples (first segment timestamp for each speaker)
            speaker_samples = {}
            for seg in speaker_segments:
                spk = seg.get("speaker")
                if spk and spk not in speaker_samples:
                    speaker_samples[spk] = {
                        "start": seg.get("start", 0),
                        "end": min(
                            seg.get("end", 0), seg.get("start", 0) + 15
                        ),  # Max 15 sec
                    }

            # Save result
            result_data = {
                "segments": final_transcript,
                "speaker_centroids": {
                    k: v.tolist() if isinstance(v, np.ndarray) else v
                    for k, v in speaker_centroids.items()
                },
                "speaker_samples": speaker_samples,
                "speaker_mapping": speaker_mapping,
                "speaker_aliases": speaker_aliases,  # Pre-matched aliases from voice fingerprints
                "fingerprint_matches": {
                    k: {
                        "person_id": v["person_id"],
                        "person_name": v["person_name"],
                        "similarity": v["similarity"],
                        "fingerprint_id": v["fingerprint_id"],
                    }
                    for k, v in fingerprint_matches.items()
                },
            }

            try:
                with open(output_json_path, "w") as f:
                    json.dump(result_data, f, indent=2)
                print(f"    [Cache] Saved to {os.path.basename(output_json_path)}")
            except Exception as e:
                print(f"    [!] Failed to save: {e}")

            return json.dumps(final_transcript, indent=2)

        finally:
            # Cleanup temp file
            if wav_path != audio_path and os.path.exists(wav_path):
                os.remove(wav_path)

    def _merge_results(
        self, transcription: list, diarization: list, speaker_mapping: dict
    ) -> list:
        """
        Merge transcription segments with speaker diarization.

        Uses time overlap to assign speakers to transcript segments.
        """
        if not diarization:
            return [
                {**seg, "speaker": "Speaker_Unknown", "speaker_confidence": 0.0}
                for seg in transcription
            ]

        # Sort diarization by start time
        diarization = sorted(diarization, key=lambda x: x["start"])

        merged = []
        for seg in transcription:
            seg_start = seg["start"]
            seg_end = seg["end"]

            # Find best matching speaker by overlap
            best_speaker = "Speaker_Unknown"
            best_overlap = 0.0

            for d_seg in diarization:
                d_start = d_seg["start"]
                d_end = d_seg["end"]

                # Calculate overlap
                overlap_start = max(seg_start, d_start)
                overlap_end = min(seg_end, d_end)
                overlap = max(0, overlap_end - overlap_start)

                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = d_seg["speaker"]

            # Apply speaker mapping if available
            display_speaker = speaker_mapping.get(best_speaker, best_speaker)

            # Clean up speaker label
            if display_speaker.startswith("SPEAKER_"):
                num = display_speaker.replace("SPEAKER_", "").lstrip("0") or "0"
                display_speaker = f"Speaker_{num}"

            # Calculate confidence based on overlap ratio
            seg_duration = seg_end - seg_start
            confidence = best_overlap / seg_duration if seg_duration > 0 else 0.0

            merged.append(
                {
                    "start": seg_start,
                    "end": seg_end,
                    "text": seg["text"],
                    "speaker": display_speaker,
                    "speaker_confidence": round(confidence, 3),
                }
            )

        return merged

    def save_speaker_fingerprint(
        self, person_id: int, centroid: np.ndarray, meeting_id: Optional[int] = None
    ) -> Optional[str]:
        """
        Save a speaker's voice fingerprint to the database.

        Args:
            person_id: Database ID of the person
            centroid: 192-dim CAM++ embedding
            meeting_id: Optional source meeting ID

        Returns:
            UUID of the created fingerprint, or None on error
        """
        if self.supabase is None:
            print("    [!] No database connection for saving fingerprint")
            return None

        try:
            result = (
                self.supabase.table("voice_fingerprints")
                .insert(
                    {
                        "person_id": person_id,
                        "embedding": centroid.tolist(),
                        "source_meeting_id": meeting_id,
                    }
                )
                .execute()
            )

            if result.data:
                fp_id = result.data[0]["id"]

                # Update person's voice_fingerprint_id
                self.supabase.table("people").update(
                    {"voice_fingerprint_id": fp_id}
                ).eq("id", person_id).execute()

                # Clear cache
                self._known_fingerprints = None

                print(
                    f"    [Fingerprint] Saved fingerprint {fp_id} for person {person_id}"
                )
                return fp_id

        except Exception as e:
            print(f"    [!] Failed to save fingerprint: {e}")

        return None
