import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a YYYY-MM-DD date string into a localized string.
 * Prevents UTC-to-Local rollover issues by parsing parts directly.
 */
export function formatDate(dateStr: string, options: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}) {
  if (!dateStr) return "";
  
  // Parse YYYY-MM-DD directly to avoid timezone shifts
  const [year, month, day] = dateStr.split('-').map(Number);
  // month is 0-indexed in JS Date constructor
  const date = new Date(year, month - 1, day);
  
  return date.toLocaleDateString(undefined, options);
}

/**
 * Formats a date string as relative time ("3 days ago", "2 weeks ago").
 * Intentionally simple -- no i18n, English only, covers all needed buckets.
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;
  return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
}
