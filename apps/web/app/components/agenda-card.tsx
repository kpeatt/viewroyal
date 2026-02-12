import {
  ChevronDown,
  ChevronUp,
  Info,
  Gavel,
  DollarSign,
  MapPin,
  Sparkles,
  MessageSquare,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { cn } from "../lib/utils";
import type { AgendaItem } from "../lib/types";
import { MotionCard } from "./motion-card";
import { IntelligenceSection } from "./intelligence-section";

interface AgendaCardProps {
  item: AgendaItem;
  isExpanded: boolean;
  onToggle: () => void;
  onWatchVideo?: (startTime: number) => void;
  resolveSpeakerName: (seg: { speaker_name?: string | null }) => string;
}

/**
 * AgendaCard displays an agenda item in a collapsible format.
 * Collapsed: Shows item number, title, and key metadata badges (category, cost, motions, outcome).
 * Expanded: Provides a tabbed interface for summary, discussion, AI intelligence, and official minutes.
 */
export function AgendaCard({
  item,
  isExpanded,
  onToggle,
  onWatchVideo,
  resolveSpeakerName,
}: AgendaCardProps) {
  const motionCount = item.motions?.length || 0;
  // Use the outcome of the first motion as the primary outcome for the card badge
  const primaryMotion = item.motions?.[0];
  const outcome = primaryMotion?.result;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200 border",
        isExpanded ? "ring-1 ring-primary/20 shadow-md" : "hover:bg-muted/30",
      )}
    >
      <CardHeader className="cursor-pointer select-none p-4" onClick={onToggle}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {item.item_order}
              </span>
              {item.is_consent_agenda && (
                <Badge
                  variant="outline"
                  className="h-5 text-[9px] uppercase font-bold text-blue-600 border-blue-200 bg-blue-50"
                >
                  Consent Agenda
                </Badge>
              )}
              {item.category && (
                <Badge
                  variant="secondary"
                  className="h-5 text-[9px] uppercase font-bold"
                >
                  {item.category}
                </Badge>
              )}
              {item.is_controversial && (
                <Badge
                  variant="destructive"
                  className="h-5 text-[9px] uppercase font-bold bg-orange-500 hover:bg-orange-600"
                >
                  High Interest
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold leading-snug pt-1">
              {item.title}
            </CardTitle>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {item.financial_cost !== undefined && item.financial_cost > 0 && (
                <div className="flex items-center text-[11px] font-semibold text-emerald-700">
                  <DollarSign className="w-3 h-3 mr-0.5" />
                  {new Intl.NumberFormat("en-CA", {
                    style: "currency",
                    currency: "CAD",
                    maximumFractionDigits: 0,
                  }).format(item.financial_cost)}
                </div>
              )}
              {motionCount > 0 && (
                <div className="flex items-center text-[11px] font-semibold text-amber-700">
                  <Gavel className="w-3 h-3 mr-0.5" />
                  {motionCount} {motionCount === 1 ? "motion" : "motions"}
                </div>
              )}
              {item.neighborhood && (
                <div className="flex items-center text-[11px] font-semibold text-blue-700">
                  <MapPin className="w-3 h-3 mr-0.5" />
                  {item.neighborhood}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {outcome && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
                  outcome === "CARRIED"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700",
                )}
              >
                {outcome === "CARRIED" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {outcome}
              </div>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0 border-t bg-muted/5">
          <Tabs defaultValue="overview" className="w-full">
            <div className="px-4 border-b bg-muted/10">
              <TabsList className="h-10 bg-transparent gap-4">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 text-xs font-bold"
                >
                  <Info className="w-3 h-3 mr-1.5" />
                  Overview
                </TabsTrigger>
                {item.debate_summary && (
                  <TabsTrigger
                    value="debate"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 text-xs font-bold"
                  >
                    <MessageSquare className="w-3 h-3 mr-1.5" />
                    Discussion
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="intel"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 text-xs font-bold"
                >
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Intelligence
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-4 space-y-6">
              <TabsContent value="overview" className="mt-0 space-y-4">
                {item.plain_english_summary ? (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Simple Summary
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {item.plain_english_summary}
                    </p>
                  </div>
                ) : item.description ? (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Description
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {item.description}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No summary available for this item.
                  </div>
                )}

                {item.discussion_start_time !== undefined &&
                  item.discussion_start_time !== null &&
                  onWatchVideo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onWatchVideo(item.discussion_start_time!);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Watch Discussion
                    </button>
                  )}
              </TabsContent>

              <TabsContent value="debate" className="mt-0">
                {item.debate_summary ? (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Debate Summary
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {item.debate_summary}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No debate summary available.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="intel" className="mt-0">
                <IntelligenceSection
                  itemId={item.id}
                  initialIntelligence={item.meta?.intelligence}
                  resolveSpeakerName={resolveSpeakerName}
                />
              </TabsContent>

              {item.motions && item.motions.length > 0 && (
                <div className="pt-6 border-t space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Gavel className="w-3 h-3" />
                    Motions & Decisions
                  </h4>
                  <div className="grid gap-4">
                    {item.motions.map((motion) => (
                      <MotionCard key={motion.id} motion={motion} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
