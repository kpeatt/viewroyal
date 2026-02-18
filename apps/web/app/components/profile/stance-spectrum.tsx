/**
 * StanceSpectrum — visual indicator showing where a councillor falls
 * on a supports-to-opposes scale for a given topic.
 *
 * Props:
 *   score: number from -1.0 (strongly opposes) to 1.0 (strongly supports)
 *   position: 'supports' | 'opposes' | 'mixed' | 'neutral'
 *
 * Visual: horizontal gradient bar from red (opposes) through gray (neutral) to green (supports)
 * with a positioned marker at the score location and a label below.
 *
 * Used by both the profile page (Plan 03) and comparison page (Plan 04).
 */

interface StanceSpectrumProps {
  score: number;
  position: "supports" | "opposes" | "mixed" | "neutral";
}

const POSITION_LABELS: Record<StanceSpectrumProps["position"], string> = {
  supports: "Supports",
  opposes: "Opposes",
  mixed: "Mixed",
  neutral: "Neutral",
};

const POSITION_MARKER_COLORS: Record<StanceSpectrumProps["position"], string> = {
  supports: "bg-green-600 border-green-700",
  opposes: "bg-red-600 border-red-700",
  mixed: "bg-amber-500 border-amber-600",
  neutral: "bg-zinc-400 border-zinc-500",
};

export function StanceSpectrum({ score, position }: StanceSpectrumProps) {
  // Clamp score to [-1, 1] and convert to percentage [0, 100]
  const clampedScore = Math.max(-1, Math.min(1, score));
  const percentage = ((clampedScore + 1) / 2) * 100;

  return (
    <div className="w-full">
      {/* Gradient bar with marker */}
      <div className="relative h-3 rounded-full bg-gradient-to-r from-red-400 via-zinc-300 to-green-400">
        {/* Marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 shadow-sm ${POSITION_MARKER_COLORS[position]}`}
          style={{ left: `${percentage}%` }}
          aria-label={`Position: ${POSITION_LABELS[position]} (score: ${clampedScore.toFixed(1)})`}
        />
      </div>

      {/* Labels */}
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>Opposes</span>
        <span className="font-medium text-foreground">
          {POSITION_LABELS[position]}
        </span>
        <span>Supports</span>
      </div>
    </div>
  );
}
