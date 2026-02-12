"""
Data structures for speaker diarization output
"""

from dataclasses import dataclass
from typing import Iterator, Tuple


@dataclass
class Turn:
    """Represents a time segment"""
    start: float
    end: float
    
    def __repr__(self) -> str:
        return f"Turn(start={self.start:.3f}, end={self.end:.3f})"
    
    @property
    def duration(self) -> float:
        """Get duration of the turn"""
        return self.end - self.start


@dataclass
class SpeakerDiarization:
    """Represents speaker diarization output"""
    _segments: list  # List of (Turn, speaker_id) tuples
    
    def __init__(self):
        self._segments = []
    
    def add_segment(self, start: float, end: float, speaker_id: str) -> None:
        """Add a speaker segment"""
        self._segments.append((Turn(start, end), speaker_id))
    
    def __iter__(self) -> Iterator[Tuple[Turn, str]]:
        """Iterate over (Turn, speaker_id) pairs"""
        return iter(self._segments)
    
    @property
    def speaker_diarization(self) -> Iterator[Tuple[Turn, str]]:
        """Get speaker diarization segments"""
        return iter(self._segments)
    
    def __repr__(self) -> str:
        return f"SpeakerDiarization(segments={len(self._segments)})"
