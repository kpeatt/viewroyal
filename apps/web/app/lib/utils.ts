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
