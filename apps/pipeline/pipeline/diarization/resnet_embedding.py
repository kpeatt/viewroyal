"""
MLX implementation of WeSpeaker ResNet34 for speaker embedding extraction.
Based on: https://github.com/wenet-e2e/wespeaker
"""

import mlx.core as mx
import mlx.nn as nn
from typing import Optional, Tuple


class BasicBlock(nn.Module):
    """
    Basic ResNet block with two 3x3 convolutions.

    Architecture:
        conv1 (3x3, stride=stride) -> bn1 -> relu
        -> conv2 (3x3, stride=1) -> bn2
        -> add residual -> relu
    """
    expansion = 1

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1):
        super().__init__()

        # Main path
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3,
                               stride=stride, padding=1)
        self.bn1 = nn.BatchNorm(out_channels)

        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3,
                               stride=1, padding=1)
        self.bn2 = nn.BatchNorm(out_channels)

        # Shortcut connection (if dimensions change)
        self.use_shortcut = stride != 1 or in_channels != out_channels * self.expansion
        if self.use_shortcut:
            self.shortcut_conv = nn.Conv2d(in_channels, out_channels * self.expansion,
                                          kernel_size=1, stride=stride, padding=0)
            self.shortcut_bn = nn.BatchNorm(out_channels * self.expansion)

    def __call__(self, x: mx.array) -> mx.array:
        """Forward pass through BasicBlock."""
        identity = x

        # Main path
        out = self.conv1(x)
        out = self.bn1(out)
        out = nn.relu(out)

        out = self.conv2(out)
        out = self.bn2(out)

        # Shortcut connection
        if self.use_shortcut:
            identity = self.shortcut_conv(identity)
            identity = self.shortcut_bn(identity)

        # Add and activate
        out = out + identity
        out = nn.relu(out)

        return out


class TemporalStatisticsPooling(nn.Module):
    """
    Temporal Statistics Pooling (TSP) layer.
    Computes mean and standard deviation over the TIME dimension.

    PyTorch WeSpeaker pools over dim=-1 which is TIME in (batch, channels, freq, time) format.
    In MLX format after transpose (batch, freq, time, channels), we pool over axis=2 (time dimension).

    Input: (batch, freq, time, channels)
    Output: (batch, freq * channels * 2)
    """

    def __call__(self, x: mx.array) -> mx.array:
        """
        Args:
            x: Input tensor of shape (batch, freq, time, channels)

        Returns:
            Pooled tensor of shape (batch, freq * channels * 2)
        """
        # Pool over TIME dimension (axis=2)
        # Input: (batch, freq, time, channels)
        mean = mx.mean(x, axis=2)  # (batch, freq, channels)
        std = mx.sqrt(mx.var(x, axis=2) + 1e-7)  # (batch, freq, channels)

        # Concatenate mean and std
        stats = mx.concatenate([mean, std], axis=-1)  # (batch, freq, channels*2)

        # Flatten to (batch, freq * channels * 2)
        batch_size = stats.shape[0]
        pooled = stats.reshape(batch_size, -1)

        return pooled


