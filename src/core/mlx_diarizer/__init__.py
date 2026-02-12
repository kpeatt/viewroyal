"""
Speaker Diarization MLX - MLX implementation of pyannote speaker diarization
"""

__version__ = "0.1.0"
__author__ = "MLX Community"

from .pipeline import SpeakerDiarizationPipeline
from .models import (
    SegmentationModel,
    EmbeddingModel,
)
from .diarization_types import (
    SpeakerDiarization,
    Turn,
)

__all__ = [
    "SpeakerDiarizationPipeline",
    "SegmentationModel",
    "EmbeddingModel",
    "SpeakerDiarization",
    "Turn",
]
