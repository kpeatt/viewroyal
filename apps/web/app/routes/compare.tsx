import { useState, useMemo } from "react";
import type { Route } from "./+types/compare";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { getPeopleWithStats, type PersonWithStats } from "../services/people";
import { fetchRelevantVotesForAlignment } from "../services/people";
import {
  getCouncillorStances,
  getSpeakingTimeByTopic,
  getSpeakingTimeStats,
  type CouncillorStance,
  type SpeakingTimeByTopic,
  type SpeakingTimeStat,
} from "../services/profiling";
import {
  calculateAlignmentForPerson,
  type AlignmentResult,
} from "../lib/alignment-utils";
import { TOPICS, TOPIC_ICONS, TOPIC_COLORS, type TopicName } from "../lib/topic-utils";
import { StanceSpectrum } from "../components/profile/stance-spectrum";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { Link, useNavigate } from "react-router";
import {
  Scale,
  Users,
  ChevronDown,
  Check,
  X as XIcon,
  Minus,
  Clock,
  BarChart3,
  ArrowRight,
  ArrowLeftRight,
} from "lucide-react";

// ── Types ──

interface SelectModeData {
  mode: "select";
  councillors: PersonWithStats[];
  personA: PersonWithStats | null;
  personB: PersonWithStats | null;
  stancesA: null;
  stancesB: null;
  speakingA: null;
  speakingB: null;
  speakingStatsAll: null;
  pairwiseAlignment: null;
}

interface CompareModeData {
  mode: "compare";
  councillors: PersonWithStats[];
  personA: PersonWithStats;
  personB: PersonWithStats;
  stancesA: CouncillorStance[];
  stancesB: CouncillorStance[];
  speakingA: SpeakingTimeByTopic[];
  speakingB: SpeakingTimeByTopic[];
  speakingStatsAll: SpeakingTimeStat[];
  pairwiseAlignment: AlignmentResult | null;
}

type LoaderData = SelectModeData | CompareModeData;

// ── Meta ──

