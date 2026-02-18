interface FollowUpProps {
  suggestions: string[];
  onSelect: (q: string) => void;
  disabled: boolean;
}

export function FollowUp({ suggestions, onSelect, disabled }: FollowUpProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      <span className="text-xs font-medium text-zinc-400">Follow up:</span>
      {suggestions.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-blue-50 hover:text-blue-700 rounded-full text-zinc-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
