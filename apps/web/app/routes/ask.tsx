import { useState, useEffect, useRef, useMemo } from "react";
import type { Route } from "./+types/ask";
import { useSearchParams, Link } from "react-router";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Send,
  Loader2,
  Sparkles,
  FileText,
  Mic,
  Gavel,
  ExternalLink,
  Brain,
  ChevronDown,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "../components/ui/hover-card";
import type { AgentEvent } from "../services/rag.server";

// Human-friendly labels for tool calls
const TOOL_LABELS: Record<string, string> = {
  search_motions: "Searching council decisions",
  search_transcript_segments: "Searching meeting transcripts",
  search_matters: "Looking up council matters",
  search_agenda_items: "Searching agenda items",
  get_voting_history: "Looking up voting record",
  get_statements_by_person: "Finding statements",
  get_current_date: "Checking current date",
};

function getToolLabel(name: string, args?: any): string {
  if (name === "get_statements_by_person" && args?.person_name) {
    return `Finding statements by ${args.person_name}`;
  }
  if (name === "get_voting_history" && args?.person_name) {
    return `Looking up ${args.person_name}'s voting record`;
  }
  return TOOL_LABELS[name] || name;
}

function getObservationSummary(result: any): string {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) return `Found ${parsed.length} results`;
      if (parsed.total !== undefined) return `Found ${parsed.total} records`;
      return "Retrieved data";
    } catch {
      if (result.length < 80) return result;
      return "Retrieved data";
    }
  }
  if (Array.isArray(result)) return `Found ${result.length} results`;
  if (result?.total !== undefined) return `Found ${result.total} records`;
  return "Retrieved data";
}

const ResearchStep = ({
  event,
  isLatest,
}: {
  event: AgentEvent;
  isLatest: boolean;
}) => {
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
};

const SourceIcon = ({ type, className }: { type?: string; className?: string }) => {
  const cls = className || "h-3 w-3 text-zinc-400";
  if (type === "transcript") return <Mic className={cls} />;
  if (type === "motion" || type === "vote")
    return <Gavel className={cls} />;
  return <FileText className={cls} />;
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  transcript: "Transcript",
  motion: "Motion",
  vote: "Vote",
  matter: "Matter",
  agenda_item: "Agenda Item",
};

function CitationBadge({ num, source }: { num: number; source: any }) {
  const label = SOURCE_TYPE_LABEL[source?.type] || "Source";
  const meetingLink = source?.meeting_id ? `/meetings/${source.meeting_id}` : "#";
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          to={meetingLink}
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold leading-none !no-underline hover:!no-underline hover:bg-blue-200 transition-colors align-super ml-0.5 cursor-pointer"
        >
          {num}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-72 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <SourceIcon type={source?.type} className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {label}
          </span>
          {source?.meeting_date && (
            <span className="text-[10px] text-zinc-400 ml-auto">
              {source.meeting_date}
            </span>
          )}
        </div>
        {source?.speaker_name && (
          <p className="text-xs font-semibold text-zinc-700 mb-0.5">
            {source.speaker_name}
          </p>
        )}
        <p className="text-xs text-zinc-600 line-clamp-3">
          {source?.title || "View source"}
        </p>
        <Link
          to={meetingLink}
          className="flex items-center gap-1 mt-2 text-[10px] font-medium text-blue-600 hover:text-blue-700 no-underline"
        >
          View in meeting <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Walk react-markdown children and replace "[N]" text fragments with CitationBadge components.
 */
function processCitationsInChildren(children: React.ReactNode, sources: any[]): React.ReactNode {
  return Array.isArray(children) ? children.map((child, i) => processCitationNode(child, sources, i)) : processCitationNode(children, sources, 0);
}

function processCitationNode(node: React.ReactNode, sources: any[], key: number): React.ReactNode {
  if (typeof node !== "string") return node;
  // Split string on citation patterns like [1], [2], [1][2]
  const parts = node.split(/(\[\d+\])/g);
  if (parts.length === 1) return node;
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const source = sources[num - 1];
      if (source) return <CitationBadge key={`${key}-cite-${i}`} num={num} source={source} />;
    }
    return part;
  });
}

