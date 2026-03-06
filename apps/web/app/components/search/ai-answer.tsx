import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import {
  Loader2,
  Brain,
  Check,
  Search,
  ChevronDown,
  Copy,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { AgentEvent } from "../../services/rag.server";
import { processCitationsInChildren } from "./citation-badge";
import { SourceCards } from "./source-cards";

// ---------------------------------------------------------------------------
// Human-friendly labels for tool calls (migrated from ask.tsx)
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  search_council_records: "Searching council records",
  search_documents: "Searching documents",
  search_matters: "Looking up council matters",
  get_person_info: "Looking up person info",
};

function getToolLabel(name: string, args?: any): string {
  if (name === "get_person_info" && args?.person_name) {
    return `Looking up ${args.person_name}'s info`;
  }
  return TOOL_LABELS[name] || name;
}

function getObservationSummary(result: any): string {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) return `Found ${parsed.length} results`;
      if (parsed.total !== undefined) return `Found ${parsed.total} records`;
      if (typeof parsed === "string" && parsed.length < 200) return parsed;
      return "Retrieved data";
    } catch {
      if (result.length < 200) return result;
      return "Retrieved data";
    }
  }
  if (Array.isArray(result)) return `Found ${result.length} results`;
  if (result?.total !== undefined) return `Found ${result.total} records`;
  return "Retrieved data";
}

// ---------------------------------------------------------------------------
// ResearchStep
// ---------------------------------------------------------------------------

