import { useState } from "react";
import { useNavigate } from "react-router";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Send, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

interface AskQuestionProps {
  personId?: number;
  personName?: string;
  placeholder?: string;
  title?: string;
  className?: string;
}

export function AskQuestion({
  personId,
  personName,
  placeholder,
  title,
  className,
}: AskQuestionProps) {
  const [question, setQuestion] = useState("");
  const navigate = useNavigate();

  const isPerson = personId || personName;
  const defaultPlaceholder = isPerson
    ? `Ask about ${personName || "this person"}...`
    : "Ask a question about council meetings...";
  const defaultTitle = isPerson ? "Ask About This Person" : "Ask a Question";
  const showHeader = title !== "";

  const buildAskUrl = (q: string) => {
    const params = new URLSearchParams({ q });
    if (personName) params.set("person", personName);
    return `/search?${params.toString()}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    navigate(buildAskUrl(question.trim()));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const navigateToQuestion = (q: string) => {
    navigate(buildAskUrl(q));
  };

  const exampleQuestions = isPerson
    ? [
        "What are their priorities?",
        "How do they vote on housing?",
        "What topics do they speak about most?",
      ]
    : [
        "What has council discussed about housing?",
        "What major decisions were made recently?",
        "What are the current budget priorities?",
      ];

  return (
    <Card
      className={cn("border-none shadow-sm ring-1 ring-zinc-200", className)}
    >
      {showHeader && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            {title || defaultTitle}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn("space-y-4", !showHeader && "pt-5")}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            className={cn("flex-1 bg-white", !showHeader && "h-11 text-base")}
          />
          <Button
            type="submit"
            disabled={!question.trim()}
            size="icon"
            className={cn("shrink-0", !showHeader && "h-11 w-11")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <div className="space-y-2">
          <p className="text-xs text-zinc-400 font-medium">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => navigateToQuestion(q)}
                className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-blue-50 hover:text-blue-600 rounded-full text-zinc-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
