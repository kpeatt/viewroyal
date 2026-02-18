import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/search";
import { useSearchParams } from "react-router";
import { Search as SearchIcon, Sparkles } from "lucide-react";
import { classifyIntent } from "../lib/intent";
import type { AgentEvent } from "../services/rag.server";
import type { UnifiedSearchResult } from "../services/hybrid-search.server";
import { SearchInput } from "../components/search/search-input";
import { SearchTabs } from "../components/search/search-tabs";
import { AiAnswer } from "../components/search/ai-answer";
import { SearchResults } from "../components/search/search-results";

// ---------------------------------------------------------------------------
// Server loader
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const id = url.searchParams.get("id") || "";

  // If there's a cached result ID, fetch it from the API
  if (id) {
    // We return the ID so the client can fetch the cached result
    return { query: q, cachedId: id, intent: "question" as const, results: null };
  }

  // Determine intent from query
  const intent = q ? classifyIntent(q) : null;

  return { query: q, results: null, cachedId: null, intent };
}

// ---------------------------------------------------------------------------
// Example queries for empty state
// ---------------------------------------------------------------------------

const KEYWORD_EXAMPLES = ["bylaw 1234", "traffic calming", "zoning", "park"];
const QUESTION_EXAMPLES = [
  "What has council decided about housing?",
  "Who voted against the budget?",
  "What are the town's environmental priorities?",
];

// ---------------------------------------------------------------------------
// Search page component
// ---------------------------------------------------------------------------

