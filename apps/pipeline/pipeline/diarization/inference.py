#!/usr/bin/env python3
"""
Speaker diarization inference script using pyannote MLX model.
"""

import mlx.core as mx
import numpy as np
import librosa
from tqdm import tqdm
from pathlib import Path
import sys
from typing import List, Tuple

from .models import load_pyannote_model

def load_audio(path: str, target_sr: int = 16000):
    """Load audio file and resample to target sample rate using librosa."""
    # librosa loads as (samples,) for mono
    waveform, sr = librosa.load(path, sr=target_sr, mono=True)
    
    # Add channel dimension to match (1, samples) format expected by processing
    waveform = waveform[np.newaxis, :]
    
    return waveform, target_sr

def process_audio_chunks(audio: np.ndarray, model, chunk_size: int = 160000, overlap: int = 16000):
    """
    Process audio in chunks with overlap to handle long files.
    """
    total_samples = audio.shape[1]
    sr = 16000
    
    all_logits = []
    
    start = 0
    # Calculate number of steps for progress bar
    n_steps = (total_samples - overlap) // (chunk_size - overlap)
    if (total_samples - overlap) % (chunk_size - overlap) > 0:
        n_steps += 1
    
    pbar = tqdm(total=n_steps, desc="    [Diarization]", leave=True)
    
    while start < total_samples:
        end = min(start + chunk_size, total_samples)
        chunk = audio[:, start:end]
        
        # Pad if needed
        if chunk.shape[1] < chunk_size:
            pad_size = chunk_size - chunk.shape[1]
            chunk = np.pad(chunk, ((0, 0), (0, pad_size)), mode='constant')
        
        # Convert to MLX and run inference
        chunk_mx = mx.array(chunk, dtype=mx.float32)
        logits = model(chunk_mx)
        
        # Periodically evaluate to keep memory usage in check and GPU busy
        # This restores the 35+ it/s throughput
        if (start // (chunk_size - overlap)) % 50 == 0:
             mx.eval(logits)
        
        # Store logits (remove overlap region except for first chunk)
        if start == 0:
            all_logits.append(logits[0])
        else:
            # Skip overlap frames
            overlap_frames = int(logits.shape[1] * (overlap / chunk_size))
            all_logits.append(logits[0, overlap_frames:])
        
        # Move to next chunk
        start += (chunk_size - overlap)
        pbar.update(1)
    
    pbar.close()
    
    # Calculate total frames for pre-allocation
    total_frames = sum(chunk.shape[0] for chunk in all_logits)
    n_speakers = all_logits[0].shape[1]
    
    print(f"    [MLX] Stitching {total_frames} frames...", flush=True)
    
    # Pre-allocate numpy array for speed and memory stability
    full_logits = np.zeros((total_frames, n_speakers), dtype=np.float32)
    
    current_offset = 0
    pbar_stitch = tqdm(total=total_frames, desc="    [Stitching]", leave=True)
    
    for chunk in all_logits:
        # Final evaluation and move to CPU/NumPy
        mx.eval(chunk)
        chunk_np = np.array(chunk)
        n_chunk_frames = chunk_np.shape[0]
        
        full_logits[current_offset:current_offset + n_chunk_frames, :] = chunk_np
        current_offset += n_chunk_frames
        pbar_stitch.update(n_chunk_frames)
        
    pbar_stitch.close()
    
    # Calculate timestamps linearly for the total number of frames
    # This is the most accurate way to prevent drift or offset
    frame_duration = (chunk_size / sr) / all_logits[0].shape[0]
    full_frame_times = np.arange(total_frames) * frame_duration
    
    print(f"    [MLX] Assembly complete: {total_frames} frames, {full_frame_times[-1]:.2f}s total.")
    
    return full_logits, full_frame_times

def logits_to_segments(logits: np.ndarray, frame_times: np.ndarray, 
                       min_duration: float = 0.5, threshold: float = 0.35) -> List[Tuple[float, float, int]]:
    """
    Convert frame-level predictions to speaker segments using sigmoid thresholding.
    """
    print("    [Post-Process] Extracting speaker segments...", flush=True)
    
    # 1. Apply Sigmoid (Vectorized on NumPy)
    probs = 1 / (1 + np.exp(-logits))
    
    # 2. Determine active speaker per frame
    best_speaker = np.argmax(probs, axis=-1)
    max_probs = np.max(probs, axis=-1)
    
    # 3. Apply threshold: If no speaker is above threshold, mark as -1 (Silence)
    predictions = np.where(max_probs >= threshold, best_speaker, -1)
    
    # Ensure predictions and frame_times are aligned
    n_frames = min(len(predictions), len(frame_times))
    predictions = predictions[:n_frames]
    frame_times = frame_times[:n_frames]
    
    if n_frames == 0:
        return []

    # Find indices where the speaker changes
    changes = np.where(predictions[:-1] != predictions[1:])[0]
    change_indices = np.concatenate([changes, [n_frames - 1]])
    start_indices = np.concatenate([[0], change_indices[:-1] + 1])
    
    # Get start/end times and speakers
    seg_starts = frame_times[start_indices]
    seg_ends = frame_times[change_indices]
    seg_speakers = predictions[start_indices]
    
    # Calculate durations
    durations = seg_ends - seg_starts
    
    # Filter by duration AND ignore Silence (-1)
    valid_mask = (durations >= min_duration) & (seg_speakers != -1)
    
    filtered_starts = seg_starts[valid_mask]
    filtered_ends = seg_ends[valid_mask]
    filtered_speakers = seg_speakers[valid_mask].astype(int)
    
    final_segments = []
    for s, e, spk in tqdm(zip(filtered_starts, filtered_ends, filtered_speakers), 
                          total=len(filtered_starts), 
                          desc="    [Segments]", 
                          leave=True):
        final_segments.append((float(s), float(e), int(spk)))
    
    return final_segments

def save_rttm(segments: List[Tuple[float, float, int]], output_path: str, audio_id: str = "audio"):
    """
    Save segments in RTTM format.
    
    RTTM format: SPEAKER <file-id> 1 <start-time> <duration> <NA> <NA> <speaker-id> <NA> <NA>
    """
    with open(output_path, 'w') as f:
        for start, end, speaker in segments:
            duration = end - start
            line = f"SPEAKER {audio_id} 1 {start:.3f} {duration:.3f} <NA> <NA> speaker_{speaker} <NA> <NA>\n"
            f.write(line)

