import {
  Building2,
  ScrollText,
  MapPin,
  Trees,
  Coins,
  FileText,
  Shield,
  Car,
} from "lucide-react";

/**
 * The 8 predefined topics for councillor profiling.
 * Maps from the ~470 agenda_item categories via normalize_category_to_topic() in SQL.
 */
export const TOPICS = [
  "Administration",
  "Bylaw",
  "Development",
  "Environment",
  "Finance",
  "General",
  "Public Safety",
  "Transportation",
] as const;

export type TopicName = (typeof TOPICS)[number];

/**
 * Maps each topic to a lucide-react icon component for visual scanning.
 */
export const TOPIC_ICONS: Record<TopicName, typeof Building2> = {
  Administration: Building2,
  Bylaw: ScrollText,
  Development: MapPin,
  Environment: Trees,
  Finance: Coins,
  General: FileText,
  "Public Safety": Shield,
  Transportation: Car,
};

/**
 * Maps each topic to Tailwind class strings for text, background, and border colors.
 * Used for topic badges, cards, and chart segments.
 */
export const TOPIC_COLORS: Record<TopicName, string> = {
  Administration: "text-zinc-500 bg-zinc-50 border-zinc-200",
  Bylaw: "text-amber-600 bg-amber-50 border-amber-200",
  Development: "text-blue-600 bg-blue-50 border-blue-200",
  Environment: "text-green-600 bg-green-50 border-green-200",
  Finance: "text-yellow-600 bg-yellow-50 border-yellow-200",
  General: "text-zinc-400 bg-zinc-50 border-zinc-100",
  "Public Safety": "text-red-600 bg-red-50 border-red-200",
  Transportation: "text-purple-600 bg-purple-50 border-purple-200",
};
