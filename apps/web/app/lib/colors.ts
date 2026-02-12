export const SPEAKER_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-lime-500",
  "bg-fuchsia-500",
];

export const SPEAKER_TEXT_COLORS = [
  "text-blue-700",
  "text-emerald-700",
  "text-violet-700",
  "text-amber-700",
  "text-rose-700",
  "text-cyan-700",
  "text-orange-700",
  "text-indigo-700",
  "text-lime-700",
  "text-fuchsia-700",
];

export const SPEAKER_BG_LIGHT_COLORS = [
  "bg-blue-50",
  "bg-emerald-50",
  "bg-violet-50",
  "bg-amber-50",
  "bg-rose-50",
  "bg-cyan-50",
  "bg-orange-50",
  "bg-indigo-50",
  "bg-lime-50",
  "bg-fuchsia-50",
];

export const SPEAKER_BORDER_COLORS = [
  "border-blue-200",
  "border-emerald-200",
  "border-violet-200",
  "border-amber-200",
  "border-rose-200",
  "border-cyan-200",
  "border-orange-200",
  "border-indigo-200",
  "border-lime-200",
  "border-fuchsia-200",
];

export function getSpeakerColorIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % SPEAKER_COLORS.length;
}
