import { Link } from "react-router";
import { BookOpen } from "lucide-react";

interface CrossRefBadgeProps {
  pattern: string; // "Bylaw No. 1059"
  url: string; // "/bylaws/42"
  title: string; // Full bylaw title for tooltip
}

export function CrossRefBadge({ pattern, url, title }: CrossRefBadgeProps) {
  return (
    <Link
      to={url}
      title={title}
      className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 hover:bg-purple-100 transition-colors no-underline"
    >
      <BookOpen className="w-3 h-3 shrink-0" />
      <span className="truncate max-w-[160px]">{pattern}</span>
    </Link>
  );
}
