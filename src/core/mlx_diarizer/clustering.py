"""
Clustering utilities for speaker diarization
"""

import numpy as np
from typing import List, Tuple, Dict
from sklearn.cluster import AgglomerativeClustering
from scipy.cluster.hierarchy import linkage, dendrogram


class SpeakerClusterer:
    """
    Clusters speaker embeddings using hierarchical clustering
    """
    
    def __init__(self, threshold: float = 0.7, method: str = "ward"):
        """
        Initialize clusterer
        
        Args:
            threshold: Distance threshold for clustering
            method: Linkage method ('ward', 'complete', 'average', etc.)
        """
        self.threshold = threshold
        self.method = method
    
    def cluster(
        self,
        embeddings: np.ndarray,
        segment_ids: np.ndarray = None,
    ) -> Tuple[np.ndarray, int]:
        """
        Cluster embeddings
        
        Args:
            embeddings: Speaker embeddings of shape (n_segments, embedding_dim)
            segment_ids: Optional segment indices
        
        Returns:
            Tuple of (cluster_labels, n_clusters)
        """
        if len(embeddings) == 0:
            return np.array([]), 0
        
        if len(embeddings) == 1:
            return np.array([0]), 1
        
        # Compute distance matrix
        distances = 1 - np.dot(embeddings, embeddings.T)
        np.fill_diagonal(distances, 0)
        
        # Perform hierarchical clustering
        clustering = AgglomerativeClustering(
            n_clusters=None,
            linkage=self.method,
            distance_threshold=1 - self.threshold,
        )
        
        labels = clustering.fit_predict(embeddings)
        n_clusters = len(np.unique(labels))
        
        return labels, n_clusters
    
    def cluster_with_constraint(
        self,
        embeddings: np.ndarray,
        temporal_segments: List[Tuple[float, float]],
        min_duration: float = 0.5,
    ) -> Dict[int, List[Tuple[float, float]]]:
        """
        Cluster embeddings with temporal constraints
        
        Args:
            embeddings: Speaker embeddings
            temporal_segments: List of (start, end) times
            min_duration: Minimum duration for a speaker segment
        
        Returns:
            Dictionary mapping speaker_id to list of time segments
        """
        labels, n_clusters = self.cluster(embeddings)
        
        speaker_segments = {i: [] for i in range(n_clusters)}
        
        for idx, (start, end) in enumerate(temporal_segments):
            duration = end - start
            if duration >= min_duration:
                speaker_id = labels[idx]
                speaker_segments[speaker_id].append((start, end))
        
        # Merge overlapping segments for same speaker
        for speaker_id in speaker_segments:
            speaker_segments[speaker_id] = self._merge_segments(
                speaker_segments[speaker_id]
            )
        
        return speaker_segments
    
    @staticmethod
    def _merge_segments(
        segments: List[Tuple[float, float]],
        gap_threshold: float = 0.1,
    ) -> List[Tuple[float, float]]:
        """
        Merge overlapping or nearby segments
        
        Args:
            segments: List of (start, end) tuples
            gap_threshold: Maximum gap to merge segments
        
        Returns:
            Merged segments
        """
        if not segments:
            return []
        
        # Sort by start time
        sorted_segs = sorted(segments, key=lambda x: x[0])
        merged = [sorted_segs[0]]
        
        for start, end in sorted_segs[1:]:
            last_start, last_end = merged[-1]
            
            # Check if we should merge
            if start - last_end <= gap_threshold:
                merged[-1] = (last_start, max(last_end, end))
            else:
                merged.append((start, end))
        
        return merged


class VBxClusterer:
    """
    Variational Bayes clustering (VBx) for speaker diarization
    Based on: Landini et al., 2022 - "Bayesian HMM clustering of x-vector sequences"
    """
    
    def __init__(
        self,
        threshold: float = 0.5,
        n_components: int = None,
        max_iter: int = 100,
    ):
        self.threshold = threshold
        self.n_components = n_components
        self.max_iter = max_iter
    
    def cluster(
        self,
        embeddings: np.ndarray,
        temporal_segments: List[Tuple[float, float]] = None,
    ) -> Tuple[np.ndarray, int]:
        """
        Cluster using VB approach
        
        Args:
            embeddings: Speaker embeddings
            temporal_segments: Optional time segments
        
        Returns:
            Tuple of (labels, n_clusters)
        """
        # For now, use standard clustering as fallback
        # Full VBx implementation would involve HMM and variational inference
        clusterer = SpeakerClusterer(threshold=self.threshold)
        return clusterer.cluster(embeddings, temporal_segments)
