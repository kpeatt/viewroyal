import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { 
  Sparkles, ThumbsUp, ThumbsDown, HelpCircle, 
  Loader2, ChevronDown, ChevronUp, MessageSquare 
} from "lucide-react";
import { cn } from "../lib/utils";

interface IntelligenceSectionProps {
  itemId: number;
  initialIntelligence?: any;
  resolveSpeakerName: (seg: { speaker_name?: string | null }) => string;
}

export function IntelligenceSection({ 
  itemId, 
  initialIntelligence, 
  resolveSpeakerName 
}: IntelligenceSectionProps) {
  const fetcher = useFetcher();
  const [intelligence, setIntelligence] = useState(initialIntelligence);
  const [isExpanded, setIsExpanded] = useState(false);

  const loading = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  // Update local state when fetcher completes
  useEffect(() => {
    if (fetcher.data?.intelligence) {
      setIntelligence(fetcher.data.intelligence);
      setIsExpanded(true);
    }
  }, [fetcher.data]);

  const generateIntelligence = () => {
    fetcher.submit({}, { 
      method: "post", 
      action: `/api/intel/${itemId}` 
    });
  };

  return (
    <div className="mt-4">
      {!intelligence && !loading ? (
        <button
          onClick={generateIntelligence}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors bg-indigo-50/50 px-3 py-1.5 rounded-full border border-indigo-100 hover:border-indigo-200 shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          See AI Deep Analysis
        </button>
      ) : (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={loading}
          className={cn(
              "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors mb-2",
              intelligence ? "text-indigo-600" : "text-zinc-400 cursor-wait"
          )}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing Discussion...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              AI Discussion Intelligence
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </div>
          )}
        </button>
      )}

      {error && (
        <p className="text-[10px] text-red-500 font-bold mt-2">{error}</p>
      )}

      {isExpanded && intelligence && (
        <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-white rounded-2xl border border-indigo-100 shadow-sm">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <MessageSquare className="h-3 w-3" />
              Detailed Analysis
            </h4>
            <div className="text-sm text-zinc-700 leading-relaxed space-y-3 whitespace-pre-wrap">
              {intelligence.detailed_analysis}
            </div>
          </div>

          {intelligence.arguments && intelligence.arguments.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
                  <ThumbsUp className="h-3 w-3" />
                  Supporting Points
                </h5>
                <div className="space-y-2">
                  {intelligence.arguments
                    .filter((arg: any) => arg.side === 'Pro')
                    .map((arg: any, idx: number) => (
                      <div key={idx} className="p-3 bg-green-50/30 border border-green-100 rounded-xl text-xs text-zinc-700">
                        {arg.point}
                        {arg.speaker && (
                          <div className="mt-1 font-bold text-green-700 text-[10px]">
                            — {resolveSpeakerName({ speaker_name: arg.speaker })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                  <ThumbsDown className="h-3 w-3" />
                  Concerns Raised
                </h5>
                <div className="space-y-2">
                  {intelligence.arguments
                    .filter((arg: any) => arg.side === 'Con')
                    .map((arg: any, idx: number) => (
                      <div key={idx} className="p-3 bg-amber-50/30 border border-amber-100 rounded-xl text-xs text-zinc-700">
                        {arg.point}
                        {arg.speaker && (
                          <div className="mt-1 font-bold text-amber-700 text-[10px]">
                            — {resolveSpeakerName({ speaker_name: arg.speaker })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {intelligence.questions && intelligence.questions.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                <HelpCircle className="h-3 w-3" />
                Questions & Answers
              </h5>
              <div className="space-y-3">
                {intelligence.questions.map((q: any, idx: number) => (
                  <div key={idx} className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">Q</div>
                      <div>
                        <p className="text-xs font-bold text-zinc-900">{q.question}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Asked by {resolveSpeakerName({ speaker_name: q.asked_by })}</p>
                      </div>
                    </div>
                    {q.answer && q.answer !== 'N/A' && (
                      <div className="flex gap-3 pl-4 border-l-2 border-zinc-50">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-[10px] font-bold">A</div>
                        <div>
                          <p className="text-xs text-zinc-600 italic">{q.answer}</p>
                          {q.answered_by && (
                            <p className="text-[10px] text-zinc-400 mt-0.5">Answered by {resolveSpeakerName({ speaker_name: q.answered_by })}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {intelligence.sentiment_score !== undefined && (
            <div className="flex items-center gap-4 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Discussion Tone</span>
              <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden flex">
                <div 
                  className={cn(
                    "h-full transition-all",
                    intelligence.sentiment_score > 0 ? "bg-green-500" : intelligence.sentiment_score < 0 ? "bg-red-500" : "bg-blue-500"
                  )}
                  style={{ 
                    width: `${Math.abs(intelligence.sentiment_score) * 100}%`,
                    marginLeft: intelligence.sentiment_score > 0 ? '50%' : `${50 - Math.abs(intelligence.sentiment_score) * 50}%`,
                    marginRight: intelligence.sentiment_score < 0 ? '50%' : '0'
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-zinc-500">
                {intelligence.sentiment_score > 0.2 ? 'Positive' : intelligence.sentiment_score < -0.2 ? 'Critical' : 'Neutral'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
