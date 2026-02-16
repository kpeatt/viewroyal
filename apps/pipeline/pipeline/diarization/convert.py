"""
Weight conversion utilities for PyTorch to MLX
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Union
import numpy as np
import mlx.core as mx
import mlx.nn as nn


def torch_to_mx(torch_tensor, dtype: str = "float16") -> mx.array:
    """
    Convert PyTorch tensor to MLX array
    
    Args:
        torch_tensor: PyTorch tensor
        dtype: Target data type
    
    Returns:
        MLX array
    """
    try:
        import torch
        # Handle bfloat16 which is not numpy convertible
        if dtype == "bfloat16":
            tensor_np = torch_tensor.to(torch.float32).numpy()
        else:
            tensor_np = torch_tensor.to(getattr(torch, dtype)).numpy()
        
        return mx.array(tensor_np, getattr(mx, dtype))
    except ImportError:
        raise ImportError("PyTorch is required for weight conversion. Install with: pip install torch")


def make_shards(weights: dict, max_file_size_gb: int = 5) -> list:
    """
    Split weights into shards based on size
    
    Args:
        weights: Dictionary of weight arrays
        max_file_size_gb: Maximum file size in GB
    
    Returns:
        List of weight shard dictionaries
    """
    max_file_size_bytes = max_file_size_gb * 1024**3
    shards = []
    current_shard = {}
    current_size = 0

    for key, value in weights.items():
        weight_size = value.nbytes
        
        if current_size + weight_size > max_file_size_bytes and current_shard:
            shards.append(current_shard)
            current_shard = {}
            current_size = 0
        
        current_shard[key] = value
        current_size += weight_size
    
    if current_shard:
        shards.append(current_shard)
    
    return shards if len(shards) > 1 else [weights]


def save_weights(save_path: Union[str, Path], weights: Dict[str, Any]) -> None:
    """
    Save MLX model weights to safetensors format
    
    Args:
        save_path: Directory to save weights
        weights: Dictionary of weight arrays
    """
    if isinstance(save_path, str):
        save_path = Path(save_path)
    save_path.mkdir(parents=True, exist_ok=True)

    shards = make_shards(weights)
    shards_count = len(shards)
    shard_file_format = (
        "model-{:05d}-of-{:05d}.safetensors"
        if shards_count > 1
        else "model.safetensors"
    )

    total_size = sum(v.nbytes for v in weights.values())
    index_data = {"metadata": {"total_size": total_size}, "weight_map": {}}

    for i, shard in enumerate(shards):
        shard_name = shard_file_format.format(i + 1, shards_count)
        shard_path = save_path / shard_name
        
        mx.save_safetensors(str(shard_path), shard, metadata={"format": "mlx"})

        for weight_name in shard.keys():
            index_data["weight_map"][weight_name] = shard_name

    # Sort weight map
    index_data["weight_map"] = {
        k: index_data["weight_map"][k] for k in sorted(index_data["weight_map"])
    }

    # Save index file
    with open(save_path / "model.safetensors.index.json", "w") as f:
        json.dump(index_data, f, indent=4)


def save_config(config: Dict[str, Any], config_path: Union[str, Path]) -> None:
    """
    Save model configuration to JSON
    
    Args:
        config: Configuration dictionary
        config_path: Path to save config
    """
    if isinstance(config_path, str):
        config_path = Path(config_path)
    
    with open(config_path, "w") as f:
        json.dump(config, f, indent=4)


def remap_pytorch_keys(key: str) -> str:
    """
    Remap PyTorch model keys to MLX format
    
    This handles common patterns in pyannote models:
    - LSTM layer naming
    - Attention layer naming  
    - Normalization layer naming
    
    Args:
        key: Original PyTorch key
    
    Returns:
        Remapped key for MLX
    """
    # Handle LSTM layers
    key = key.replace("lstm.", "lstm_layers.")
    key = key.replace(".rnn.", ".lstm_layers.")
    
    # Handle attention layers
    key = key.replace(".self_attn.", ".attention.")
    key = key.replace(".q_proj.", ".query_proj.")
    key = key.replace(".k_proj.", ".key_proj.")
    key = key.replace(".v_proj.", ".value_proj.")
    key = key.replace(".out_proj.", ".output_proj.")
    
    # Handle normalization layers
    key = key.replace("LayerNorm", "layer_norm")
    key = key.replace("BatchNorm", "batch_norm")
    
    # Handle linear layers
    key = key.replace(".fc.", ".linear.")
    key = key.replace(".dense.", ".linear.")
    
    return key


def sanitize_weights(weights: Dict[str, Any], model_type: str = "diarization") -> Dict[str, Any]:
    """
    Sanitize and remap weights for MLX compatibility
    
    Args:
        weights: Dictionary of weights
        model_type: Type of model being converted
    
    Returns:
        Sanitized weights dictionary
    """
    sanitized = {}
    
    for k, v in weights.items():
        # Skip position IDs and other non-parameter tensors
        if any(skip in k for skip in ["position_ids", "num_batches_tracked"]):
            continue
        
        # Remap key names
        new_key = remap_pytorch_keys(k)
        
        # Handle conv layers - MLX expects different dimension order
        if "conv" in k and hasattr(v, "ndim"):
            if v.ndim == 3:  # 1D conv
                v = v.swapaxes(1, 2)  # (out, in, kernel) -> (out, kernel, in)
            elif v.ndim == 4:  # 2D conv
                v = v.transpose(0, 2, 3, 1)  # (out, in, h, w) -> (out, h, w, in)
        
        sanitized[new_key] = v
    
    return sanitized


def convert_pyannote_model(
    pytorch_path: Union[str, Path],
    mlx_path: Union[str, Path],
    model_type: str = "segmentation",
    dtype: str = "float16",
) -> None:
    """
    Convert pyannote PyTorch model to MLX format
    
    Args:
        pytorch_path: Path to PyTorch checkpoint or Hugging Face repo
        mlx_path: Path to save converted MLX model
        model_type: Type of pyannote model ('segmentation', 'embedding', or 'full')
        dtype: Data type for conversion
    """
    try:
        import torch
    except ImportError:
        raise ImportError("PyTorch is required for conversion. Install with: pip install torch")
    
    pytorch_path = Path(pytorch_path)
    mlx_path = Path(mlx_path)
    mlx_path.mkdir(parents=True, exist_ok=True)
    
    print(f"[INFO] Loading PyTorch model from {pytorch_path}")
    
    # Load PyTorch weights
    if pytorch_path.is_file() and pytorch_path.suffix == ".pt":
        checkpoint = torch.load(pytorch_path, map_location="cpu", weights_only=False)
        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            weights = checkpoint["state_dict"]
            config = checkpoint.get("config", {})
        else:
            weights = checkpoint
            config = {}
    else:
        # Try loading from Hugging Face
        try:
            from huggingface_hub import snapshot_download
            
            model_dir = snapshot_download(
                repo_id=str(pytorch_path),
                allow_patterns=["*.bin", "*.pt", "*.json", "*.safetensors", "*.yaml"],
            )
            model_dir = Path(model_dir)
            
            # Check if this is a pyannote pipeline with subdirectories
            if (model_dir / "segmentation" / "pytorch_model.bin").exists():
                print(f"[INFO] Detected pyannote pipeline structure")
                if model_type == "segmentation" or model_type == "full":
                    weight_file = model_dir / "segmentation" / "pytorch_model.bin"
                    print(f"[INFO] Using segmentation model from {weight_file}")
                elif model_type == "embedding":
                    weight_file = model_dir / "embedding" / "pytorch_model.bin"
                    print(f"[INFO] Using embedding model from {weight_file}")
                else:
                    weight_file = model_dir / "segmentation" / "pytorch_model.bin"
            else:
                # Load weights from main directory
                weight_file = None
                for pattern in ["pytorch_model.bin", "model.safetensors", "*.pt"]:
                    matches = list(model_dir.glob(pattern))
                    if matches:
                        weight_file = matches[0]
                        break
            
            if weight_file is None:
                raise ValueError(f"No weight file found in {model_dir}")
            
            if weight_file.suffix == ".safetensors":
                weights = mx.load(str(weight_file))
            else:
                checkpoint = torch.load(weight_file, map_location="cpu", weights_only=False)
                weights = checkpoint.get("state_dict", checkpoint)
            
            # Load config
            config_file = model_dir / "config.json"
            if config_file.exists():
                with open(config_file) as f:
                    config = json.load(f)
            else:
                config = {}
                
        except Exception as e:
            raise ValueError(f"Could not load model from {pytorch_path}: {e}")
    
    print("[INFO] Converting weights to MLX format")
    
    # Convert tensors to MLX
    mlx_weights = {}
    for k, v in weights.items():
        if hasattr(v, "numpy"):  # PyTorch tensor
            mlx_weights[k] = torch_to_mx(v, dtype=dtype)
        elif isinstance(v, np.ndarray):
            mlx_weights[k] = mx.array(v, getattr(mx, dtype))
        elif isinstance(v, mx.array):
            mlx_weights[k] = v.astype(getattr(mx, dtype))
        else:
            mlx_weights[k] = v
    
    # Sanitize weights
    mlx_weights = sanitize_weights(mlx_weights, model_type)
    
    print("[INFO] Saving MLX model")
    
    # Save weights
    save_weights(mlx_path, mlx_weights)
    
    # Save config
    config["model_type"] = model_type
    config["dtype"] = dtype
    save_config(config, mlx_path / "config.json")
    
    print(f"[INFO] Model saved to {mlx_path}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Convert pyannote models to MLX format")
    parser.add_argument(
        "--pytorch-path",
        type=str,
        required=True,
        help="Path to PyTorch model or Hugging Face repo",
    )
    parser.add_argument(
        "--mlx-path",
        type=str,
        default="mlx_model",
        help="Path to save MLX model",
    )
    parser.add_argument(
        "--model-type",
        type=str,
        choices=["segmentation", "embedding", "full"],
        default="segmentation",
        help="Type of pyannote model",
    )
    parser.add_argument(
        "--dtype",
        type=str,
        choices=["float16", "float32", "bfloat16"],
        default="float16",
        help="Data type for conversion",
    )
    
    args = parser.parse_args()
    
    convert_pyannote_model(
        args.pytorch_path,
        args.mlx_path,
        args.model_type,
        args.dtype,
    )