function ResearchStep({ event }: { event: AgentEvent }) {
  if (event.type === "thought") {
    return (
      <div className="py-1 pl-6 text-sm text-zinc-400 italic leading-relaxed">
        {(event as any).thought}
      </div>
    );
  }
  if (event.type === "tool_call") {
    return (
      <div className="flex items-center gap-2.5 py-1.5 text-sm text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
        <span>{getToolLabel(event.name, event.args)}...</span>
      </div>
    );
  }
  if (event.type === "tool_observation") {
    return (
      <div className="flex items-center gap-2.5 py-1.5 text-sm text-zinc-400">
        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span>
          {getToolLabel(event.name)} &mdash;{" "}
          {getObservationSummary(event.result)}
        </span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confidence indicator
// ---------------------------------------------------------------------------

function ConfidenceIndicator({ sourceCount }: { sourceCount: number }) {
  let level: "high" | "medium" | "low";
  let label: string;
  let Icon: typeof ShieldCheck;
  let colorClasses: string;

  if (sourceCount >= 6) {
    level = "high";
    label = `High confidence -- based on ${sourceCount} sources`;
    Icon = ShieldCheck;
    colorClasses = "text-green-700 bg-green-50 border-green-200";
  } else if (sourceCount >= 3) {
    level = "medium";
    label = `Medium confidence -- based on ${sourceCount} sources`;
    Icon = ShieldAlert;
    colorClasses = "text-amber-700 bg-amber-50 border-amber-200";
  } else {
    level = "low";
    label = `Low confidence -- based on ${sourceCount} sources`;
    Icon = Shield;
    colorClasses = "text-zinc-600 bg-zinc-50 border-zinc-200";
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        colorClasses,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedbackButtons sub-component
// ---------------------------------------------------------------------------

function FeedbackButtons({ traceId }: { traceId: string }) {
  const [rating, setRating] = useState<-1 | 1 | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitFeedback(newRating: -1 | 1, feedbackComment?: string) {
    try {
      setSubmitting(true);
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traceId,
          rating: newRating,
          comment: feedbackComment || null,
        }),
      });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch {
      // Feedback is best-effort -- don't disrupt UX
    } finally {
      setSubmitting(false);
    }
  }

  function handleThumbsUp() {
    if (rating === 1) {
      setRating(null);
      return;
    }
    setRating(1);
    setShowComment(false);
    submitFeedback(1);
  }

  function handleThumbsDown() {
    if (rating === -1) {
      setRating(null);
      setShowComment(false);
      return;
    }
    setRating(-1);
    setShowComment(true);
  }

  function handleCommentSubmit() {
    if (rating === -1) {
      submitFeedback(-1, comment);
      setShowComment(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {submitted && (
          <span className="text-xs text-green-600 mr-1">Thanks!</span>
        )}
        <button
          onClick={handleThumbsUp}
          disabled={submitting}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            rating === 1
              ? "text-green-600 bg-green-50"
              : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100",
          )}
          title="Good answer"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleThumbsDown}
          disabled={submitting}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            rating === -1
              ? "text-red-600 bg-red-50"
              : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100",
          )}
          title="Bad answer"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {showComment && (
        <div className="flex gap-2 items-start">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What was wrong? (optional)"
            className="flex-1 text-xs border border-zinc-200 rounded-lg p-2 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
          <button
            onClick={handleCommentSubmit}
            disabled={submitting}
            className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiAnswer main component
// ---------------------------------------------------------------------------

interface AiAnswerProps {
  answer: string;
  sources: any[];
  agentSteps: AgentEvent[];
  isStreaming: boolean;
  sourceCount: number;
  onCopy: () => void;
  copied: boolean;
  traceId?: string | null;
}

export function AiAnswer({
  answer,
  sources,
  agentSteps,
  isStreaming,
  sourceCount,
  onCopy,
  copied,
  traceId,
}: AiAnswerProps) {
  const [stepsOpen, setStepsOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Reset sourcesOpen when a new answer starts streaming
  useEffect(() => {
    if (isStreaming) {
      setSourcesOpen(false);
    }
  }, [isStreaming]);

  const isResearching = isStreaming && !answer;
  const stepCount = agentSteps.filter((s) => s.type === "tool_call").length;

  // Auto-collapse steps once answer starts streaming
  const hasAnswer = answer.length > 0;

  // Custom ReactMarkdown components with inline citations
  const markdownComponents = useMemo<Components>(
    () => ({
      p: ({ children }) => (
        <p>{processCitationsInChildren(children, sources)}</p>
      ),
      li: ({ children }) => (
        <li>{processCitationsInChildren(children, sources)}</li>
      ),
    }),
    [sources],
  );

  return (
    <div className="space-y-4">
      {/* Research Steps -- collapsible */}
      {agentSteps.length > 0 && (
        <div>
          <button
            onClick={() => setStepsOpen(!stepsOpen)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-1"
          >
            <Search className="h-3.5 w-3.5" />
            <span>
              Research{stepCount > 0 ? ` (${stepCount} steps)` : ""}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                stepsOpen && !hasAnswer && "rotate-180",
                !stepsOpen && "rotate-0",
                stepsOpen && hasAnswer && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "grid transition-all duration-200 ease-in-out",
              stepsOpen && !hasAnswer
                ? "grid-rows-[1fr]"
                : hasAnswer
                  ? "grid-rows-[0fr]"
                  : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="pl-1 border-l-2 border-zinc-200 ml-1.5">
                {agentSteps.map((step, i) => (
                  <ResearchStep key={i} event={step} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Researching indicator */}
      {isResearching && agentSteps.length === 0 && (
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>Starting research...</span>
        </div>
      )}

      {/* Answer card */}
      <div
        className={cn(
          "p-6 bg-white border rounded-2xl shadow-sm transition-all duration-300",
          isStreaming && answer
            ? "border-blue-200 ring-1 ring-blue-100"
            : "border-zinc-200",
        )}
      >
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0 mt-0.5">
            <Brain className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="prose prose-base prose-zinc prose-blue max-w-none prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
              <ReactMarkdown components={markdownComponents}>
                {answer}
              </ReactMarkdown>
            </div>
            {isResearching && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Researching your question...</span>
              </div>
            )}
          </div>
        </div>

        {/* Confidence + copy + feedback actions after streaming completes */}
        {answer && !isStreaming && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
            <ConfidenceIndicator sourceCount={sourceCount} />
            <div className="flex items-center gap-3">
              {traceId && <FeedbackButtons traceId={traceId} />}
              <button
                onClick={onCopy}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy answer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Source cards below answer */}
      {sources.length > 0 && !isStreaming && (
        <SourceCards
          sources={sources}
          isOpen={sourcesOpen}
          onToggle={() => setSourcesOpen(!sourcesOpen)}
        />
      )}
    </div>
  );
}