export default function SearchPage({ loaderData }: Route.ComponentProps) {
  const { query: initialQuery, cachedId, intent: serverIntent } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  // Input state
  const [localQuery, setLocalQuery] = useState(initialQuery || "");

  // Active query that has been submitted
  const [activeQuery, setActiveQuery] = useState(initialQuery || "");

  // Tab state
  const [activeTab, setActiveTab] = useState<"ai" | "results">(
    serverIntent === "keyword" ? "results" : "ai",
  );

  // AI answer state
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cacheId, setCacheId] = useState<string | null>(cachedId || null);
  const [copied, setCopied] = useState(false);

  // Keyword results state
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Track whether each tab has been fetched for this query
  const aiFetched = useRef(false);
  const resultsFetched = useRef(false);

  // EventSource ref for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const answerStarted = useRef(false);

  // Previous Q&A for follow-up context
  const previousQA = useRef<string | undefined>(undefined);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // If we have a cached ID on load, fetch the cached result
  useEffect(() => {
    if (cachedId) {
      fetchCachedResult(cachedId);
    }
  }, [cachedId]);

  // If initial query exists (from URL), trigger search on mount
  useEffect(() => {
    if (initialQuery && !cachedId) {
      const intent = classifyIntent(initialQuery);
      setActiveTab(intent === "keyword" ? "results" : "ai");
      triggerSearch(initialQuery, intent === "keyword" ? "results" : "ai");
    }
  }, []); // Only on mount

  // ---------------------------------------------------------------------------
  // Fetch cached AI result
  // ---------------------------------------------------------------------------

  async function fetchCachedResult(id: string) {
    try {
      const res = await fetch(`/api/search?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          answer?: string;
          sources?: any[];
          query?: string;
        };
        setAnswer(data.answer || "");
        setSources(data.sources || []);
        if (data.query) {
          setActiveQuery(data.query);
          setLocalQuery(data.query);
        }
        setActiveTab("ai");
        aiFetched.current = true;
      }
    } catch (err) {
      console.error("Failed to fetch cached result:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Start AI streaming
  // ---------------------------------------------------------------------------

  function startAiStream(query: string) {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsStreaming(true);
    setAnswer("");
    setSources([]);
    setAgentSteps([]);
    setCacheId(null);
    setCopied(false);
    answerStarted.current = false;
    aiFetched.current = true;

    const contextParts: string[] = [];
    if (previousQA.current) contextParts.push(previousQA.current);
    const contextParam = contextParts.length
      ? `&context=${encodeURIComponent(contextParts.join(" "))}`
      : "";

    const eventSource = new EventSource(
      `/api/search?q=${encodeURIComponent(query)}${contextParam}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as AgentEvent | { type: string; id?: string };
      switch (data.type) {
        case "tool_call":
          setAgentSteps((prev) => [...prev, data as AgentEvent]);
          break;
        case "tool_observation":
          setAgentSteps((prev) => {
            const newSteps = [...prev];
            newSteps[newSteps.length - 1] = data as AgentEvent;
            return newSteps;
          });
          break;
        case "final_answer_chunk":
          if (!answerStarted.current) {
            answerStarted.current = true;
          }
          setAnswer((prev) => prev + (data as any).chunk);
          break;
        case "sources":
          setSources((data as any).sources);
          break;
        case "cache_id": {
          const newCacheId = (data as any).id;
          setCacheId(newCacheId);
          // Update URL with cache ID for shareability
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("id", newCacheId);
              return next;
            },
            { replace: true },
          );
          break;
        }
        case "done":
          setIsStreaming(false);
          previousQA.current = query;
          eventSource.close();
          eventSourceRef.current = null;
          break;
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        console.error("AI stream error");
      }
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch keyword results
  // ---------------------------------------------------------------------------

  async function fetchKeywordResults(query: string) {
    setIsLoadingResults(true);
    resultsFetched.current = true;

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&mode=keyword`,
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: UnifiedSearchResult[] };
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Keyword search error:", err);
    } finally {
      setIsLoadingResults(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Trigger search based on tab
  // ---------------------------------------------------------------------------

  function triggerSearch(query: string, tab: "ai" | "results") {
    if (tab === "ai") {
      startAiStream(query);
    } else {
      fetchKeywordResults(query);
    }
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  function handleSubmit(query: string) {
    if (query.length < 2) return;

    // Cleanup any active stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Reset state for new query
    setActiveQuery(query);
    setAnswer("");
    setSources([]);
    setAgentSteps([]);
    setSearchResults([]);
    setCacheId(null);
    setIsStreaming(false);
    aiFetched.current = false;
    resultsFetched.current = false;

    // Update URL
    setSearchParams({ q: query }, { replace: true });

    // Detect intent and set default tab
    const intent = classifyIntent(query);
    const defaultTab = intent === "keyword" ? "results" : "ai";
    setActiveTab(defaultTab);

    // Trigger the search for the default tab
    triggerSearch(query, defaultTab);
  }

  // ---------------------------------------------------------------------------
  // Tab change handler (lazy-loads the other tab)
  // ---------------------------------------------------------------------------

  function handleTabChange(tab: "ai" | "results") {
    setActiveTab(tab);

    // Lazy-load the other tab's content if not yet fetched
    if (tab === "ai" && !aiFetched.current && activeQuery) {
      startAiStream(activeQuery);
    } else if (tab === "results" && !resultsFetched.current && activeQuery) {
      fetchKeywordResults(activeQuery);
    }
  }

  // ---------------------------------------------------------------------------
  // Copy handler
  // ---------------------------------------------------------------------------

  async function handleCopy() {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasQuery = activeQuery.length > 0;
  const hasAiAnswer = answer.length > 0 || isStreaming || agentSteps.length > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        {/* Search Input -- always visible */}
        {hasQuery ? (
          <SearchInput
            query={localQuery}
            onChange={setLocalQuery}
            onSubmit={handleSubmit}
            isStreaming={isStreaming}
            placeholder="Search or ask a follow-up..."
          />
        ) : null}

        {/* Empty State */}
        {!hasQuery && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto border-4 border-blue-100">
              <SearchIcon className="h-10 w-10 text-blue-500" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mt-6 mb-3">
              Search View Royal Council Records
            </h1>
            <p className="text-zinc-500 max-w-lg mx-auto mb-8">
              Ask a question or search for keywords across meetings, motions,
              documents, and transcripts
            </p>

            <div className="max-w-2xl mx-auto mb-10">
              <SearchInput
                query={localQuery}
                onChange={setLocalQuery}
                onSubmit={handleSubmit}
                isStreaming={false}
              />
            </div>

            {/* Example query chips */}
            <div className="space-y-4 max-w-xl mx-auto">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  Ask a question
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUESTION_EXAMPLES.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setLocalQuery(q);
                        handleSubmit(q);
                      }}
                      className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full transition-colors font-medium flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3 w-3" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  Search keywords
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {KEYWORD_EXAMPLES.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setLocalQuery(q);
                        handleSubmit(q);
                      }}
                      className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-full transition-colors font-medium"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results state */}
        {hasQuery && (
          <>
            {/* Tabs */}
            <SearchTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              resultCount={searchResults.length}
              hasAiAnswer={hasAiAnswer}
            />

            {/* Tab Content */}
            {activeTab === "ai" ? (
              <AiAnswer
                answer={answer}
                sources={sources}
                agentSteps={agentSteps}
                isStreaming={isStreaming}
                sourceCount={sources.length}
                onCopy={handleCopy}
                copied={copied}
              />
            ) : (
              <SearchResults
                results={searchResults}
                query={activeQuery}
                isLoading={isLoadingResults}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
