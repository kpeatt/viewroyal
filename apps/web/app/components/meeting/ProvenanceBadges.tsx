import type { Meeting } from "../../lib/types";
import { FileText, ClipboardList, Video, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";

interface ProvenanceBadgesProps {
  meeting: Meeting;
  compact?: boolean;
}

interface SourceDef {
  key: string;
  label: string;
  icon: typeof FileText;
  available: boolean;
  url?: string | null;
}

export function ProvenanceBadges({ meeting, compact = false }: ProvenanceBadgesProps) {
  const sources: SourceDef[] = [
    {
      key: "agenda",
      label: "Agenda",
      icon: FileText,
      available: !!meeting.has_agenda,
      url: meeting.agenda_url,
    },
    {
      key: "minutes",
      label: "Minutes",
      icon: ClipboardList,
      available: !!meeting.has_minutes,
      url: meeting.minutes_url,
    },
    {
      key: "video",
      label: "Video",
      icon: Video,
      available: !!meeting.has_transcript,
      url: meeting.video_url,
    },
  ];

  const availableSources = sources.filter((s) => s.available);

  if (availableSources.length === 0) {
    return <span className="text-sm text-zinc-400">No sources available</span>;
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2")}>
      {availableSources.map((source) => {
        const Icon = source.icon;
        const hasUrl = !!source.url;

        const badgeClasses = cn(
          "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600",
          compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
          hasUrl && "hover:bg-zinc-100 hover:border-zinc-300 transition-colors",
        );

        const content = (
          <>
            <Icon className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
            {!compact && <span className="ml-1.5 font-medium">{source.label}</span>}
            {hasUrl && !compact && (
              <ExternalLink className="ml-1 h-3 w-3 text-zinc-400" />
            )}
          </>
        );

        if (hasUrl) {
          return (
            <a
              key={source.key}
              href={source.url!}
              target="_blank"
              rel="noopener noreferrer"
              className={badgeClasses}
              title={compact ? source.label : undefined}
            >
              {content}
            </a>
          );
        }

        return (
          <span
            key={source.key}
            className={badgeClasses}
            title={compact ? source.label : undefined}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
