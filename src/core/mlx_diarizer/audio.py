"""
Audio processing utilities for speaker diarization
"""

import numpy as np
import librosa
from typing import Tuple, Union


class AudioProcessor:
    """Handle audio loading and preprocessing"""
    
    TARGET_SAMPLE_RATE = 16000
    
    @classmethod
    def load_audio(
        cls,
        audio_path: str,
        sr: int = TARGET_SAMPLE_RATE,
    ) -> Tuple[np.ndarray, int]:
        """
        Load audio file and resample to target sample rate
        
        Args:
            audio_path: Path to audio file
            sr: Target sample rate (default: 16000 Hz)
        
        Returns:
            Tuple of (waveform, sample_rate)
        """
        y, _ = librosa.load(audio_path, sr=sr, mono=True)
        return y, sr
    
    @classmethod
    def preprocess_audio(
        cls,
        waveform: np.ndarray,
        sr: int = TARGET_SAMPLE_RATE,
    ) -> np.ndarray:
        """
        Preprocess audio waveform
        
        Args:
            waveform: Audio waveform
            sr: Sample rate
        
        Returns:
            Preprocessed waveform
        """
        # Normalize to [-1, 1]
        max_val = np.max(np.abs(waveform))
        if max_val > 0:
            waveform = waveform / max_val
        
        return waveform
    
    @classmethod
    def extract_frames(
        cls,
        waveform: np.ndarray,
        frame_size: int = 512,
        hop_length: int = 160,
    ) -> np.ndarray:
        """
        Extract frames from waveform for processing
        
        Args:
            waveform: Audio waveform
            frame_size: Size of each frame
            hop_length: Number of samples between frames
        
        Returns:
            Frame array of shape (n_frames, frame_size)
        """
        n_frames = (len(waveform) - frame_size) // hop_length + 1
        frames = np.zeros((n_frames, frame_size))
        
        for i in range(n_frames):
            start = i * hop_length
            end = start + frame_size
            frames[i] = waveform[start:end]
        
        return frames
    
    @classmethod
    def compute_mfcc(
        cls,
        waveform: np.ndarray,
        sr: int = TARGET_SAMPLE_RATE,
        n_mfcc: int = 13,
        n_fft: int = 400,
        hop_length: int = 160,
    ) -> np.ndarray:
        """
        Compute MFCC features
        
        Args:
            waveform: Audio waveform
            sr: Sample rate
            n_mfcc: Number of MFCCs
            n_fft: FFT window size
            hop_length: Number of samples between frames
        
        Returns:
            MFCC features of shape (n_mfcc, n_frames)
        """
        mfcc = librosa.feature.mfcc(
            y=waveform,
            sr=sr,
            n_mfcc=n_mfcc,
            n_fft=n_fft,
            hop_length=hop_length,
        )
        return mfcc
    
    @classmethod
    def compute_mel_spectrogram(
        cls,
        waveform: np.ndarray,
        sr: int = TARGET_SAMPLE_RATE,
        n_mels: int = 128,
        n_fft: int = 400,
        hop_length: int = 160,
    ) -> np.ndarray:
        """
        Compute mel spectrogram
        
        Args:
            waveform: Audio waveform
            sr: Sample rate
            n_mels: Number of mel bands
            n_fft: FFT window size
            hop_length: Number of samples between frames
        
        Returns:
            Mel spectrogram of shape (n_mels, n_frames)
        """
        mel_spec = librosa.feature.melspectrogram(
            y=waveform,
            sr=sr,
            n_mels=n_mels,
            n_fft=n_fft,
            hop_length=hop_length,
        )
        # Convert to log scale
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        return mel_spec_db