export const meta: Route.MetaFunction = ({ data }) => {
  const d = data as LoaderData | undefined;
  if (d?.mode === "compare" && d.personA && d.personB) {
    const title = `Compare ${d.personA.name} vs ${d.personB.name} | ViewRoyal.ai`;
    const description = `Side-by-side comparison of ${d.personA.name} and ${d.personB.name} on voting alignment, stances, and speaking time.`;
    return [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: `${d.personA.name} vs ${d.personB.name}` },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:image", content: "https://viewroyal.ai/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
  }
  return [
    { title: "Compare Councillors | ViewRoyal.ai" },
    { name: "description", content: "Compare two councillors side-by-side on voting alignment, policy stances, and speaking time." },
    { property: "og:title", content: "Compare Councillors | ViewRoyal.ai" },
    { property: "og:description", content: "Compare two councillors side-by-side on voting alignment, policy stances, and speaking time." },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "https://viewroyal.ai/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

// ── Loader ──

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const aId = url.searchParams.get("a");
  const bId = url.searchParams.get("b");
  const supabase = getSupabaseAdminClient();

  // Always load councillor list for selectors
  const councillors = await getPeopleWithStats(supabase);

  if (!aId || !bId) {
    const personA = aId ? councillors.find((c) => c.id === parseInt(aId)) ?? null : null;
    return {
      mode: "select" as const,
      councillors,
      personA,
      personB: null,
      stancesA: null,
      stancesB: null,
      speakingA: null,
      speakingB: null,
      speakingStatsAll: null,
      pairwiseAlignment: null,
    };
  }

  // Load both profiles in parallel
  const [stancesA, stancesB, speakingA, speakingB, speakingStatsAll] = await Promise.all([
    getCouncillorStances(supabase, parseInt(aId)),
    getCouncillorStances(supabase, parseInt(bId)),
    getSpeakingTimeByTopic(supabase, parseInt(aId)),
    getSpeakingTimeByTopic(supabase, parseInt(bId)),
    getSpeakingTimeStats(supabase),
  ]);

  // Compute pairwise voting alignment
  const [votesA, membershipsRes] = await Promise.all([
    fetchRelevantVotesForAlignment(supabase, aId),
    supabase
      .from("memberships")
      .select("*, people(id, name, image_url)")
      .eq(
        "organization_id",
        (
          await supabase
            .from("organizations")
            .select("id")
            .eq("classification", "Council")
            .single()
        ).data?.id || 1,
      ),
  ]);

  const alignmentResults = calculateAlignmentForPerson(
    parseInt(aId),
    votesA,
    membershipsRes.data || [],
    new Date(0),
    new Date(2100, 0, 1),
  );
  const pairwiseAlignment = alignmentResults.find((r) => r.personId === parseInt(bId)) ?? null;

  const personA = councillors.find((c) => c.id === parseInt(aId));
  const personB = councillors.find((c) => c.id === parseInt(bId));

  if (!personA || !personB) {
    return {
      mode: "select" as const,
      councillors,
      personA: personA ?? null,
      personB: personB ?? null,
      stancesA: null,
      stancesB: null,
      speakingA: null,
      speakingB: null,
      speakingStatsAll: null,
      pairwiseAlignment: null,
    };
  }

  return {
    mode: "compare" as const,
    councillors,
    personA,
    personB,
    stancesA,
    stancesB,
    speakingA,
    speakingB,
    speakingStatsAll,
    pairwiseAlignment,
  };
}

// ── Component ──

export default function ComparePage({ loaderData }: Route.ComponentProps) {
  const data = loaderData as LoaderData;

  if (data.mode === "select") {
    return <SelectionMode councillors={data.councillors} preselectedA={data.personA} />;
  }

  return <ComparisonMode data={data} />;
}

// ── Selection Mode ──

function SelectionMode({
  councillors,
  preselectedA,
}: {
  councillors: PersonWithStats[];
  preselectedA: PersonWithStats | null;
}) {
  const navigate = useNavigate();
  const [selectedA, setSelectedA] = useState<PersonWithStats | null>(preselectedA);
  const [selectedB, setSelectedB] = useState<PersonWithStats | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"a" | "b" | null>(null);

  const handleCompare = () => {
    if (selectedA && selectedB) {
      navigate(`/compare?a=${selectedA.id}&b=${selectedB.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-4xl">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg">
              <ArrowLeftRight className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">
            Compare Councillors
          </h1>
          <p className="text-zinc-500 mt-2 max-w-lg mx-auto">
            Select two councillors to compare their voting alignment, policy stances, and activity side-by-side.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Councillor A Selector */}
          <CouncillorSelector
            label="First Councillor"
            selected={selectedA}
            councillors={councillors}
            excludeId={selectedB?.id}
            isOpen={openDropdown === "a"}
            onToggle={() => setOpenDropdown(openDropdown === "a" ? null : "a")}
            onSelect={(p) => {
              setSelectedA(p);
              setOpenDropdown(null);
            }}
          />

          {/* Councillor B Selector */}
          <CouncillorSelector
            label="Second Councillor"
            selected={selectedB}
            councillors={councillors}
            excludeId={selectedA?.id}
            isOpen={openDropdown === "b"}
            onToggle={() => setOpenDropdown(openDropdown === "b" ? null : "b")}
            onSelect={(p) => {
              setSelectedB(p);
              setOpenDropdown(null);
            }}
          />
        </div>

        <div className="text-center">
          <button
            onClick={handleCompare}
            disabled={!selectedA || !selectedB}
            className={cn(
              "inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all shadow-md",
              selectedA && selectedB
                ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg"
                : "bg-zinc-200 text-zinc-400 cursor-not-allowed",
            )}
          >
            Compare
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Councillor Selector ──

function CouncillorSelector({
  label,
  selected,
  councillors,
  excludeId,
  isOpen,
  onToggle,
  onSelect,
}: {
  label: string;
  selected: PersonWithStats | null;
  councillors: PersonWithStats[];
  excludeId?: number;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (p: PersonWithStats) => void;
}) {
  const filteredCouncillors = councillors.filter((c) => c.id !== excludeId);

  return (
    <div className="relative">
      <label className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2 block">
        {label}
      </label>
      <button
        onClick={onToggle}
        className={cn(
          "w-full p-4 rounded-2xl border-2 bg-white text-left transition-all flex items-center gap-3",
          isOpen ? "border-indigo-400 ring-2 ring-indigo-100" : "border-zinc-200 hover:border-zinc-300",
        )}
      >
        {selected ? (
          <>
            <div className="h-10 w-10 rounded-full bg-zinc-200 overflow-hidden border border-white shrink-0">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} className="h-full w-full object-cover" />
              ) : (
                <Users className="h-5 w-5 m-2.5 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-zinc-900 truncate">{selected.name}</div>
              <div className="text-xs text-zinc-500">
                {getRole(selected)} {!selected.is_councillor && "(Former)"}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-zinc-400">
            <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <span className="font-medium">Select a councillor...</span>
          </div>
        )}
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden z-50 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          {filteredCouncillors.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50",
                selected?.id === c.id && "bg-indigo-50",
              )}
            >
              <div className="h-8 w-8 rounded-full bg-zinc-200 overflow-hidden border border-white shrink-0">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                ) : (
                  <Users className="h-4 w-4 m-2 text-zinc-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-zinc-700 truncate">{c.name}</div>
                <div className="text-xs text-zinc-400">
                  {getRole(c)} {!c.is_councillor && "(Former)"}
                </div>
              </div>
              {!c.is_councillor && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  Former
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Comparison Mode ──

function ComparisonMode({ data }: { data: CompareModeData }) {
  const {
    personA,
    personB,
    stancesA,
    stancesB,
    speakingA,
    speakingB,
    speakingStatsAll,
    pairwiseAlignment,
    councillors,
  } = data;

  const alignmentRate = pairwiseAlignment?.alignmentRate ?? null;
  const navigate = useNavigate();

  // Build stance maps keyed by topic
  const stanceMapA = useMemo(() => {
    const map = new Map<string, CouncillorStance>();
    for (const s of stancesA) map.set(s.topic, s);
    return map;
  }, [stancesA]);

  const stanceMapB = useMemo(() => {
    const map = new Map<string, CouncillorStance>();
    for (const s of stancesB) map.set(s.topic, s);
    return map;
  }, [stancesB]);

  // Speaking time maps
  const speakingMapA = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of speakingA) map.set(s.topic, s.total_seconds);
    return map;
  }, [speakingA]);

  const speakingMapB = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of speakingB) map.set(s.topic, s.total_seconds);
    return map;
  }, [speakingB]);

  // Total speaking hours from stats
  const statsA = speakingStatsAll?.find((s) => s.person_id === personA.id);
  const statsB = speakingStatsAll?.find((s) => s.person_id === personB.id);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Fixed mobile comparison bar */}
      <div className="lg:hidden sticky top-16 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200 px-4 py-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full bg-zinc-200 overflow-hidden shrink-0">
              {personA.image_url && <img src={personA.image_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <span className="font-bold text-zinc-700 truncate">{personA.name.split(" ").pop()}</span>
          </div>
          {alignmentRate !== null ? (
            <Badge
              className={cn(
                "shrink-0 mx-2",
                alignmentRate >= 80
                  ? "bg-green-100 text-green-700 border-green-200"
                  : alignmentRate >= 60
                    ? "bg-blue-100 text-blue-700 border-blue-200"
                    : "bg-amber-100 text-amber-700 border-amber-200",
              )}
            >
              {alignmentRate.toFixed(0)}% aligned
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 mx-2">
              No shared votes
            </Badge>
          )}
          <div className="flex items-center gap-2 min-w-0 justify-end">
            <span className="font-bold text-zinc-700 truncate">{personB.name.split(" ").pop()}</span>
            <div className="h-6 w-6 rounded-full bg-zinc-200 overflow-hidden shrink-0">
              {personB.image_url && <img src={personB.image_url} alt="" className="h-full w-full object-cover" />}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-8 lg:py-12 px-4 max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 lg:p-8 mb-8">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
            {/* Person A */}
            <div className="flex-1 flex flex-col items-center text-center">
              <Link to={`/people/${personA.id}`}>
                <div className="h-20 w-20 lg:h-24 lg:w-24 rounded-full bg-zinc-200 overflow-hidden border-4 border-white shadow-md hover:shadow-lg transition-shadow">
                  {personA.image_url ? (
                    <img src={personA.image_url} alt={personA.name} className="h-full w-full object-cover" />
                  ) : (
                    <Users className="h-10 w-10 m-5 lg:h-12 lg:w-12 lg:m-6 text-zinc-400" />
                  )}
                </div>
              </Link>
              <Link to={`/people/${personA.id}`} className="mt-3 font-bold text-lg text-zinc-900 hover:text-indigo-600 transition-colors">
                {personA.name}
              </Link>
              <span className="text-sm text-zinc-500">{getRole(personA)}</span>
            </div>

            {/* Alignment Score */}
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <Scale className="h-6 w-6 text-indigo-600" />
              </div>
              {alignmentRate !== null ? (
                <>
                  <div
                    className={cn(
                      "text-4xl lg:text-5xl font-black tabular-nums",
                      alignmentRate >= 80
                        ? "text-green-600"
                        : alignmentRate >= 60
                          ? "text-blue-600"
                          : "text-amber-600",
                    )}
                  >
                    {alignmentRate.toFixed(0)}%
                  </div>
                  <div className="text-sm font-medium text-zinc-500">Voting Alignment</div>
                  <div className="text-xs text-zinc-400">
                    {pairwiseAlignment?.matchingVotes} of {pairwiseAlignment?.totalMotions} shared votes
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-zinc-300">N/A</div>
                  <div className="text-sm text-zinc-400">No shared votes found</div>
                </>
              )}
            </div>

            {/* Person B */}
            <div className="flex-1 flex flex-col items-center text-center">
              <Link to={`/people/${personB.id}`}>
                <div className="h-20 w-20 lg:h-24 lg:w-24 rounded-full bg-zinc-200 overflow-hidden border-4 border-white shadow-md hover:shadow-lg transition-shadow">
                  {personB.image_url ? (
                    <img src={personB.image_url} alt={personB.name} className="h-full w-full object-cover" />
                  ) : (
                    <Users className="h-10 w-10 m-5 lg:h-12 lg:w-12 lg:m-6 text-zinc-400" />
                  )}
                </div>
              </Link>
              <Link to={`/people/${personB.id}`} className="mt-3 font-bold text-lg text-zinc-900 hover:text-indigo-600 transition-colors">
                {personB.name}
              </Link>
              <span className="text-sm text-zinc-500">{getRole(personB)}</span>
            </div>
          </div>
        </div>

        {/* Mobile scroll-snap container */}
        <div className="lg:hidden">
          {/* Stance Comparison (stacked on mobile) */}
          <StanceComparisonSection
            stanceMapA={stanceMapA}
            stanceMapB={stanceMapB}
            personA={personA}
            personB={personB}
          />

          {/* Activity Stats - Swipe cards */}
          <div className="mt-8">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2 px-1">
              <BarChart3 className="h-4 w-4" />
              Activity Comparison
            </h2>
            <div className="flex snap-x snap-mandatory overflow-x-auto -mx-4 px-4 gap-4 pb-4 scrollbar-hide">
              <ActivityCard
                person={personA}
                stats={statsA}
                speakingMap={speakingMapA}
                className="snap-center min-w-[85vw] max-w-[85vw]"
              />
              <ActivityCard
                person={personB}
                stats={statsB}
                speakingMap={speakingMapB}
                className="snap-center min-w-[85vw] max-w-[85vw]"
              />
            </div>
            <div className="flex justify-center gap-2 mt-2">
              <div className="h-1.5 w-6 rounded-full bg-zinc-300" />
              <div className="h-1.5 w-6 rounded-full bg-zinc-200" />
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden lg:block space-y-8">
          <StanceComparisonSection
            stanceMapA={stanceMapA}
            stanceMapB={stanceMapB}
            personA={personA}
            personB={personB}
          />

          {/* Speaking time comparison */}
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2 px-1">
              <BarChart3 className="h-4 w-4" />
              Activity Comparison
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <ActivityCard person={personA} stats={statsA} speakingMap={speakingMapA} />
              <ActivityCard person={personB} stats={statsB} speakingMap={speakingMapB} />
            </div>
          </div>

          {/* Speaking time by topic - dual bar chart */}
          <SpeakingTimeComparison
            personA={personA}
            personB={personB}
            speakingMapA={speakingMapA}
            speakingMapB={speakingMapB}
          />
        </div>

        {/* Change comparison link */}
        <div className="mt-12 text-center">
          <Link
            to="/compare"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Compare different councillors
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Stance Comparison Section ──

function StanceComparisonSection({
  stanceMapA,
  stanceMapB,
  personA,
  personB,
}: {
  stanceMapA: Map<string, CouncillorStance>;
  stanceMapB: Map<string, CouncillorStance>;
  personA: PersonWithStats;
  personB: PersonWithStats;
}) {
  return (
    <div>
      <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2 px-1">
        <Scale className="h-4 w-4" />
        Stance Comparison
      </h2>
      <div className="space-y-3">
        {TOPICS.map((topic) => {
          const sA = stanceMapA.get(topic);
          const sB = stanceMapB.get(topic);
          const Icon = TOPIC_ICONS[topic];
          const colorClasses = TOPIC_COLORS[topic];

          return (
            <StanceRow
              key={topic}
              topic={topic}
              Icon={Icon}
              colorClasses={colorClasses}
              stanceA={sA ?? null}
              stanceB={sB ?? null}
              personAName={personA.name}
              personBName={personB.name}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Stance Row ──

function StanceRow({
  topic,
  Icon,
  colorClasses,
  stanceA,
  stanceB,
  personAName,
  personBName,
}: {
  topic: TopicName;
  Icon: React.ElementType;
  colorClasses: string;
  stanceA: CouncillorStance | null;
  stanceB: CouncillorStance | null;
  personAName: string;
  personBName: string;
}) {
  const agreement = getAgreementLevel(stanceA, stanceB);

  return (
    <Card className="border-zinc-200 shadow-sm overflow-hidden">
      <div className="p-4 lg:p-5">
        {/* Topic header row */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("p-1.5 rounded-lg border", colorClasses)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="font-bold text-zinc-900 text-sm lg:text-base flex-1">{topic}</span>
          <AgreementIndicator level={agreement.level} />
        </div>

        {/* Stances side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Person A */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {personAName.split(" ").pop()}
            </div>
            {stanceA ? (
              <>
                <StanceSpectrum score={stanceA.position_score ?? 0} position={stanceA.position} />
                <p className="text-xs text-zinc-500 line-clamp-2">{stanceA.summary}</p>
              </>
            ) : (
              <div className="text-sm text-zinc-300 italic py-3">No stance data</div>
            )}
          </div>

          {/* Person B */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {personBName.split(" ").pop()}
            </div>
            {stanceB ? (
              <>
                <StanceSpectrum score={stanceB.position_score ?? 0} position={stanceB.position} />
                <p className="text-xs text-zinc-500 line-clamp-2">{stanceB.summary}</p>
              </>
            ) : (
              <div className="text-sm text-zinc-300 italic py-3">No stance data</div>
            )}
          </div>
        </div>

        {/* Comparison note */}
        {agreement.note && (
          <div className="mt-3 pt-3 border-t border-zinc-100">
            <p className="text-xs text-zinc-500 italic">{agreement.note}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Agreement Indicator ──

function AgreementIndicator({ level }: { level: "agree" | "disagree" | "partial" | "no-data" }) {
  switch (level) {
    case "agree":
      return (
        <div className="flex items-center gap-1 text-green-600">
          <Check className="h-4 w-4" />
          <span className="text-xs font-bold">Agree</span>
        </div>
      );
    case "disagree":
      return (
        <div className="flex items-center gap-1 text-red-600">
          <XIcon className="h-4 w-4" />
          <span className="text-xs font-bold">Disagree</span>
        </div>
      );
    case "partial":
      return (
        <div className="flex items-center gap-1 text-amber-500">
          <Minus className="h-4 w-4" />
          <span className="text-xs font-bold">Mixed</span>
        </div>
      );
    case "no-data":
      return (
        <div className="flex items-center gap-1 text-zinc-300">
          <Minus className="h-4 w-4" />
          <span className="text-xs font-bold">No data</span>
        </div>
      );
  }
}

// ── Activity Card ──

function ActivityCard({
  person,
  stats,
  speakingMap,
  className,
}: {
  person: PersonWithStats;
  stats: SpeakingTimeStat | undefined;
  speakingMap: Map<string, number>;
  className?: string;
}) {
  const totalHours = stats ? (stats.total_seconds / 3600).toFixed(1) : "0";
  const meetingCount = stats?.meeting_count ?? 0;
  const attendanceRate = person.stats?.rate ?? 0;

  return (
    <Card className={cn("border-zinc-200 shadow-sm", className)}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-zinc-200 overflow-hidden border border-white shrink-0">
            {person.image_url ? (
              <img src={person.image_url} alt={person.name} className="h-full w-full object-cover" />
            ) : (
              <Users className="h-4 w-4 m-2 text-zinc-400" />
            )}
          </div>
          <span className="font-bold text-zinc-900 text-sm">{person.name}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Speaking Time" value={`${totalHours}h`} />
          <StatBlock label="Attendance" value={`${attendanceRate}%`} />
          <StatBlock label="Meetings" value={`${meetingCount}`} />
          <StatBlock label="Total Votes" value={`${person.stats?.total ?? 0}`} />
        </div>

        {/* Topic breakdown mini-bars (mobile only helper) */}
        <div className="lg:hidden space-y-1.5 pt-2 border-t border-zinc-100">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Topics</div>
          {TOPICS.filter((t) => speakingMap.has(t)).map((topic) => {
            const seconds = speakingMap.get(topic) || 0;
            const maxSeconds = Math.max(...Array.from(speakingMap.values()));
            const pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0;
            const Icon = TOPIC_ICONS[topic];
            return (
              <div key={topic} className="flex items-center gap-2">
                <Icon className="h-3 w-3 text-zinc-400 shrink-0" />
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums w-10 text-right">
                  {formatSeconds(seconds)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Speaking Time Comparison (Desktop) ──

function SpeakingTimeComparison({
  personA,
  personB,
  speakingMapA,
  speakingMapB,
}: {
  personA: PersonWithStats;
  personB: PersonWithStats;
  speakingMapA: Map<string, number>;
  speakingMapB: Map<string, number>;
}) {
  const maxSeconds = useMemo(() => {
    let max = 0;
    for (const topic of TOPICS) {
      max = Math.max(max, speakingMapA.get(topic) ?? 0, speakingMapB.get(topic) ?? 0);
    }
    return max;
  }, [speakingMapA, speakingMapB]);

  if (maxSeconds === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2 px-1">
        <Clock className="h-4 w-4" />
        Speaking Time by Topic
      </h2>
      <Card className="border-zinc-200 shadow-sm">
        <CardContent className="p-6">
          {/* Legend */}
          <div className="flex items-center gap-6 mb-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-indigo-500" />
              <span className="font-medium text-zinc-600">{personA.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-violet-300" />
              <span className="font-medium text-zinc-600">{personB.name}</span>
            </div>
          </div>

          <div className="space-y-4">
            {TOPICS.map((topic) => {
              const secA = speakingMapA.get(topic) ?? 0;
              const secB = speakingMapB.get(topic) ?? 0;
              if (secA === 0 && secB === 0) return null;
              const pctA = maxSeconds > 0 ? (secA / maxSeconds) * 100 : 0;
              const pctB = maxSeconds > 0 ? (secB / maxSeconds) * 100 : 0;
              const Icon = TOPIC_ICONS[topic];

              return (
                <div key={topic}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-700">{topic}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${pctA}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 tabular-nums w-14 text-right">
                        {formatSeconds(secA)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-300 rounded-full transition-all duration-500"
                          style={{ width: `${pctB}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 tabular-nums w-14 text-right">
                        {formatSeconds(secB)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Block ──

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 rounded-xl p-3">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-black text-zinc-900 tabular-nums">{value}</div>
    </div>
  );
}

// ── Helpers ──

function getRole(person: PersonWithStats): string {
  const membership = (person as any).memberships?.find(
    (m: any) => !m.end_date || m.end_date >= new Date().toISOString().slice(0, 10),
  );
  return membership?.role || "Council Member";
}

function getAgreementLevel(
  a: CouncillorStance | null,
  b: CouncillorStance | null,
): { level: "agree" | "disagree" | "partial" | "no-data"; note: string | null } {
  if (!a && !b) {
    return { level: "no-data", note: "No stance data for either councillor" };
  }
  if (!a || !b) {
    const who = a ? "Only " + a.position : "Only " + b!.position;
    return { level: "no-data", note: `${who} -- no data for the other councillor` };
  }

  const scoreA = a.position_score ?? 0;
  const scoreB = b.position_score ?? 0;
  const distance = Math.abs(scoreA - scoreB);

  const posA = a.position;
  const posB = b.position;

  if (distance <= 0.5) {
    const note =
      posA === posB
        ? `Both ${posA === "supports" ? "support" : posA === "opposes" ? "oppose" : "have a " + posA + " stance on"} this topic`
        : `Similar positions (${posA} vs ${posB})`;
    return { level: "agree", note };
  }

  if (distance > 1.0) {
    return {
      level: "disagree",
      note: `${getFirstName(posA)} vs ${getFirstName(posB)} -- significant disagreement`,
    };
  }

  return {
    level: "partial",
    note: `Moderate difference (${posA} vs ${posB})`,
  };
}

function getFirstName(position: string): string {
  return position.charAt(0).toUpperCase() + position.slice(1);
}

function formatSeconds(seconds: number): string {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${(seconds / 3600).toFixed(1)}h`;
}
