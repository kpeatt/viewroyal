import { useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

interface SearchInputProps {
  query: string;
  onChange: (q: string) => void;
  onSubmit: (q: string) => void;
  isStreaming: boolean;
  placeholder?: string;
}

export function SearchInput({
  query,
  onChange,
  onSubmit,
  isStreaming,
  placeholder = "Search meetings, motions, or ask a question...",
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2 && !isStreaming) {
      onSubmit(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative group">
      <Search
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors",
          "text-zinc-400 group-focus-within:text-blue-600",
        )}
      />
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={isStreaming}
        className="pl-12 pr-12 h-14 bg-white border-zinc-200 text-lg rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/10 transition-all"
      />
      {isStreaming && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        </div>
      )}
    </form>
  );
}
