import { useState, useMemo, useEffect, useRef } from "react";
import {
  FileText,
  MessageSquare,
  Play,
  Pause,
  Volume2,
  VolumeX,
  FastForward,
  Loader2,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Info,
  Gavel,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "../ui/drawer";
import type {
  AgendaItem,
  TranscriptSegment,
  Motion,
  Vote,
} from "../../lib/types";
import {
  formatTimestamp,
  findAgendaItemForTime,
} from "../../lib/timeline-utils";
import { getSpeakerColorIndex, SPEAKER_COLORS } from "../../lib/colors";
import { EnhancedVideoScrubber } from "./EnhancedVideoScrubber";

interface VideoWithSidebarProps {
  videoPlayer: {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    videoEnabled: boolean;
    setVideoEnabled: (enabled: boolean) => void;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    isLoading: boolean;
    volume: number;
    playbackRate: number;
    togglePlay: () => void;
    toggleMute: () => void;
    seekTo: (time: number) => void;
    setVolume: (volume: number) => void;
    setPlaybackRate: (rate: number) => void;
  };
  directVideoUrl?: string | null;
  directAudioUrl?: string | null;
  meeting: { id: number; video_url?: string };
  agendaItems: AgendaItem[];
  transcript: TranscriptSegment[];
  meetingDuration: number;
  resolveSpeakerName: (seg: TranscriptSegment) => string;
  showCaption: boolean;
  setShowCaption: (show: boolean) => void;
  onVideoError?: () => void;
}

export function VideoWithSidebar({
  videoPlayer,
  directVideoUrl,
  directAudioUrl,
  meeting,
  agendaItems,
  transcript,
  meetingDuration,
  resolveSpeakerName,
  showCaption,
  setShowCaption,
  onVideoError,
}: VideoWithSidebarProps) {
  const [sidebarMode, setSidebarMode] = useState<"agenda" | "transcript">(
    "agenda",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const mobileTranscriptRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Find current agenda item based on video time
  const currentAgendaItem = useMemo(() => {
    return findAgendaItemForTime(agendaItems, videoPlayer.currentTime);
  }, [agendaItems, videoPlayer.currentTime]);

  // Find current transcript segment
  const currentSegment = useMemo(() => {
    return transcript.find(
      (s) =>
        videoPlayer.currentTime >= s.start_time &&
        videoPlayer.currentTime < s.end_time,
    );
  }, [transcript, videoPlayer.currentTime]);

  // Filter transcript to current agenda item
  const agendaTranscript = useMemo(() => {
    if (!currentAgendaItem) return [];
    return transcript.filter(
      (seg) =>
        seg.start_time >= (currentAgendaItem.discussion_start_time ?? 0) &&
        seg.start_time < (currentAgendaItem.discussion_end_time ?? Infinity),
    );
  }, [transcript, currentAgendaItem]);

  // Auto-scroll transcript to current segment (works for both desktop sidebar and mobile drawer)
  useEffect(() => {
    if (sidebarMode !== "transcript" || !autoScrollEnabled) return;

    const currentSeg = transcript.find(
      (s) =>
        videoPlayer.currentTime >= s.start_time &&
        videoPlayer.currentTime < s.end_time,
    );

    if (!currentSeg) return;

    // Use whichever container is currently active
    const container =
      (mobileDrawerOpen && mobileTranscriptRef.current) ||
      transcriptContainerRef.current;
    if (!container) return;

    // Scope element lookup to the active container
    const element = container.querySelector(
      `[id="sidebar-seg-${currentSeg.id}"]`,
    );
    if (!element) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const relativeTop = elementRect.top - containerRect.top;

    if (
      relativeTop < 0 ||
      relativeTop > containerRect.height - elementRect.height
    ) {
      isScrollingProgrammatically.current = true;

      container.scrollTo({
        top: container.scrollTop + relativeTop - containerRect.height / 3,
        behavior: "smooth",
      });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 500);
    }
  }, [videoPlayer.currentTime, transcript, sidebarMode, autoScrollEnabled, mobileDrawerOpen]);

  // Handle user scroll - disconnect from auto-scroll when user manually scrolls
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container || sidebarMode !== "transcript") return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;
      setAutoScrollEnabled(false);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [sidebarMode, sidebarCollapsed]);

  // Inline scroll handler for mobile drawer (avoids ref timing issues with portals)
  const handleMobileTranscriptScroll = () => {
    if (isScrollingProgrammatically.current) return;
    setAutoScrollEnabled(false);
  };

  const jumpToLive = () => {
    setAutoScrollEnabled(true);
  };

  if (!meeting.video_url) {
    return null;
  }

  return (
    <div className="bg-zinc-900 rounded-2xl shadow-lg overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:aspect-video lg:max-h-[70vh]">
        {/* Video Player */}
        <div
          className={cn("relative", sidebarCollapsed ? "flex-1" : "lg:w-2/3")}
        >
          <div className="aspect-video lg:aspect-auto lg:absolute lg:inset-0 bg-black relative group">
            {/* Video Loading State */}
            {!directVideoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
                      <svg
                        className="w-7 h-7 text-zinc-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon
                          points="6 3 20 12 6 21 6 3"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                    <span>Connecting to video</span>
                    <span
                      className="inline-block w-1 h-1 rounded-full bg-zinc-500"
                      style={{
                        animation: "pulse-dot 1.4s ease-in-out infinite",
                      }}
                    />
                    <span
                      className="inline-block w-1 h-1 rounded-full bg-zinc-500"
                      style={{
                        animation:
                          "pulse-dot 1.4s ease-in-out 0.2s infinite",
                      }}
                    />
                    <span
                      className="inline-block w-1 h-1 rounded-full bg-zinc-500"
                      style={{
                        animation:
                          "pulse-dot 1.4s ease-in-out 0.4s infinite",
                      }}
                    />
                  </div>
                  <div className="w-36 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{
                        animation: "progress 3s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <video
              key={directVideoUrl}
              ref={videoPlayer.videoRef}
              src={directVideoUrl || undefined}
              className="w-full h-full"
              onClick={videoPlayer.togglePlay}
              playsInline
              preload="auto"
              muted={!!directAudioUrl || videoPlayer.volume === 0}
              onError={() => {
                if (!directVideoUrl) return;
                console.error("Video failed to load.");
                onVideoError?.();
              }}
            />

            {directAudioUrl && (
              <audio
                ref={videoPlayer.audioRef}
                src={directAudioUrl}
                className="hidden"
                preload="auto"
                muted={videoPlayer.volume === 0}
              />
            )}

            {/* Play overlay */}
            {directVideoUrl && !videoPlayer.videoEnabled && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 cursor-pointer hover:bg-black/30 transition-colors z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  videoPlayer.setVideoEnabled(true);
                  setTimeout(() => videoPlayer.togglePlay(), 100);
                }}
              >
                <PlayCircle className="h-20 w-20 text-white/80" />
                <span className="text-white/60 font-bold uppercase tracking-widest mt-4">
                  Click to Play
                </span>
              </div>
            )}

            {/* Loading Spinner */}
            {videoPlayer.isLoading && videoPlayer.videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="bg-black/50 p-4 rounded-full backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              </div>
            )}

            {/* Caption Overlay - Mobile */}
            {showCaption && currentSegment && videoPlayer.videoEnabled && (
              <div className="lg:hidden absolute inset-0 z-20 pointer-events-none flex flex-col justify-end">
                <div className="overflow-y-auto bg-black/60 backdrop-blur-sm px-3 py-2">
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full mt-0.5 shrink-0",
                        SPEAKER_COLORS[
                          getSpeakerColorIndex(
                            resolveSpeakerName(currentSegment),
                          )
                        ],
                      )}
                    />
                    <div className="min-w-0">
                      <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
                        {resolveSpeakerName(currentSegment)}
                      </span>
                      <p className="text-white/90 text-xs leading-snug">
                        {currentSegment.text_content}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Caption Overlay - Desktop */}
            {showCaption && currentSegment && videoPlayer.videoEnabled && (
              <div className="hidden lg:flex absolute bottom-16 left-0 right-0 p-4 z-20 pointer-events-none justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3 border border-white/10 max-w-2xl text-center shadow-2xl">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        SPEAKER_COLORS[
                          getSpeakerColorIndex(
                            resolveSpeakerName(currentSegment),
                          )
                        ],
                      )}
                    />
                    <span className="text-white/60 text-[10px] font-bold uppercase tracking-wider">
                      {resolveSpeakerName(currentSegment)}
                    </span>
                  </div>
                  <p className="text-white text-base md:text-lg font-medium leading-tight">
                    {currentSegment.text_content}
                  </p>
                </div>
              </div>
            )}

            {/* Video Controls - Desktop (hover) */}
            {videoPlayer.videoEnabled && directVideoUrl && (
              <div className="hidden lg:block absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={videoPlayer.togglePlay}
                      className="hover:text-blue-400"
                    >
                      {videoPlayer.isPlaying ? (
                        <Pause className="h-5 w-5 fill-current" />
                      ) : (
                        <Play className="h-5 w-5 fill-current" />
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={videoPlayer.toggleMute}
                        className="hover:text-blue-400 transition-colors"
                        title={videoPlayer.volume === 0 ? "Unmute" : "Mute"}
                      >
                        {videoPlayer.volume === 0 ? (
                          <VolumeX className="h-4 w-4 text-zinc-400" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={videoPlayer.volume}
                        onChange={(e) =>
                          videoPlayer.setVolume(parseFloat(e.target.value))
                        }
                        className="w-20 h-1 bg-white/30 rounded-full cursor-pointer"
                      />
                    </div>
                    <span className="text-xs font-mono">
                      {formatTimestamp(videoPlayer.currentTime)} /{" "}
                      {formatTimestamp(videoPlayer.duration || meetingDuration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowCaption(!showCaption)}
                      className={cn(
                        "text-[10px] font-black px-1.5 py-0.5 rounded border transition-colors",
                        showCaption
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-transparent border-white/40 text-white/40 hover:border-white hover:text-white",
                      )}
                    >
                      CC
                    </button>
                    <button
                      onClick={() => {
                        const rates = [1, 1.5, 2];
                        const nextIdx =
                          (rates.indexOf(videoPlayer.playbackRate) + 1) %
                          rates.length;
                        videoPlayer.setPlaybackRate(rates[nextIdx]);
                      }}
                      className="flex items-center gap-1 hover:text-blue-400 text-xs font-bold"
                    >
                      <FastForward className="h-4 w-4" />
                      {videoPlayer.playbackRate}x
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Controls - Always visible */}
          {videoPlayer.videoEnabled && directVideoUrl && (
            <div className="lg:hidden bg-zinc-800 px-3 py-2 flex items-center justify-between text-white border-t border-zinc-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={videoPlayer.togglePlay}
                  className="active:text-blue-400"
                >
                  {videoPlayer.isPlaying ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="h-5 w-5 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={videoPlayer.toggleMute}
                  className="active:text-blue-400 transition-colors"
                >
                  {videoPlayer.volume === 0 ? (
                    <VolumeX className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <span className="text-[11px] font-mono text-zinc-400">
                  {formatTimestamp(videoPlayer.currentTime)} /{" "}
                  {formatTimestamp(videoPlayer.duration || meetingDuration)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCaption(!showCaption)}
                  className={cn(
                    "text-[10px] font-black px-1.5 py-0.5 rounded border transition-colors",
                    showCaption
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-transparent border-white/40 text-white/40",
                  )}
                >
                  CC
                </button>
                <button
                  onClick={() => {
                    const rates = [1, 1.5, 2];
                    const nextIdx =
                      (rates.indexOf(videoPlayer.playbackRate) + 1) %
                      rates.length;
                    videoPlayer.setPlaybackRate(rates[nextIdx]);
                  }}
                  className="flex items-center gap-1 text-xs font-bold"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  {videoPlayer.playbackRate}x
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Desktop only */}
        {!sidebarCollapsed && (
          <div className="hidden lg:flex lg:w-1/3 min-h-0 bg-zinc-800 border-l border-zinc-700 flex-col overflow-hidden">
            {/* Sidebar Header with Toggle */}
            <div className="p-3 border-b border-zinc-700 flex items-center justify-between">
              <div className="flex bg-zinc-700 rounded-lg p-0.5">
                <button
                  onClick={() => setSidebarMode("agenda")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                    sidebarMode === "agenda"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-400 hover:text-white",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Agenda
                </button>
                <button
                  onClick={() => {
                    setSidebarMode("transcript");
                    setAutoScrollEnabled(true);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                    sidebarMode === "transcript"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-400 hover:text-white",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Transcript
                </button>
              </div>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
                title="Collapse sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Agenda Item Selector */}
            {sidebarMode === "agenda" && (
              <AgendaItemSelector
                agendaItems={agendaItems}
                currentAgendaItem={currentAgendaItem}
                onSelect={(item) => {
                  if (item.discussion_start_time !== undefined) {
                    if (!videoPlayer.videoEnabled) {
                      videoPlayer.setVideoEnabled(true);
                      setTimeout(() => videoPlayer.seekTo(item.discussion_start_time!), 100);
                    } else {
                      videoPlayer.seekTo(item.discussion_start_time!);
                    }
                  }
                }}
              />
            )}

            {/* Sidebar Content */}
            <div
              className="flex-1 min-h-0 overflow-y-auto"
              ref={transcriptContainerRef}
            >
              {sidebarMode === "agenda" ? (
                <AgendaSidebarContent
                  agendaItem={currentAgendaItem}
                  agendaItems={agendaItems}
                  onSeek={(time) => {
                    if (!videoPlayer.videoEnabled) {
                      videoPlayer.setVideoEnabled(true);
                      setTimeout(() => videoPlayer.seekTo(time), 100);
                    } else {
                      videoPlayer.seekTo(time);
                    }
                  }}
                />
              ) : (
                <TranscriptSidebarContent
                  transcript={transcript}
                  currentTime={videoPlayer.currentTime}
                  onSeek={(time) => {
                    if (!videoPlayer.videoEnabled) {
                      videoPlayer.setVideoEnabled(true);
                      setTimeout(() => videoPlayer.seekTo(time), 100);
                    } else {
                      videoPlayer.seekTo(time);
                    }
                  }}
                  resolveSpeakerName={resolveSpeakerName}
                  autoScrollEnabled={autoScrollEnabled}
                  onJumpToLive={jumpToLive}
                />
              )}
            </div>
          </div>
        )}

        {/* Collapsed Sidebar Toggle - Desktop only */}
        {sidebarCollapsed && (
          <div className="hidden lg:flex items-center justify-center w-10 bg-zinc-800 border-l border-zinc-700">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
              title="Show transcript/agenda panel"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile Sidebar Drawer */}
      <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <div className="lg:hidden flex justify-center gap-2 py-2 bg-zinc-900">
          <button
            onClick={() => {
              setSidebarMode("agenda");
              setMobileDrawerOpen(true);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border transition-colors",
              sidebarMode === "agenda"
                ? "bg-zinc-700 text-white border-zinc-600"
                : "bg-zinc-800 text-zinc-400 border-zinc-700",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Agenda
          </button>
          <button
            onClick={() => {
              setSidebarMode("transcript");
              setAutoScrollEnabled(true);
              setMobileDrawerOpen(true);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border transition-colors",
              sidebarMode === "transcript"
                ? "bg-zinc-700 text-white border-zinc-600"
                : "bg-zinc-800 text-zinc-400 border-zinc-700",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Transcript
          </button>
        </div>
        <DrawerContent className="bg-zinc-800 border-zinc-700">
          <DrawerTitle className="sr-only">
            {sidebarMode === "agenda" ? "Agenda" : "Transcript"}
          </DrawerTitle>

          {/* Mode Toggle */}
          <div className="px-3 pb-3 flex items-center justify-center">
            <div className="flex bg-zinc-700 rounded-lg p-0.5">
              <button
                onClick={() => setSidebarMode("agenda")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                  sidebarMode === "agenda"
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Agenda
              </button>
              <button
                onClick={() => {
                  setSidebarMode("transcript");
                  setAutoScrollEnabled(true);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                  sidebarMode === "transcript"
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Transcript
              </button>
            </div>
          </div>

          {/* Agenda Item Selector */}
          {sidebarMode === "agenda" && (
            <AgendaItemSelector
              agendaItems={agendaItems}
              currentAgendaItem={currentAgendaItem}
              onSelect={(item) => {
                if (item.discussion_start_time !== undefined) {
                  if (!videoPlayer.videoEnabled) {
                    videoPlayer.setVideoEnabled(true);
                    setTimeout(() => videoPlayer.seekTo(item.discussion_start_time!), 100);
                  } else {
                    videoPlayer.seekTo(item.discussion_start_time!);
                  }
                }
              }}
            />
          )}

          {/* Sidebar Content — min-h-0 ensures flex child constrains to allocated space so overflow scrolls properly and vaul detects scrollTop for drag */}
          <div className="flex-1 min-h-0 overflow-y-auto" ref={mobileTranscriptRef} onScroll={handleMobileTranscriptScroll}>
            {sidebarMode === "agenda" ? (
              <AgendaSidebarContent
                agendaItem={currentAgendaItem}
                agendaItems={agendaItems}
                onSeek={(time) => {
                  if (!videoPlayer.videoEnabled) {
                    videoPlayer.setVideoEnabled(true);
                    setTimeout(() => videoPlayer.seekTo(time), 100);
                  } else {
                    videoPlayer.seekTo(time);
                  }
                }}
              />
            ) : (
              <TranscriptSidebarContent
                transcript={transcript}
                currentTime={videoPlayer.currentTime}
                onSeek={(time) => {
                  if (!videoPlayer.videoEnabled) {
                    videoPlayer.setVideoEnabled(true);
                    setTimeout(() => videoPlayer.seekTo(time), 100);
                  } else {
                    videoPlayer.seekTo(time);
                  }
                }}
                resolveSpeakerName={resolveSpeakerName}
                autoScrollEnabled={autoScrollEnabled}
                onJumpToLive={jumpToLive}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Enhanced Scrubber - Desktop only */}
      {transcript.length > 0 &&
        (videoPlayer.duration || meetingDuration) > 0 && (
          <EnhancedVideoScrubber
            className="hidden lg:block"
            duration={videoPlayer.duration || meetingDuration}
            currentTime={videoPlayer.currentTime}
            agendaItems={agendaItems}
            transcript={transcript}
            onSeek={(time) => {
              // If video hasn't started, enable it first then seek
              if (!videoPlayer.videoEnabled) {
                videoPlayer.setVideoEnabled(true);
                setTimeout(() => videoPlayer.seekTo(time), 100);
              } else {
                videoPlayer.seekTo(time);
              }
            }}
            onAgendaClick={() => {}}
            resolveSpeakerName={resolveSpeakerName}
          />
        )}
    </div>
  );
}

// Agenda item dropdown selector
function AgendaItemSelector({
  agendaItems,
  currentAgendaItem,
  onSelect,
}: {
  agendaItems: AgendaItem[];
  currentAgendaItem?: AgendaItem;
  onSelect: (item: AgendaItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const itemsWithTime = agendaItems.filter(
    (i) => i.discussion_start_time !== undefined,
  );

  // Scroll to active item when dropdown opens
  useEffect(() => {
    if (!open || !currentAgendaItem || !listRef.current) return;
    const activeEl = listRef.current.querySelector("[data-active='true']");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "center" });
    }
  }, [open, currentAgendaItem]);

  if (itemsWithTime.length === 0) return null;

  return (
    <div className="p-3 border-b border-zinc-700 relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          {currentAgendaItem ? (
            <>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Now Discussing
              </div>
              <div className="text-sm font-bold text-white truncate">
                {currentAgendaItem.item_order}. {currentAgendaItem.title}
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-400">Jump to agenda item...</div>
          )}
        </div>
        <ChevronsUpDown className="h-4 w-4 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute left-3 right-3 top-full mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {itemsWithTime.map((item) => {
            const isCurrent = currentAgendaItem?.id === item.id;
            return (
              <button
                key={item.id}
                data-active={isCurrent || undefined}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors border-b border-zinc-800 last:border-0",
                  isCurrent
                    ? "bg-blue-600/20 text-white"
                    : "text-zinc-300 hover:bg-zinc-800",
                )}
              >
                <span className="font-bold text-zinc-500 mr-1.5">
                  {item.item_order}.
                </span>
                <span className={isCurrent ? "font-medium" : ""}>
                  {item.title}
                </span>
                {item.motions && item.motions.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-amber-500">
                    {item.motions.length} motion{item.motions.length > 1 ? "s" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Agenda details in sidebar
function AgendaSidebarContent({
  agendaItem,
  agendaItems,
  onSeek,
}: {
  agendaItem?: AgendaItem;
  agendaItems: AgendaItem[];
  onSeek: (time: number) => void;
}) {
  // Show table of contents when no current agenda item
  if (!agendaItem) {
    const itemsWithTime = agendaItems.filter(
      (i) => i.discussion_start_time !== undefined,
    );

    if (itemsWithTime.length === 0) {
      return (
        <div className="p-6 text-center text-zinc-500">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No agenda items available</p>
        </div>
      );
    }

    return (
      <div className="p-3 space-y-1">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1 mb-2">
          Agenda Items
        </div>
        {itemsWithTime.map((item) => (
          <button
            key={item.id}
            onClick={() => onSeek(item.discussion_start_time!)}
            className="w-full text-left p-2.5 rounded-lg hover:bg-zinc-700/50 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-bold text-zinc-500 mt-0.5 shrink-0">
                {item.item_order}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-200 font-medium leading-snug group-hover:text-white transition-colors">
                  {item.title}
                </div>
                {item.plain_english_summary && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {item.plain_english_summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {item.motions && item.motions.length > 0 && (
                    <span className="text-[10px] text-amber-500 font-medium">
                      {item.motions.length} motion{item.motions.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {item.is_controversial && (
                    <span className="text-[10px] text-red-400 font-medium">
                      Notable
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {formatTimestamp(item.discussion_start_time!)}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  const motions = agendaItem.motions || [];

  return (
    <div className="p-4 space-y-4">
      {/* Plain English Summary */}
      {agendaItem.plain_english_summary && (
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
            <Info className="h-3 w-3" />
            Summary
          </div>
          <p className="text-sm text-blue-100 leading-relaxed">
            {agendaItem.plain_english_summary}
          </p>
        </div>
      )}

      {/* Description */}
      {agendaItem.description && !agendaItem.plain_english_summary && (
        <p className="text-sm text-zinc-300 leading-relaxed">
          {agendaItem.description}
        </p>
      )}

      {/* Debate Summary */}
      {agendaItem.debate_summary && (
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
            Debate Summary
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {agendaItem.debate_summary}
          </p>
        </div>
      )}

      {/* Motions */}
      {motions.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
            Motions ({motions.length})
          </div>
          <div className="space-y-2">
            {motions.map((motion) => (
              <MotionCard
                key={motion.id}
                motion={motion}
                onSeek={onSeek}
                agendaItem={agendaItem}
              />
            ))}
          </div>
        </div>
      )}

      {/* Category Badge */}
      {agendaItem.category && (
        <div className="pt-2">
          <Badge
            variant="outline"
            className="text-zinc-400 border-zinc-600 text-[10px]"
          >
            {agendaItem.category}
          </Badge>
        </div>
      )}
    </div>
  );
}

// Motion card in sidebar
function MotionCard({
  motion,
  agendaItem,
  onSeek,
}: {
  motion: Motion;
  agendaItem: AgendaItem;
  onSeek: (time: number) => void;
}) {
  const [showVotes, setShowVotes] = useState(false);
  const votes = motion.votes || [];

  return (
    <div className="p-3 bg-zinc-700/50 rounded-lg border border-zinc-600/50">
      <div className="flex items-start gap-2">
        <Gavel className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-200 leading-relaxed">
            {motion.plain_english_summary || motion.text_content}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {motion.result && (
              <Badge
                variant={
                  motion.result === "CARRIED" ? "default" : "destructive"
                }
                className="text-[10px] py-0 px-1.5"
              >
                {motion.result}
                {motion.yes_votes > 0 && (
                  <span className="ml-1 opacity-80">
                    ({motion.yes_votes}-{motion.no_votes})
                  </span>
                )}
              </Badge>
            )}

            {motion.time_offset_seconds !== undefined && (
              <button
                onClick={() => onSeek(motion.time_offset_seconds!)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
              >
                <PlayCircle className="h-3 w-3" />
                {formatTimestamp(motion.time_offset_seconds)}
              </button>
            )}

            {votes.length > 0 && (
              <button
                onClick={() => setShowVotes(!showVotes)}
                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showVotes ? "Hide" : "Votes"}
              </button>
            )}
          </div>

          {showVotes && votes.length > 0 && (
            <div className="grid grid-cols-2 gap-1 mt-2">
              {votes.map((vote: Vote) => (
                <div
                  key={vote.id}
                  className="flex items-center gap-1 p-1 rounded bg-zinc-800 text-[10px]"
                >
                  {vote.vote === "Yes" ? (
                    <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                  ) : vote.vote === "No" ? (
                    <XCircle className="h-2.5 w-2.5 text-red-500" />
                  ) : (
                    <MinusCircle className="h-2.5 w-2.5 text-zinc-500" />
                  )}
                  <span className="truncate text-zinc-400">
                    {vote.person?.name || "Unknown"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Transcript in sidebar
function TranscriptSidebarContent({
  transcript,
  currentTime,
  onSeek,
  resolveSpeakerName,
  autoScrollEnabled,
  onJumpToLive,
}: {
  transcript: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
  resolveSpeakerName: (seg: TranscriptSegment) => string;
  autoScrollEnabled: boolean;
  onJumpToLive: () => void;
}) {
  if (transcript.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-500">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No transcript available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Jump to Live button - sticky at top */}
      {!autoScrollEnabled && (
        <div className="sticky top-0 z-10 p-2 bg-zinc-800/95 backdrop-blur-sm border-b border-zinc-700">
          <button
            onClick={onJumpToLive}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-400 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Jump to Live
          </button>
        </div>
      )}

      <div className="p-2 space-y-1">
        {transcript.map((segment) => {
          const speakerName = resolveSpeakerName(segment);
          const colorIdx = getSpeakerColorIndex(speakerName);
          const isActive =
            currentTime >= segment.start_time && currentTime < segment.end_time;

          return (
            <div
              key={segment.id}
              id={`sidebar-seg-${segment.id}`}
              onClick={() => onSeek(segment.start_time)}
              className={cn(
                "p-2 rounded-lg cursor-pointer transition-all",
                isActive
                  ? "bg-blue-600/20 border border-blue-500/50"
                  : "hover:bg-zinc-700/50 border border-transparent",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    SPEAKER_COLORS[colorIdx],
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-bold truncate",
                    isActive ? "text-blue-300" : "text-zinc-400",
                  )}
                >
                  {speakerName}
                </span>
                <span className="text-[10px] text-zinc-500 ml-auto shrink-0">
                  {formatTimestamp(segment.start_time)}
                </span>
              </div>
              <p
                className={cn(
                  "text-xs leading-relaxed line-clamp-3",
                  isActive ? "text-white" : "text-zinc-400",
                )}
              >
                {segment.text_content}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
