import { useEffect, useRef } from "react";
import { X, Search, MessageSquare, PlayCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TranscriptSegment } from "../../lib/types";
import { formatTimestamp } from "../../lib/timeline-utils";
import { getSpeakerColorIndex, SPEAKER_COLORS } from "../../lib/colors";

interface TranscriptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: TranscriptSegment[];
  currentTime: number;
  onSegmentClick: (time: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  resolveSpeakerName: (seg: TranscriptSegment) => string;
}

export function TranscriptDrawer({
  isOpen,
  onClose,
  transcript,
  currentTime,
  onSegmentClick,
  searchQuery,
  onSearchChange,
  resolveSpeakerName,
}: TranscriptDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollEnabled = useRef(true);

  // Filter transcript by search
  const filteredTranscript = transcript.filter((segment) => {
    if (!searchQuery) return true;
    const text = segment.text_content.toLowerCase();
    const speaker = resolveSpeakerName(segment).toLowerCase();
    const query = searchQuery.toLowerCase();
    return text.includes(query) || speaker.includes(query);
  });

  // Auto-scroll to current segment
  useEffect(() => {
    if (!isOpen || !autoScrollEnabled.current) return;

    const currentSegment = transcript.find(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );

    if (currentSegment) {
      const element = document.getElementById(
        `drawer-segment-${currentSegment.id}`
      );
      const container = containerRef.current;

      if (element && container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;

        // Only scroll if element is outside visible area
        if (
          relativeTop < 0 ||
          relativeTop > containerRect.height - elementRect.height
        ) {
          isScrollingProgrammatically.current = true;

          container.scrollTo({
            top: container.scrollTop + relativeTop - containerRect.height / 3,
            behavior: "smooth",
          });

          if (scrollTimeoutRef.current)
            clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            isScrollingProgrammatically.current = false;
          }, 500);
        }
      }
    }
  }, [currentTime, transcript, isOpen]);

  // Handle user scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;
      autoScrollEnabled.current = false;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const jumpToLive = () => {
    const currentSegment = transcript.find(
      (s) => currentTime >= s.start_time && currentTime < s.end_time
    );
    if (currentSegment) {
      const element = document.getElementById(
        `drawer-segment-${currentSegment.id}`
      );
      if (element) {
        isScrollingProgrammatically.current = true;
        element.scrollIntoView({ behavior: "smooth", block: "center" });

        if (scrollTimeoutRef.current)
          clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingProgrammatically.current = false;
          autoScrollEnabled.current = true;
        }, 500);
      }
    }
    autoScrollEnabled.current = true;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transition-transform duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-zinc-900">Transcript</h2>
            <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
              {filteredTranscript.length} segments
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-zinc-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Jump to Live button */}
        {!autoScrollEnabled.current && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
            <button
              onClick={jumpToLive}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <PlayCircle className="h-4 w-4" />
              Jump to Live
            </button>
          </div>
        )}

        {/* Transcript List */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="p-4 space-y-2">
            {filteredTranscript.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                {searchQuery
                  ? "No matching segments found."
                  : "No transcript available."}
              </div>
            ) : (
              filteredTranscript.map((segment) => {
                const speakerName = resolveSpeakerName(segment);
                const colorIdx = getSpeakerColorIndex(speakerName);
                const isActive =
                  currentTime >= segment.start_time &&
                  currentTime < segment.end_time;

                return (
                  <div
                    key={segment.id}
                    id={`drawer-segment-${segment.id}`}
                    onClick={() => onSegmentClick(segment.start_time)}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-all border",
                      isActive
                        ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20"
                        : "hover:bg-zinc-50 border-transparent hover:border-zinc-200"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          SPEAKER_COLORS[colorIdx]
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-bold truncate",
                          isActive ? "text-blue-700" : "text-zinc-600"
                        )}
                      >
                        {speakerName}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-auto flex-shrink-0 font-mono">
                        {formatTimestamp(segment.start_time)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-sm leading-relaxed",
                        isActive ? "text-zinc-900" : "text-zinc-600"
                      )}
                    >
                      <HighlightText
                        text={
                          segment.text_content
                        }
                        query={searchQuery}
                      />
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-amber-200 text-zinc-900 rounded-sm px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
