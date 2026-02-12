"""
MLX implementation of speaker diarization models
"""

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from typing import Tuple, Optional
from pathlib import Path


class SegmentationModel(nn.Module):
    """
    Speaker segmentation model
    Predicts speaker activity and boundaries
    """
    
    def __init__(
        self,
        input_dim: int = 128,
        hidden_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        # LSTM layers for temporal modeling
        self.lstm_layers = []
        for i in range(num_layers):
            in_dim = input_dim if i == 0 else hidden_dim
            self.lstm_layers.append(
                nn.LSTM(
                    input_size=in_dim,
                    hidden_size=hidden_dim,
                )
            )
        
        self.dropout = nn.Dropout(dropout)
        
        # Output layer for speaker activity prediction (binary classification per frame)
        self.activity_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, 1),
        )
        
        # Output layer for speaker change detection
        self.change_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, 1),
        )
    
    def __call__(
        self,
        x: mx.array,
        lengths: Optional[mx.array] = None,
    ) -> Tuple[mx.array, mx.array]:
        """
        Forward pass for segmentation
        
        Args:
            x: Input features of shape (batch_size, seq_len, input_dim)
            lengths: Optional sequence lengths
        
        Returns:
            Tuple of (activity_logits, change_logits)
                activity_logits: shape (batch_size, seq_len, 1)
                change_logits: shape (batch_size, seq_len, 1)
        """
        # Pass through LSTM layers
        h = x
        for lstm in self.lstm_layers:
            h, _ = lstm(h)  # LSTM returns (output, hidden_state)
            h = self.dropout(h)
        
        # Compute outputs
        activity = self.activity_head(h)
        change = self.change_head(h)
        
        return activity, change


class EmbeddingModel(nn.Module):
    """
    Speaker embedding model
    Extracts speaker embeddings for clustering
    """
    
    def __init__(
        self,
        input_dim: int = 128,
        hidden_dim: int = 256,
        embedding_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.embedding_dim = embedding_dim
        
        # LSTM layers
        self.lstm_layers = []
        for i in range(num_layers):
            in_dim = input_dim if i == 0 else hidden_dim
            self.lstm_layers.append(
                nn.LSTM(
                    input_size=in_dim,
                    hidden_size=hidden_dim,
                )
            )
        
        self.dropout = nn.Dropout(dropout)
        
        # Embedding extraction layers
        self.embedding_net = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, embedding_dim),
        )
    
    def __call__(self, x: mx.array, mask: Optional[mx.array] = None) -> mx.array:
        """
        Forward pass for embedding extraction
        
        Args:
            x: Input features of shape (batch_size, seq_len, input_dim)
            mask: Optional mask for valid frames
        
        Returns:
            Speaker embeddings of shape (batch_size, embedding_dim)
        """
        # Pass through LSTM layers
        h = x
        for lstm in self.lstm_layers:
            h, _ = lstm(h)  # LSTM returns (output, hidden_state)
            h = self.dropout(h)
        
        # Mean pooling over time
        if mask is not None:
            mask = mx.expand_dims(mask, axis=-1)
            h = mx.sum(h * mask, axis=1) / (mx.sum(mask, axis=1) + 1e-6)
        else:
            h = mx.mean(h, axis=1)
        
        # Extract embeddings
        embeddings = self.embedding_net(h)
        
        # L2 normalization
        embeddings = embeddings / (mx.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-6)
        
        return embeddings


class SpeakerDiarizationModel(nn.Module):
    """
    Complete speaker diarization model combining segmentation and embedding
    """
    
    def __init__(
        self,
        input_dim: int = 128,
        hidden_dim: int = 256,
        embedding_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        
        self.segmentation = SegmentationModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            dropout=dropout,
        )
        
        self.embedding = EmbeddingModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            embedding_dim=embedding_dim,
            num_layers=num_layers,
            dropout=dropout,
        )
    
    def __call__(
        self,
        x: mx.array,
        mask: Optional[mx.array] = None,
    ) -> Tuple[mx.array, mx.array, mx.array]:
        """
        Forward pass for complete diarization
        
        Args:
            x: Input features
            mask: Optional mask for valid frames
        
        Returns:
            Tuple of (activity_logits, change_logits, embeddings)
        """
        activity, change = self.segmentation(x)
        embeddings = self.embedding(x, mask)
        
        return activity, change, embeddings


