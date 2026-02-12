import { useState, useRef, useEffect, useCallback } from "react";
// import Player from "@vimeo/player"; // No longer needed with dynamic import

interface UseVideoPlayerOptions {
  directVideoUrl?: string | null;
  directAudioUrl?: string | null;
  initialVolume?: number;
  onTimeUpdate?: (time: number) => void;
  onError?: (error: { type: string; details: string }) => void;
}

interface UseVideoPlayerReturn {
  // Refs
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  progressBarRef: React.RefObject<HTMLDivElement | null>;
  progressIndicatorRef: React.RefObject<HTMLDivElement | null>;

  // State
  videoEnabled: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  playbackRate: number;

  // Actions
  setVideoEnabled: (enabled: boolean) => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
}

export function useVideoPlayer({
  directVideoUrl,
  directAudioUrl,
  initialVolume = 0,
  onTimeUpdate,
  onError,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolumeState] = useState(initialVolume);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressIndicatorRef = useRef<HTMLDivElement>(null);
  const lastStateUpdateRef = useRef(0);
  const hlsRef = useRef<any>(null);
  const previousVolumeRef = useRef(initialVolume || 1);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // HLS.js setup for m3u8 streams - minimal buffering for fast start
  useEffect(() => {
    if (!videoEnabled || !directVideoUrl || !videoRef.current) return;

    const video = videoRef.current;
    const isHLS = directVideoUrl.includes(".m3u8");

    async function setupHls() {
      // Clean up previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (isHLS) {
        // Dynamic import for browser-only library
        const { default: Hls } = await import("hls.js");

        if (Hls.isSupported()) {
          const hls = new Hls({
            // Start with lowest quality for fast initial load
            startLevel: 0,
            // Minimal buffer before starting playback (in seconds)
            maxBufferLength: 10,
            // Maximum buffer size
            maxMaxBufferLength: 30,
            // Buffer size to maintain ahead of playhead
            maxBufferSize: 10 * 1000 * 1000, // 10MB
            // Low latency mode
            lowLatencyMode: false,
            // Start loading immediately
            autoStartLoad: true,
          });

          hls.loadSource(directVideoUrl!);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setDuration(video.duration || 0);
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              console.error("[HLS] Fatal error:", data.type, data.details);
              onErrorRef.current?.({ type: data.type, details: data.details });
            }
          });

          hlsRef.current = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari native HLS support
          video.src = directVideoUrl!;
        }
      } else {
        // Regular video file
        video.src = directVideoUrl!;
      }
    }

    setupHls();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [directVideoUrl, videoEnabled]);

  // Video-Audio sync effect
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !directAudioUrl) return;

    const onPlay = () => audio.play().catch(() => {});
    const onPause = () => audio.pause();
    const onWaiting = () => audio.pause();
    const onPlaying = () => audio.play().catch(() => {});
    const onSeek = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.1) {
        audio.currentTime = video.currentTime;
      }
    };
    const onRate = () => {
      audio.playbackRate = video.playbackRate;
    };

    let animationFrameId: number;
    let lastVideoTime = 0;
    let stuckFrames = 0;

    const syncLoop = () => {
      if (!video.paused && !video.ended) {
        if (Math.abs(video.currentTime - lastVideoTime) < 0.0001) {
          stuckFrames++;
          if (stuckFrames > 10) audio.pause();
        } else {
          stuckFrames = 0;
          lastVideoTime = video.currentTime;
          if (audio.paused) audio.play().catch(() => {});
          const diff = audio.currentTime - video.currentTime;
          if (Math.abs(diff) > 0.2) audio.currentTime = video.currentTime;
        }
      }
      animationFrameId = requestAnimationFrame(syncLoop);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("seeking", onSeek);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("ratechange", onRate);
    syncLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeking", onSeek);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("ratechange", onRate);
    };
  }, [directAudioUrl, videoEnabled]);

  // Video player initialization and progress tracking
  useEffect(() => {
    if (!videoEnabled || !directVideoUrl || !videoRef.current) return;

    const videoEl = videoRef.current;
    let animationFrameId: number;

    const updateProgress = () => {
      const time = videoEl.currentTime;
      const totalDuration = videoEl.duration || 0;

      if (totalDuration > 0) {
        if (progressBarRef.current) {
          const percent = (time / totalDuration) * 100;
          progressBarRef.current.style.width = `${percent}%`;
        }
        if (progressIndicatorRef.current) {
          const percent = (time / totalDuration) * 100;
          progressIndicatorRef.current.style.left = `${percent}%`;
        }
      }

      const now = performance.now();
      // Throttle state updates to reduce re-renders (500ms)
      if (now - lastStateUpdateRef.current > 500) {
        setCurrentTime(time);
        onTimeUpdate?.(time);
        lastStateUpdateRef.current = now;
      }

      if (!videoEl.paused && !videoEl.ended) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      updateProgress();
    };

    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationFrameId);
      // Ensure state is up to date on pause
      setCurrentTime(videoEl.currentTime);
      onTimeUpdate?.(videoEl.currentTime);
    };

    const onLoadedMetadata = () => setDuration(videoEl.duration);
    const onSeek = () => {
      setCurrentTime(videoEl.currentTime);
      onTimeUpdate?.(videoEl.currentTime);
      updateProgress();
    };

    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onSeeking = () => setIsLoading(true);
    const onSeeked = () => {
      setIsLoading(false);
      onSeek();
    };

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("loadedmetadata", onLoadedMetadata);
    videoEl.addEventListener("seeking", onSeeking);
    videoEl.addEventListener("seeked", onSeeked);
    videoEl.addEventListener("waiting", onWaiting);
    videoEl.addEventListener("canplay", onCanPlay);
    videoEl.addEventListener("timeupdate", updateProgress);

    return () => {
      cancelAnimationFrame(animationFrameId);
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("loadedmetadata", onLoadedMetadata);
      videoEl.removeEventListener("seeking", onSeeking);
      videoEl.removeEventListener("seeked", onSeeked);
      videoEl.removeEventListener("waiting", onWaiting);
      videoEl.removeEventListener("canplay", onCanPlay);
      videoEl.removeEventListener("timeupdate", updateProgress);
    };
  }, [directVideoUrl, videoEnabled, onTimeUpdate]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      if (!videoEnabled) {
        setVideoEnabled(true);
        setIsPlaying(true);
        setIsLoading(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = time;
            videoRef.current.play().catch(() => {});
          }
        }, 100);
      } else {
        setIsPlaying(true);
        setIsLoading(true);
        if (videoRef.current) {
          videoRef.current.currentTime = time;
          videoRef.current.play().catch(() => {});
        }
      }
    },
    [videoEnabled],
  );

  const setVolume = useCallback(
    (vol: number) => {
      // Track previous non-zero volume for toggleMute
      if (vol > 0) {
        previousVolumeRef.current = vol;
      }
      setVolumeState(vol);
      if (audioRef.current) {
        audioRef.current.volume = vol;
        audioRef.current.muted = vol === 0;
      }
      if (videoRef.current) {
        if (!directAudioUrl) {
          videoRef.current.volume = vol;
        }
        videoRef.current.muted = vol === 0 || !!directAudioUrl;
      }
    },
    [directAudioUrl],
  );

  const toggleMute = useCallback(() => {
    if (volume === 0) {
      // Unmute: restore previous volume or default to 1
      setVolume(previousVolumeRef.current || 1);
    } else {
      // Mute: save current volume and set to 0
      previousVolumeRef.current = volume;
      setVolume(0);
    }
  }, [volume, setVolume]);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  return {
    videoRef,
    audioRef,
    progressBarRef,
    progressIndicatorRef,
    videoEnabled,
    currentTime,
    duration,
    isPlaying,
    isLoading,
    volume,
    playbackRate,
    setVideoEnabled,
    togglePlay,
    seekTo,
    setVolume,
    toggleMute,
    setPlaybackRate,
  };
}