class ResNet34Embedding(nn.Module):
    """
    ResNet34 architecture for speaker embedding extraction.

    Based on WeSpeaker implementation with modifications:
    - Smaller kernel size for input layer
    - Smaller number of channels
    - No max pooling
    - Temporal statistics pooling

    Architecture:
        Input (batch, time, freq) -> add channel dim
        -> Conv2d (1 -> m_channels, 3x3)
        -> ResNet layers [3, 4, 6, 3] blocks
        -> Temporal pooling
        -> Linear projection to embedding space

    Args:
        feat_dim: Input feature dimension (e.g., 80 for mel bins)
        embed_dim: Output embedding dimension (default: 256)
        m_channels: Base number of channels (default: 32)
        pooling: Pooling method ('TSTP' for temporal statistics pooling)
    """

    def __init__(
        self,
        feat_dim: int = 80,
        embed_dim: int = 256,
        m_channels: int = 32,
        pooling: str = 'TSTP',
    ):
        super().__init__()

        self.feat_dim = feat_dim
        self.embed_dim = embed_dim
        self.m_channels = m_channels

        # Initial convolution layer
        self.conv1 = nn.Conv2d(1, m_channels, kernel_size=3, stride=1, padding=1)
        self.bn1 = nn.BatchNorm(m_channels)

        # ResNet34 layer configuration: [3, 4, 6, 3] blocks
        # Use nn.Sequential to properly register modules
        self.layer1 = self._make_layer(m_channels, m_channels, 3, stride=1)
        self.layer2 = self._make_layer(m_channels, m_channels * 2, 4, stride=2)
        self.layer3 = self._make_layer(m_channels * 2, m_channels * 4, 6, stride=2)
        self.layer4 = self._make_layer(m_channels * 4, m_channels * 8, 3, stride=2)

        # Pooling layer
        if pooling == 'TSTP':
            self.pool = TemporalStatisticsPooling()
            pool_out_dim = m_channels * 8 * 2  # *2 for mean+std
        else:
            raise ValueError(f"Unsupported pooling method: {pooling}")

        # Embedding layer
        self.fc = nn.Linear(pool_out_dim, embed_dim)
        # Note: PyTorch model has seg_bn_1 as Identity layer (no-op), so no BatchNorm here

    def _make_layer(
        self,
        in_channels: int,
        out_channels: int,
        num_blocks: int,
        stride: int = 1
    ) -> nn.Sequential:
        """Create a layer with multiple BasicBlocks."""
        layers = []

        # First block may have stride > 1 for downsampling
        layers.append(BasicBlock(in_channels, out_channels, stride))

        # Remaining blocks have stride=1
        for _ in range(1, num_blocks):
            layers.append(BasicBlock(out_channels, out_channels, stride=1))

        return nn.Sequential(*layers)

    def __call__(self, x: mx.array) -> mx.array:
        """
        Forward pass for embedding extraction.

        Args:
            x: Input features of shape (batch, time, freq) or (batch, time, freq, 1)

        Returns:
            Speaker embeddings of shape (batch, embed_dim)
        """
        # Ensure 4D input (batch, time, freq, channels)
        if x.ndim == 3:
            x = mx.expand_dims(x, axis=-1)  # (batch, time, freq) -> (batch, time, freq, 1)

        # PyTorch treats input as (batch, channels, freq, time)
        # MLX Conv2d expects (batch, height, width, channels)
        # To match PyTorch layout, we need (batch, freq, time, channels)
        # So swap time and freq dimensions
        x = mx.transpose(x, (0, 2, 1, 3))  # (batch, time, freq, 1) -> (batch, freq, time, 1)

        # Initial convolution
        x = self.conv1(x)
        x = self.bn1(x)
        x = nn.relu(x)

        # ResNet layers (call Sequential modules directly)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        # Temporal pooling (batch, time, freq, channels) -> (batch, pooled_dim)
        x = self.pool(x)

        # Embedding projection
        x = self.fc(x)
        # No BatchNorm here - PyTorch model uses Identity layer (pass-through)
        # No L2 normalization - PyTorch model returns raw FC output

        return x

    def extract_embedding(self, audio_features: mx.array) -> mx.array:
        """
        Extract speaker embedding from audio features.

        Args:
            audio_features: Mel spectrogram or other features (batch, time, feat_dim)

        Returns:
            Speaker embedding (batch, embed_dim) - NOT L2-normalized
        """
        return self(audio_features)

    def load_weights(self, weights_path: str):
        """
        Load converted weights from npz file.

        The weights from pyannote use 'resnet.' prefix which needs to be stripped.

        Args:
            weights_path: Path to weights.npz file
        """
        from pathlib import Path
        weights_path = Path(weights_path)

        if not weights_path.exists():
            raise FileNotFoundError(f"Weights file not found: {weights_path}")

        print(f"[INFO] Loading weights from {weights_path}")
        state_dict = mx.load(str(weights_path))

        # Map pyannote keys to our model structure
        # The pyannote model has a 'resnet.' prefix that we need to strip
        mapped_weights = {}
        for key, value in state_dict.items():
            if key.startswith('resnet.'):
                # Remove 'resnet.' prefix
                new_key = key[7:]  # len('resnet.') = 7

                # Map shortcut.0/shortcut.1 to shortcut_conv/shortcut_bn
                if '.shortcut.0.' in new_key:
                    new_key = new_key.replace('.shortcut.0.', '.shortcut_conv.')
                elif '.shortcut.1.' in new_key:
                    new_key = new_key.replace('.shortcut.1.', '.shortcut_bn.')

                # Map seg_1 to fc
                if new_key.startswith('seg_1.'):
                    new_key = new_key.replace('seg_1.', 'fc.')

                # Map layer indices for nn.Sequential
                # nn.Sequential stores blocks in .layers, so layer1.0 becomes layer1.layers.0
                import re
                new_key = re.sub(r'(layer[1-4])\.(\d+)\.', r'\1.layers.\2.', new_key)

                mapped_weights[new_key] = value

        # Now apply weights to the model
        model_state = dict(nn.utils.tree_flatten(self.parameters()))

        loaded_count = 0
        missing_keys = []
        unexpected_keys = []

        for key, value in mapped_weights.items():
            # Try to load as parameter first
            if key in model_state:
                # Get the parameter from model
                param_path = key.split('.')
                module = self
                for attr in param_path[:-1]:
                    if attr.isdigit():
                        module = module[int(attr)]
                    else:
                        module = getattr(module, attr)

                # Set the parameter
                param_name = param_path[-1]
                setattr(module, param_name, value)
                loaded_count += 1
            else:
                # Try to load as non-parameter attribute (e.g., running_mean, running_var)
                try:
                    param_path = key.split('.')
                    module = self
                    for attr in param_path[:-1]:
                        if attr.isdigit():
                            module = module[int(attr)]
                        elif attr == 'layers':
                            # Handle nn.Sequential layers
                            module = module.layers
                        else:
                            module = getattr(module, attr)

                    # Set the attribute (running_mean, running_var, etc.)
                    param_name = param_path[-1]
                    if hasattr(module, param_name):
                        setattr(module, param_name, value)
                        loaded_count += 1
                    else:
                        unexpected_keys.append(key)
                except:
                    unexpected_keys.append(key)

        # Check for missing keys
        for key in model_state.keys():
            if key not in mapped_weights:
                # Skip BatchNorm running stats as they're optional
                if not any(x in key for x in ['running_mean', 'running_var', 'num_batches_tracked']):
                    missing_keys.append(key)

        print(f"[INFO] Loaded {loaded_count} parameters")
        if missing_keys:
            print(f"[WARN] Missing keys in checkpoint: {len(missing_keys)}")
            for key in missing_keys[:5]:  # Show first 5
                print(f"  - {key}")
            if len(missing_keys) > 5:
                print(f"  ... and {len(missing_keys) - 5} more")

        if unexpected_keys:
            print(f"[WARN] Unexpected keys in checkpoint: {len(unexpected_keys)}")
            for key in unexpected_keys[:5]:  # Show first 5
                print(f"  - {key}")
            if len(unexpected_keys) > 5:
                print(f"  ... and {len(unexpected_keys) - 5} more")

        # Set model to eval mode so BatchNorm uses running statistics
        self.eval()
        print(f"[INFO] Model set to eval mode (BatchNorm will use running statistics)")


def load_resnet34_embedding(weights_path: str) -> ResNet34Embedding:
    """
    Load ResNet34 embedding model with converted weights.

    Args:
        weights_path: Path to converted weights.npz file

    Returns:
        Initialized model with loaded weights
    """
    model = ResNet34Embedding()
    model.load_weights(weights_path)
    return model