class SincConv1d(nn.Module):
    """
    SincNet: Learnable bandpass filters for raw waveform processing.
    Ported from pyannote.audio PyTorch implementation.
    
    Reference: https://github.com/mravanelli/SincNet
    """
    
    def __init__(
        self,
        n_filters: int = 80,
        kernel_size: int = 251,
        sample_rate: int = 16000,
        min_low_hz: float = 50.0,
        min_band_hz: float = 50.0,
        stride: int = 10,
    ):
        super().__init__()
        
        # Force odd kernel size
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        self.n_filters = n_filters
        self.kernel_size = kernel_size
        self.sample_rate = sample_rate
        self.min_low_hz = min_low_hz
        self.min_band_hz = min_band_hz
        self.stride = stride
        self.half_kernel = kernel_size // 2
        
        # Initialize learnable parameters
        self._initialize_filters()
        
        # Create Hamming window (half window only, for symmetry)
        window = np.hamming(kernel_size)[:self.half_kernel]
        self.window_ = mx.array(window, dtype=mx.float32)
        
        # Time vector for filter generation
        n = 2 * np.pi * np.arange(-self.half_kernel, 0.0) / sample_rate
        self.n_ = mx.array(n.reshape(1, -1), dtype=mx.float32)
    
    def _initialize_filters(self):
        """Initialize filter parameters on mel scale."""
        # Mel scale helpers
        def to_mel(hz):
            return 2595 * np.log10(1 + hz / 700)
        
        def to_hz(mel):
            return 700 * (10 ** (mel / 2595) - 1)
        
        # Initialize on mel scale
        low_hz = 30
        high_hz = self.sample_rate / 2 - (self.min_low_hz + self.min_band_hz)
        
        mel = np.linspace(
            to_mel(low_hz),
            to_mel(high_hz),
            self.n_filters // 2 + 1,
            dtype=np.float32
        )
        hz = to_hz(mel)
        
        # Learnable parameters (shape: n_filters//2, 1)
        self.low_hz_ = mx.array(hz[:-1].reshape(-1, 1), dtype=mx.float32)
        self.band_hz_ = mx.array(np.diff(hz).reshape(-1, 1), dtype=mx.float32)
    
    def make_filters(self, low, high, filt_type: str = "cos"):
        """
        Generate bandpass filters using sinc functions.
        Formula: h_BP(t) = 2*f_high*sinc(2*f_high*t) - 2*f_low*sinc(2*f_low*t)
        """
        band = high[:, 0] - low[:, 0]
        
        # Frequency components at time points n_
        ft_low = low @ self.n_
        ft_high = high @ self.n_
        
        if filt_type == "cos":  # Real/even filters (cosine component)
            # Bandpass: difference of sinc functions
            bp_left = ((mx.sin(ft_high) - mx.sin(ft_low)) / (self.n_ / 2)) * self.window_
            bp_center = 2 * band.reshape(-1, 1)
            bp_right = bp_left[:, ::-1]  # Reverse along time axis
        
        elif filt_type == "sin":  # Imaginary/odd filters (sine component)
            bp_left = ((mx.cos(ft_low) - mx.cos(ft_high)) / (self.n_ / 2)) * self.window_
            bp_center = mx.zeros_like(band.reshape(-1, 1))
            bp_right = -bp_left[:, ::-1]  # Negative reverse along time axis
        
        else:
            raise ValueError(f"Unknown filter type: {filt_type}")
        
        # Concatenate left, center, right and normalize by bandwidth
        band_pass = mx.concatenate([bp_left, bp_center, bp_right], axis=1)
        band_pass = band_pass / (2 * band[:, None])
        
        return band_pass.reshape(self.n_filters // 2, 1, self.kernel_size)
    
    def get_filters(self):
        """Compute filters from learnable parameters."""
        # Apply constraints to ensure valid frequency ranges
        low = self.min_low_hz + mx.abs(self.low_hz_)
        high = mx.clip(
            low + self.min_band_hz + mx.abs(self.band_hz_),
            self.min_low_hz,
            self.sample_rate / 2
        )
        
        # Generate both cosine (real) and sine (imaginary) filters
        cos_filters = self.make_filters(low, high, filt_type="cos")
        sin_filters = self.make_filters(low, high, filt_type="sin")
        
        return mx.concatenate([cos_filters, sin_filters], axis=0)
    
    def __call__(self, x):
        """
        Apply SincNet convolution to waveform.
        
        Args:
            x: Input waveform, shape (batch, 1, samples) or (batch, samples)
        
        Returns:
            Features, shape (batch, n_filters, time_steps)
        """
        # Ensure correct input shape (batch, 1, samples)
        if x.ndim == 2:
            x = mx.expand_dims(x, axis=1)
        
        # Get filters on-the-fly
        filters = self.get_filters()  # (n_filters, 1, kernel_size)
        
        # MLX conv1d expects:
        # - input: (batch, length, in_channels) 
        # - weight: (out_channels, kernel_size, in_channels)
        # PyTorch format is: (batch, channels, length) and (out_channels, in_channels, kernel_size)
        
        # Transpose input from (batch, channels, length) to (batch, length, channels)
        x_mlx = mx.transpose(x, (0, 2, 1))  # (batch, samples, 1)
        
        # Transpose filters from (out_channels, in_channels, kernel_size) to (out_channels, kernel_size, in_channels)
        filters_mlx = mx.transpose(filters, (0, 2, 1))  # (n_filters, kernel_size, 1)
        
        # Apply 1D convolution
        output = mx.conv1d(x_mlx, filters_mlx, stride=self.stride, padding=0)
        
        # Transpose output back from (batch, length, channels) to (batch, channels, length)
        output = mx.transpose(output, (0, 2, 1))
        
        return output


class SincNet(nn.Module):
    """
    SincNet frontend: 3-layer convolutional network for raw waveform processing.
    Ported from pyannote.audio implementation.
    
    Architecture:
        Layer 1: SincNet (80 learnable bandpass filters) -> abs -> MaxPool -> InstanceNorm -> LeakyReLU
        Layer 2: Conv1d (80 -> 60) -> MaxPool -> InstanceNorm -> LeakyReLU
        Layer 3: Conv1d (60 -> 60) -> MaxPool -> InstanceNorm -> LeakyReLU
    """
    
    def __init__(self, sample_rate: int = 16000, stride: int = 10):
        super().__init__()
        
        self.sample_rate = sample_rate
        self.stride = stride
        
        # Waveform normalization
        self.wav_norm = nn.InstanceNorm(1, affine=True)
        
        # Layer 1: SincNet (80 filters, kernel 251)
        self.sinc_conv = SincConv1d(
            n_filters=80,
            kernel_size=251,
            sample_rate=sample_rate,
            min_low_hz=50,
            min_band_hz=50,
            stride=stride,
        )
        self.norm1 = nn.InstanceNorm(80, affine=True)
        
        # Layer 2: Standard conv (80 -> 60)
        self.conv2 = nn.Conv1d(80, 60, kernel_size=5, stride=1)
        self.norm2 = nn.InstanceNorm(60, affine=True)
        
        # Layer 3: Standard conv (60 -> 60)
        self.conv3 = nn.Conv1d(60, 60, kernel_size=5, stride=1)
        self.norm3 = nn.InstanceNorm(60, affine=True)
    
    def maxpool1d(self, x, pool_size=3):
        """
        MaxPool1d with pool_size. Expects input in (batch, length, channels) format.
        """
        batch, time, channels = x.shape
        time_pooled = time // pool_size
        x_reshaped = x[:, :time_pooled * pool_size, :].reshape(batch, time_pooled, pool_size, channels)
        return mx.max(x_reshaped, axis=2)
    
    def __call__(self, waveforms):
        """
        Process raw waveforms through SincNet.
        
        Args:
            waveforms: (batch, 1, samples) or (batch, samples) - PyTorch format
        
        Returns:
            Features: (batch, time_frames, 60) - MLX format (length, channels)
        """
        # Ensure correct shape (batch, 1, samples)
        if waveforms.ndim == 2:
            waveforms = mx.expand_dims(waveforms, axis=1)
        
        # Convert to MLX format (batch, samples, 1) for InstanceNorm
        x = mx.transpose(waveforms, (0, 2, 1))
        x = self.wav_norm(x)
        
        # Convert back to PyTorch format for SincNet
        x = mx.transpose(x, (0, 2, 1))
        
        # Layer 1: SincNet (handles its own transposes) + abs + pool + norm + leaky_relu
        x = self.sinc_conv(x)  # Returns (batch, channels, length)
        x = mx.abs(x)  # IMPORTANT: Only apply abs to first SincNet layer!
        
        # Convert to MLX format (batch, length, channels) for pooling, conv, and norm
        x = mx.transpose(x, (0, 2, 1))
        x = self.maxpool1d(x, pool_size=3)
        x = self.norm1(x)  # InstanceNorm expects (..., channels)
        x = mx.maximum(x, 0.01 * x)  # leaky_relu with slope 0.01
        
        # Layer 2: conv + pool + norm + leaky_relu (all in MLX format)
        x = self.conv2(x)
        x = self.maxpool1d(x, pool_size=3)
        x = self.norm2(x)
        x = mx.maximum(x, 0.01 * x)
        
        # Layer 3: conv + pool + norm + leaky_relu (all in MLX format)
        x = self.conv3(x)
        x = self.maxpool1d(x, pool_size=3)
        x = self.norm3(x)
        x = mx.maximum(x, 0.01 * x)
        
        # Return in MLX format (batch, time_frames, channels)
        return x


class PyannoteSegmentationModel(nn.Module):
    """
    Complete pyannote/segmentation-3.0 model.
    
    Architecture:
        SincNet (raw audio -> 60 features)
        -> Bidirectional LSTM (4 layers, 128 hidden units)
        -> Linear layers (256 -> 128 -> 128)
        -> Classifier (128 -> 7 classes)
    
    Input: Raw waveform at 16kHz
    Output: Frame-level predictions (7 classes for speaker segmentation)
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        sincnet_stride: int = 10,
        lstm_hidden_dim: int = 128,
        num_lstm_layers: int = 4,
        num_classes: int = 7,
    ):
        super().__init__()
        
        self.sample_rate = sample_rate
        self.lstm_hidden_dim = lstm_hidden_dim
        self.num_classes = num_classes
        
        # SincNet frontend (raw audio -> 60 features)
        self.sincnet = SincNet(sample_rate=sample_rate, stride=sincnet_stride)
        
        # Bidirectional LSTM (4 layers, 128 hidden units each direction)
        # MLX doesn't support bidirectional parameter, so we create forward and backward LSTMs
        self.lstm_forward = []
        self.lstm_backward = []
        for i in range(num_lstm_layers):
            input_dim = 60 if i == 0 else lstm_hidden_dim * 2
            self.lstm_forward.append(nn.LSTM(input_dim, lstm_hidden_dim))
            self.lstm_backward.append(nn.LSTM(input_dim, lstm_hidden_dim))
        
        # Linear layers
        self.linear1 = nn.Linear(lstm_hidden_dim * 2, 128)
        self.linear2 = nn.Linear(128, 128)
        
        # Classifier (7 classes)
        self.classifier = nn.Linear(128, num_classes)
    
    def __call__(self, waveforms):
        """
        Forward pass.
        
        Args:
            waveforms: (batch, samples) raw audio at 16kHz
        
        Returns:
            log_probs: (batch, time_frames, num_classes) - log probabilities
        """
        # SincNet: (batch, samples) -> (batch, time_frames, 60) in MLX format
        features = self.sincnet(waveforms)
        
        batch_size = features.shape[0]
        
        # Bidirectional LSTM layers (manual implementation)
        h = features  # Already in (batch, time_frames, 60) format
        for lstm_fwd, lstm_bwd in zip(self.lstm_forward, self.lstm_backward):
            # Forward pass
            h_fwd, _ = lstm_fwd(h)
            # Backward pass (reverse time dimension)
            h_rev = h[:, ::-1, :]
            h_bwd, _ = lstm_bwd(h_rev)
            h_bwd = h_bwd[:, ::-1, :]  # Reverse back
            # Concatenate forward and backward
            h = mx.concatenate([h_fwd, h_bwd], axis=-1)  # (batch, time_frames, 256)
        
        # Linear layers with ReLU
        h = self.linear1(h)
        h = mx.maximum(h, 0)  # ReLU
        h = self.linear2(h)
        h = mx.maximum(h, 0)  # ReLU
        
        # Classifier
        logits = self.classifier(h)
        
        # Apply log_softmax activation (matches PyTorch PyanNet)
        log_probs = nn.log_softmax(logits, axis=-1)
        
        return log_probs
    
    def load_weights(self, weights_path: str):
        """
        Load converted weights from npz file and apply them to the model.
        
        Args:
            weights_path: Path to weights.npz file
        """
        weights = mx.load(str(weights_path))
        print(f"[INFO] Loaded {len(weights)} weight tensors from {weights_path}")
        
        # Map and load SincNet weights
        # SincConv1d learnable parameters
        self.sincnet.sinc_conv.low_hz_ = weights['sincnet.conv1d.0.filterbank.low_hz_']
        self.sincnet.sinc_conv.band_hz_ = weights['sincnet.conv1d.0.filterbank.band_hz_']
        
        # Waveform normalization
        if 'sincnet.wav_norm1d.weight' in weights:
            self.sincnet.wav_norm.weight = weights['sincnet.wav_norm1d.weight']
            self.sincnet.wav_norm.bias = weights['sincnet.wav_norm1d.bias']
        
        # SincNet layer 1 normalization
        if 'sincnet.norm1d.0.weight' in weights:
            self.sincnet.norm1.weight = weights['sincnet.norm1d.0.weight']
            self.sincnet.norm1.bias = weights['sincnet.norm1d.0.bias']
        
        # SincNet layer 2 (conv + norm)
        # Transpose from PyTorch (out, in, kernel) to MLX (out, kernel, in)
        conv2_weight = weights['sincnet.conv1d.1.weight']
        self.sincnet.conv2.weight = mx.transpose(conv2_weight, (0, 2, 1))
        self.sincnet.conv2.bias = weights['sincnet.conv1d.1.bias']
        if 'sincnet.norm1d.1.weight' in weights:
            self.sincnet.norm2.weight = weights['sincnet.norm1d.1.weight']
            self.sincnet.norm2.bias = weights['sincnet.norm1d.1.bias']
        
        # SincNet layer 3 (conv + norm)
        # Transpose from PyTorch (out, in, kernel) to MLX (out, kernel, in)
        conv3_weight = weights['sincnet.conv1d.2.weight']
        self.sincnet.conv3.weight = mx.transpose(conv3_weight, (0, 2, 1))
        self.sincnet.conv3.bias = weights['sincnet.conv1d.2.bias']
        if 'sincnet.norm1d.2.weight' in weights:
            self.sincnet.norm3.weight = weights['sincnet.norm1d.2.weight']
            self.sincnet.norm3.bias = weights['sincnet.norm1d.2.bias']
        
        # Load LSTM weights (bidirectional - manual implementation)
        # Both PyTorch and MLX store LSTM weights as (4*hidden, input/hidden)
        # MLX applies .T during forward pass, PyTorch uses them directly
        # BUT: The internal computation is equivalent, so no transpose needed
        for i in range(4):  # 4 LSTM layers
            # Forward LSTM
            self.lstm_forward[i].Wx = weights[f'lstm.weight_ih_l{i}']
            self.lstm_forward[i].Wh = weights[f'lstm.weight_hh_l{i}']
            # Combine biases (PyTorch splits them)
            bias_ih = weights[f'lstm.bias_ih_l{i}']
            bias_hh = weights[f'lstm.bias_hh_l{i}']
            self.lstm_forward[i].bias = bias_ih + bias_hh
            
            # Backward LSTM
            self.lstm_backward[i].Wx = weights[f'lstm.weight_ih_l{i}_reverse']
            self.lstm_backward[i].Wh = weights[f'lstm.weight_hh_l{i}_reverse']
            bias_ih_rev = weights[f'lstm.bias_ih_l{i}_reverse']
            bias_hh_rev = weights[f'lstm.bias_hh_l{i}_reverse']
            self.lstm_backward[i].bias = bias_ih_rev + bias_hh_rev
        
        # Load linear layers
        self.linear1.weight = weights['linear.0.weight']
        self.linear1.bias = weights['linear.0.bias']
        self.linear2.weight = weights['linear.1.weight']
        self.linear2.bias = weights['linear.1.bias']
        
        # Load classifier
        self.classifier.weight = weights['classifier.weight']
        self.classifier.bias = weights['classifier.bias']
        
        print(f"[INFO] Successfully loaded all weights into model")


def load_pyannote_model(weights_path: str) -> PyannoteSegmentationModel:
    """
    Load pyannote/segmentation-3.0 model with converted weights.
    
    Args:
        weights_path: Path to converted weights.npz file
    
    Returns:
        Initialized model with loaded weights
    """
    model = PyannoteSegmentationModel()
    model.load_weights(weights_path)
    return model