export default function AskPage({ loaderData }: Route.ComponentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q");
  const person = searchParams.get("person");
  // Initialize localQuery from URL if present
  const [localQuery, setLocalQuery] = useState(query || "");

  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  // Track previous Q&A for follow-up context
  const previousQA = useRef<string | undefined>(undefined);
  // Track whether answer has started streaming
  const answerStarted = useRef(false);
  // Track EventSource to handle cleanup manually
  const eventSourceRef = useRef<EventSource | null>(null);

  // Sync input with URL changes (e.g. back/forward navigation)
  useEffect(() => {
    if (query && query !== localQuery) {
      setLocalQuery(query);
    }
  }, [query]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const performSearch = (searchQuery: string) => {
    if (!searchQuery) return;

    // Cleanup previous stream if active
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsStreaming(true);
    setAnswer("");
    setSources([]);
    setAgentSteps([]);
    setError(null);
    setStepsOpen(true);
    setCopied(false);
    answerStarted.current = false;

    const contextParts: string[] = [];
    if (person) contextParts.push(`This question is about ${person}.`);
    if (previousQA.current) contextParts.push(previousQA.current);
    const contextParam = contextParts.length
      ? `&context=${encodeURIComponent(contextParts.join(" "))}`
      : "";

    const eventSource = new EventSource(
      `/api/ask?q=${encodeURIComponent(searchQuery)}${contextParam}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as AgentEvent;
      switch (data.type) {
        case "tool_call":
          setAgentSteps((prev) => [...prev, data]);
          break;
        case "tool_observation":
          setAgentSteps((prev) => {
            const newSteps = [...prev];
            newSteps[newSteps.length - 1] = data;
            return newSteps;
          });
          break;
        case "final_answer_chunk":
          if (!answerStarted.current) {
            answerStarted.current = true;
            setStepsOpen(false);
          }
          setAnswer((prev) => prev + data.chunk);
          break;
        case "sources":
          setSources(data.sources);
          break;
                  case "done":
                  setIsStreaming(false);
                  setLocalQuery("");
                  previousQA.current = searchQuery;
                  eventSource.close();
                  eventSourceRef.current = null;
                  break;
        
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setIsStreaming(false);
      } else {
        setError("An error occurred with the AI connection. Please try again.");
        setIsStreaming(false);
        eventSource.close();
      }
      eventSourceRef.current = null;
    };
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim().length >= 2) {
      setSearchParams({ q: localQuery });
      performSearch(localQuery);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exampleQuestions = [
    "What has council discussed about housing?",
    "What are Sid Tobias's main priorities?",
    "What is the town's stance on environmental protection?",
  ];

  const isResearching = isStreaming && !answer;
  const stepCount = agentSteps.filter((s) => s.type === "tool_call").length;

  // Custom ReactMarkdown components that render citation badges inline
  const markdownComponents = useMemo<Components>(() => ({
    p: ({ children }) => {
      return <p>{processCitationsInChildren(children, sources)}</p>;
    },
    li: ({ children }) => {
      return <li>{processCitationsInChildren(children, sources)}</li>;
    },
  }), [sources]);

  // Determine which layout to show
  // We show the "Results" layout if:
  // 1. A search is currently streaming
  // 2. We have an answer or error
  // 3. We have research steps
  const showResultsMode =
    isStreaming || answer.length > 0 || agentSteps.length > 0 || error !== null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-3xl">
        {showResultsMode && (
          <div className="mb-12">
            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-1">
                You asked{person ? ` about ${person}` : ""}:
              </p>
              <h1 className="text-2xl font-bold text-zinc-900">{query}</h1>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Research Steps — collapsible */}
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
                        stepsOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "grid transition-all duration-200 ease-in-out",
                      stepsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="pl-1 border-l-2 border-zinc-200 ml-1.5">
                        {agentSteps.map((step, i) => (
                          <ResearchStep
                            key={i}
                            event={step}
                            isLatest={i === agentSteps.length - 1}
                          />
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
                      <ReactMarkdown components={markdownComponents}>{answer}</ReactMarkdown>
                    </div>
                    {isResearching && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Researching your question...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Copy button — after streaming completes */}
                {answer && !isStreaming && (
                  <div className="flex justify-end mt-3 pt-3 border-t border-zinc-100">
                    <button
                      onClick={handleCopy}
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
                )}
              </div>

              {/* Sources — compact list */}
              {sources.length > 0 && !isStreaming && (
                <div>
                  <button
                    onClick={() => setSourcesOpen(!sourcesOpen)}
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-2"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Sources ({sources.length})</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        sourcesOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "grid transition-all duration-200 ease-in-out",
                      sourcesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-wrap gap-1.5">
                        {sources.map((source: any, i: number) => (
                          <Link
                            key={`${source.type}-${source.id}-${i}`}
                            to={
                              source.meeting_id
                                ? `/meetings/${source.meeting_id}`
                                : "#"
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-zinc-200 hover:border-blue-200 hover:bg-blue-50/50 transition-colors group text-xs"
                          >
                            <span className="w-5 h-5 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
                              {i + 1}
                            </span>
                            <SourceIcon type={source.type} />
                            <span className="text-zinc-500 max-w-[180px] truncate">
                              {source.meeting_date}
                              {source.speaker_name ? ` — ${source.speaker_name}` : ""}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!showResultsMode && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto border-4 border-blue-100">
              <Sparkles className="h-10 w-10 text-blue-500" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mt-6 mb-4">
              Ask Anything
            </h1>
            <p className="text-zinc-600 max-w-md mx-auto mb-8">
              Get instant, AI-powered answers from View Royal's official
              records.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {exampleQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setLocalQuery(q);
                    setSearchParams({ q });
                    performSearch(q);
                  }}
                  className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-blue-100 hover:text-blue-700 rounded-full text-zinc-700 transition-colors font-medium"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 py-4 bg-zinc-50/80 backdrop-blur-md">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSearch} className="relative group">
              <Input
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                placeholder="Ask a follow-up or a new question..."
                disabled={isStreaming}
                className="pl-5 pr-12 h-14 bg-white border-zinc-300 text-lg rounded-2xl shadow-lg focus:ring-4 focus:ring-blue-500/20 transition-all"
              />
              <Button
                type="submit"
                disabled={!localQuery.trim() || isStreaming}
                size="icon"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full h-10 w-10"
              >
                {isStreaming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
