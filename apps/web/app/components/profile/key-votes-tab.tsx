import { AlertTriangle } from "lucide-react";
import { KeyVoteCard } from "./key-vote-card";
import type { KeyVote } from "../../lib/types";

interface KeyVotesTabProps {
  keyVotes: KeyVote[];
  personName?: string;
  totalKeyVotes?: number;
}

export function KeyVotesTab({ keyVotes, personName, totalKeyVotes }: KeyVotesTabProps) {
  if (!keyVotes || keyVotes.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 font-medium">
          No notable key votes detected
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Key votes are identified when a councillor votes in the minority, on close votes, or breaks from usual allies.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 font-medium">
        Showing the top {keyVotes.length} most notable votes, ranked by significance.
      </p>

      {keyVotes.map((kv) => (
        <KeyVoteCard key={kv.id} keyVote={kv} personName={personName} />
      ))}

      {totalKeyVotes && totalKeyVotes > keyVotes.length && (
        <div className="text-center pt-4">
          <p className="text-xs text-zinc-400 font-bold">
            {totalKeyVotes - keyVotes.length} more key votes not shown
          </p>
        </div>
      )}
    </div>
  );
}
