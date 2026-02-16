"""
Main speaker diarization pipeline
"""

import mlx.core as mx
import numpy as np
from pathlib import Path
from typing import Union, Optional, Dict, Any
import json

from .models import SegmentationModel, EmbeddingModel
from .audio import AudioProcessor
from .clustering import SpeakerClusterer, VBxClusterer
from .diarization_types import SpeakerDiarization, Turn


class SpeakerDiarizationPipeline:
    """
    Complete speaker diarization pipeline for MLX
    """
    
    def __init__(
        self,
        model_path: Optional[str] = None,
        device: str = "gpu",
        segmentation_threshold: float = 0.5,
        clustering_threshold: float = 0.7,
        min_duration: float = 0.0,
        use_vbx: bool = False,
    ):
        """
        Initialize speaker diarization pipeline
        
        Args:
            model_path: Path to MLX model weights
            device: Device to use ('gpu' or 'cpu')
            segmentation_threshold: Threshold for speaker activity detection
            clustering_threshold: Threshold for speaker clustering
            min_duration: Minimum duration for speaker segments (seconds)
            use_vbx: Use VBx clustering instead of hierarchical
        """
        self.device = device
        self.segmentation_threshold = segmentation_threshold
        self.clustering_threshold = clustering_threshold
        self.min_duration = min_duration
        
        # Initialize audio processor
        self.audio_processor = AudioProcessor()
        
        # Initialize models
        if model_path:
            self._load_models(model_path)
        else:
            # Use default architecture
            self.segmentation_model = SegmentationModel()
            self.embedding_model = EmbeddingModel()
        
        # Initialize clusterer
        if use_vbx:
            self.clusterer = VBxClusterer(threshold=clustering_threshold)
        else:
            self.clusterer = SpeakerClusterer(threshold=clustering_threshold)
    
    def _load_models(self, model_path: str) -> None:
        """Load models from disk"""
        model_path = Path(model_path)
        
        # Load configuration
        config_path = model_path / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
        else:
            config = {}
        
        # Initialize models with config
        hidden_dim = config.get("hidden_dim", 256)
        embedding_dim = config.get("embedding_dim", 256)
        
        self.segmentation_model = SegmentationModel(hidden_dim=hidden_dim)
        self.embedding_model = EmbeddingModel(
            hidden_dim=hidden_dim,
            embedding_dim=embedding_dim,
        )
        
        # Load weights
        weights_file = model_path / "model.safetensors"
        if weights_file.exists():
            weights = mx.load(str(weights_file))
            # Split weights for segmentation and embedding models
            seg_weights = {k.replace("segmentation.", ""): v 
                          for k, v in weights.items() if k.startswith("segmentation.")}
            emb_weights = {k.replace("embedding.", ""): v 
                          for k, v in weights.items() if k.startswith("embedding.")}
            
            if seg_weights:
                self.segmentation_model.load_weights(list(seg_weights.items()))
            if emb_weights:
                self.embedding_model.load_weights(list(emb_weights.items()))
    
    def __call__(
        self,
        audio: Union[str, Dict[str, Any]],
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
    ) -> SpeakerDiarization:
        """
        Run speaker diarization on audio
        
        Args:
            audio: Path to audio file or dict with 'waveform' and 'sample_rate'
            num_speakers: Exact number of speakers (if known)
            min_speakers: Minimum number of speakers
            max_speakers: Maximum number of speakers
        
        Returns:
            SpeakerDiarization object with segments
        """
        # Load and preprocess audio
        if isinstance(audio, str):
            waveform, sample_rate = self.audio_processor.load_audio(audio)
        else:
            waveform = audio["waveform"]
            sample_rate = audio.get("sample_rate", 16000)
        
        waveform = self.audio_processor.preprocess_audio(waveform, sample_rate)
        
        # Extract features
        features = self._extract_features(waveform, sample_rate)
        
        # Segment audio
        segments = self._segment(features)
        
        # Extract embeddings for each segment
        embeddings = self._extract_embeddings(waveform, segments, sample_rate)
        
        # Cluster speakers
        speaker_labels = self._cluster_speakers(
            embeddings,
            segments,
            num_speakers,
            min_speakers,
            max_speakers,
        )
        
        # Build diarization output
        diarization = self._build_diarization(segments, speaker_labels)
        
        return diarization
    
    def _extract_features(self, waveform: np.ndarray, sample_rate: int) -> mx.array:
        """Extract acoustic features from waveform"""
        # Compute mel spectrogram
        mel_spec = self.audio_processor.compute_mel_spectrogram(
            waveform,
            sr=sample_rate,
        )
        
        # Convert to MLX array and add batch dimension
        features = mx.array(mel_spec.T)  # (time, features)
        features = mx.expand_dims(features, axis=0)  # (1, time, features)
        
        return features
    
    def _segment(self, features: mx.array) -> list:
        """Detect speaker segments"""
        # Run segmentation model
        activity, change = self.segmentation_model(features)
        
        # Convert to numpy for post-processing
        activity = np.array(activity[0, :, 0])  # Remove batch and channel dims
        change = np.array(change[0, :, 0])
        
        # Apply threshold
        is_speech = activity > self.segmentation_threshold
        is_change = change > self.segmentation_threshold
        
        # Find segments
        segments = []
        start = None
        
        for i, (speech, chg) in enumerate(zip(is_speech, is_change)):
            # Frame to time (assuming 10ms frames)
            time = i * 0.01
            
            if speech and start is None:
                start = time
            elif (not speech or chg) and start is not None:
                if time - start >= self.min_duration:
                    segments.append((start, time))
                start = time if speech else None
        
        # Close final segment if needed
        if start is not None:
            segments.append((start, len(is_speech) * 0.01))
        
        return segments
    
    def _extract_embeddings(
        self,
        waveform: np.ndarray,
        segments: list,
        sample_rate: int,
    ) -> np.ndarray:
        """Extract speaker embeddings for each segment"""
        embeddings = []
        
        for start, end in segments:
            # Extract segment audio
            start_sample = int(start * sample_rate)
            end_sample = int(end * sample_rate)
            segment_audio = waveform[start_sample:end_sample]
            
            # Extract features
            features = self.audio_processor.compute_mel_spectrogram(
                segment_audio,
                sr=sample_rate,
            )
            
            # Convert to MLX array
            features = mx.array(features.T)  # (time, features)
            features = mx.expand_dims(features, axis=0)  # (1, time, features)
            
            # Extract embedding
            embedding = self.embedding_model(features)
            embeddings.append(np.array(embedding[0]))  # Remove batch dim
        
        return np.array(embeddings) if embeddings else np.array([])
    
    def _cluster_speakers(
        self,
        embeddings: np.ndarray,
        segments: list,
        num_speakers: Optional[int],
        min_speakers: Optional[int],
        max_speakers: Optional[int],
    ) -> np.ndarray:
        """Cluster embeddings to identify speakers"""
        if len(embeddings) == 0:
            return np.array([])
        
        # Use temporal constraints if available
        speaker_segments = self.clusterer.cluster_with_constraint(
            embeddings,
            segments,
            min_duration=self.min_duration,
        )
        
        # Build labels array
        labels = np.zeros(len(segments), dtype=int)
        segment_to_idx = {seg: i for i, seg in enumerate(segments)}
        
        for speaker_id, spk_segs in speaker_segments.items():
            for seg in spk_segs:
                if seg in segment_to_idx:
                    labels[segment_to_idx[seg]] = speaker_id
        
        # Apply speaker count constraints if specified
        if num_speakers is not None:
            # TODO: Implement re-clustering with fixed number
            pass
        
        return labels
    
    def _build_diarization(
        self,
        segments: list,
        labels: np.ndarray,
    ) -> SpeakerDiarization:
        """Build final diarization output"""
        diarization = SpeakerDiarization()
        
        for (start, end), label in zip(segments, labels):
            speaker_id = f"SPEAKER_{label:02d}"
            diarization.add_segment(start, end, speaker_id)
        
        return diarization


def load_pipeline(
    model_path: str,
    device: str = "gpu",
    **kwargs,
) -> SpeakerDiarizationPipeline:
    """
    Load a speaker diarization pipeline from disk
    
    Args:
        model_path: Path to model directory
        device: Device to use ('gpu' or 'cpu')
        **kwargs: Additional pipeline configuration
    
    Returns:
        Configured pipeline
    """
    return SpeakerDiarizationPipeline(
        model_path=model_path,
        device=device,
        **kwargs,
    )
