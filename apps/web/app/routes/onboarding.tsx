/**
 * Onboarding wizard — post-signup flow for setting up subscriptions.
 * Steps: pick topics -> set address/neighbourhood -> opt into digest.
 */

import { useState } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/onboarding";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getTopics } from "../services/topics";
import {
  getUserProfile,
  upsertUserProfile,
  addSubscription,
} from "../services/subscriptions";
import { generateQueryEmbedding } from "../lib/embeddings.server";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Tag,
  MapPin,
  Bell,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { Topic } from "../lib/types";

// ── Neighbourhood list (same as settings.tsx) ──

const VIEW_ROYAL_NEIGHBORHOODS = [
  "Atkins/Portage",
  "Burnside",
  "Chilco",
  "Craigflower",
  "Eagle Creek",
  "Helmcken",
  "Hospital",
  "Island Highway",
  "Nursery Hill",
  "Six Mile",
  "Thetis Heights",
  "View Royal Town Centre",
];

const PROXIMITY_OPTIONS = [
  { value: 500, label: "500m" },
  { value: 1000, label: "1km" },
  { value: 2000, label: "2km" },
  { value: 3000, label: "3km" },
];

// ── Loader ──

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login", { headers });
  }

  const [profile, topics] = await Promise.all([
    getUserProfile(supabase, user.id),
    getTopics(supabase),
  ]);

  // Already completed onboarding — go home
  if (profile?.onboarding_completed) {
    throw redirect("/", { headers });
  }

  return { user, profile, topics };
}

// ── Action ──

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw redirect("/login", { headers });
  }

  const formData = await request.formData();
  const topicIds = formData.getAll("topic_id").map(Number).filter(Boolean);
  const keywords = formData.getAll("keyword").map(String).filter(Boolean);
  const address = (formData.get("address") as string) || "";
  const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const neighborhood = (formData.get("neighborhood") as string) || "";
  const proximityRadius = Number(formData.get("proximity_radius") || 1000);
  const digestEnabled = formData.get("digest_enabled") === "true";

  try {
    // 1. Subscribe to selected topic categories
    for (const topicId of topicIds) {
      await addSubscription(supabase, user.id, "topic", { topic_id: topicId });
    }

    // 2. Subscribe to keywords with embeddings
    for (const kw of keywords) {
      const embedding = await generateQueryEmbedding(kw);
      if (embedding) {
        await addSubscription(supabase, user.id, "topic", {
          keyword: kw,
          keyword_embedding: embedding,
        });
      }
    }

    // 3. Handle address and location
    const profileUpdate: Record<string, unknown> = {};

    if (address) {
      profileUpdate.address = address;
    }

    if (lat != null && lng != null) {
      // Use SECURITY DEFINER RPC for safe geography write
      await supabase.rpc("update_user_location", {
        target_user_id: user.id,
        lng,
        lat,
      });

      // Create neighbourhood subscription for proximity alerts
      await addSubscription(supabase, user.id, "neighborhood", {
        proximity_radius_m: proximityRadius,
      });
    }

    if (neighborhood) {
      profileUpdate.neighborhood = neighborhood;
      // If not geocoded, still create neighbourhood subscription
      if (lat == null || lng == null) {
        await addSubscription(supabase, user.id, "neighborhood", {
          neighborhood,
          proximity_radius_m: proximityRadius,
        });
      }
    }

    // 4. Handle digest opt-in
    if (digestEnabled) {
      await addSubscription(supabase, user.id, "digest", {});
    }

    // 5. ALWAYS set onboarding_completed = true (even if user skipped everything)
    await upsertUserProfile(supabase, user.id, {
      ...profileUpdate,
      digest_enabled: digestEnabled,
      digest_frequency: "each_meeting",
    } as any);

    // Mark onboarding as complete via direct update
    await supabase
      .from("user_profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    return redirect("/", { headers });
  } catch (err) {
    console.error("Onboarding action error:", err);
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

// ── Step indicators ──

const STEPS = [
  { icon: Tag, label: "Topics" },
  { icon: MapPin, label: "Location" },
  { icon: Bell, label: "Digest" },
] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step.label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                isComplete && "bg-green-100 text-green-700",
                isCurrent && "bg-blue-600 text-white shadow-sm",
                !isComplete && !isCurrent && "bg-zinc-100 text-zinc-400",
              )}
            >
              {isComplete ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full",
                  i < currentStep ? "bg-green-300" : "bg-zinc-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Topics ──

function TopicStep({
  topics,
  selectedTopics,
  setSelectedTopics,
  keywords,
  setKeywords,
}: {
  topics: Topic[];
  selectedTopics: Set<number>;
  setSelectedTopics: (s: Set<number>) => void;
  keywords: string[];
  setKeywords: (k: string[]) => void;
}) {
  const [keywordInput, setKeywordInput] = useState("");

  function toggleTopic(id: number) {
    const next = new Set(selectedTopics);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTopics(next);
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    setKeywordInput("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">
          What topics interest you?
        </h2>
        <p className="text-sm text-zinc-500">
          Select categories to get notified when related items appear on council
          agendas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {topics.map((topic) => {
          const selected = selectedTopics.has(topic.id);
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => toggleTopic(topic.id)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                selected
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-zinc-200 bg-white hover:border-zinc-300",
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  selected
                    ? "border-blue-500 bg-blue-500"
                    : "border-zinc-300 bg-white",
                )}
              >
                {selected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 truncate">
                  {topic.name}
                </div>
                {topic.description && (
                  <div className="text-xs text-zinc-500 truncate">
                    {topic.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-1">
            Custom keywords
          </h3>
          <p className="text-xs text-zinc-500">
            Add specific terms to get alerts when semantically similar topics are
            discussed.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder='e.g. "housing", "bike lanes", "property tax"'
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addKeyword}
            disabled={!keywordInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <Badge
                key={kw}
                variant="secondary"
                className="gap-1 pl-2.5 pr-1.5 py-1 cursor-pointer hover:bg-zinc-200"
                onClick={() => setKeywords(keywords.filter((k) => k !== kw))}
              >
                {kw}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Location ──

function LocationStep({
  address,
  setAddress,
  geocodeResult,
  setGeocodeResult,
  neighborhood,
  setNeighborhood,
  proximityRadius,
  setProximityRadius,
}: {
  address: string;
  setAddress: (a: string) => void;
  geocodeResult: { lat: number; lng: number; display_name: string } | null;
  setGeocodeResult: (
    r: { lat: number; lng: number; display_name: string } | null,
  ) => void;
  neighborhood: string;
  setNeighborhood: (n: string) => void;
  proximityRadius: number;
  setProximityRadius: (r: number) => void;
}) {
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    setGeocodeError("");
    setGeocodeResult(null);

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = (await res.json()) as {
        lat?: number;
        lng?: number;
        display_name?: string;
        error?: string;
      };
      if (res.ok && data.lat && data.lng) {
        setGeocodeResult({
          lat: data.lat,
          lng: data.lng,
          display_name: data.display_name || address,
        });
      } else {
        setGeocodeError(
          data.error ||
            "We couldn't find that address -- try adding more detail or pick a neighbourhood instead.",
        );
      }
    } catch {
      setGeocodeError("Geocoding failed -- please try again.");
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">
          Where in View Royal?
        </h2>
        <p className="text-sm text-zinc-500">
          Get notified about decisions and developments near your home.
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
          Street address
        </label>
        <div className="flex gap-2">
          <Input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setGeocodeResult(null);
              setGeocodeError("");
            }}
            placeholder="e.g. 45 View Royal Ave"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGeocode();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleGeocode}
            disabled={geocoding || !address.trim()}
          >
            {geocoding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Locate"
            )}
          </Button>
        </div>

        {geocodeResult && (
          <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <Check className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{geocodeResult.display_name}</span>
          </div>
        )}

        {geocodeError && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            {geocodeError}
          </p>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-zinc-400 font-medium">or</span>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-700">
          Pick a neighbourhood
        </label>
        <select
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select neighbourhood</option>
          {VIEW_ROYAL_NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-700">
          Alert radius
        </label>
        <div className="flex gap-2">
          {PROXIMITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setProximityRadius(opt.value)}
              className={cn(
                "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                proximityRadius === opt.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400">
          How far from your location should we look for relevant matters?
        </p>
      </div>
    </div>
  );
}

// ── Step 3: Digest ──

function DigestStep({
  digestEnabled,
  setDigestEnabled,
}: {
  digestEnabled: boolean;
  setDigestEnabled: (e: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">
          Stay in the loop
        </h2>
        <p className="text-sm text-zinc-500">
          Get a summary after each council meeting so you never miss what
          matters.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setDigestEnabled(!digestEnabled)}
        className={cn(
          "w-full flex items-start gap-4 p-5 rounded-xl border text-left transition-all",
          digestEnabled
            ? "border-blue-500 bg-blue-50 shadow-sm"
            : "border-zinc-200 bg-white hover:border-zinc-300",
        )}
      >
        <div
          className={cn(
            "w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
            digestEnabled
              ? "border-blue-500 bg-blue-500"
              : "border-zinc-300 bg-white",
          )}
        >
          {digestEnabled && <Check className="h-3 w-3 text-white" />}
        </div>
        <div className="space-y-2">
          <div className="font-semibold text-zinc-900">Meeting digest</div>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Send me a summary after each council meeting -- key decisions, votes,
            and what it means for your neighbourhood.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Key decisions", "Vote results", "Your neighbourhood", "Divided votes"].map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 bg-white rounded-full border border-zinc-200 text-zinc-500"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Main Component ──

export default function Onboarding({ loaderData, actionData }: Route.ComponentProps) {
  const { topics } = loaderData;

  const [step, setStep] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [keywords, setKeywords] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [geocodeResult, setGeocodeResult] = useState<{
    lat: number;
    lng: number;
    display_name: string;
  } | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [proximityRadius, setProximityRadius] = useState(1000);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);

    const form = new FormData();

    // Topics
    for (const id of selectedTopics) {
      form.append("topic_id", String(id));
    }
    for (const kw of keywords) {
      form.append("keyword", kw);
    }

    // Location
    if (address) form.set("address", address);
    if (geocodeResult) {
      form.set("lat", String(geocodeResult.lat));
      form.set("lng", String(geocodeResult.lng));
    }
    if (neighborhood) form.set("neighborhood", neighborhood);
    form.set("proximity_radius", String(proximityRadius));

    // Digest
    form.set("digest_enabled", digestEnabled ? "true" : "false");

    // Submit as regular form POST
    const response = await fetch("/onboarding", {
      method: "POST",
      body: form,
    });

    if (response.redirected) {
      window.location.href = response.url;
    } else {
      // If there's an error, stay on the page
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome to ViewRoyal.ai
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
            Set up your alerts
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Personalize what you hear about from council. Takes about 1 minute.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          {step === 0 && (
            <TopicStep
              topics={topics}
              selectedTopics={selectedTopics}
              setSelectedTopics={setSelectedTopics}
              keywords={keywords}
              setKeywords={setKeywords}
            />
          )}

          {step === 1 && (
            <LocationStep
              address={address}
              setAddress={setAddress}
              geocodeResult={geocodeResult}
              setGeocodeResult={setGeocodeResult}
              neighborhood={neighborhood}
              setNeighborhood={setNeighborhood}
              proximityRadius={proximityRadius}
              setProximityRadius={setProximityRadius}
            />
          )}

          {step === 2 && (
            <DigestStep
              digestEnabled={digestEnabled}
              setDigestEnabled={setDigestEnabled}
            />
          )}

          {/* Error display */}
          {actionData && "error" in actionData && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {actionData.error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100">
            <div>
              {step > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step === 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  className="text-zinc-400"
                >
                  Skip
                </Button>
              )}

              {step < 2 ? (
                <Button type="button" onClick={() => setStep(step + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Finish Setup
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Skip onboarding entirely */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              setSubmitting(true);
              const form = new FormData();
              form.set("digest_enabled", "false");
              fetch("/onboarding", { method: "POST", body: form }).then(
                (res) => {
                  if (res.redirected) window.location.href = res.url;
                  else setSubmitting(false);
                },
              );
            }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
            disabled={submitting}
          >
            Skip for now -- I'll set this up later
          </button>
        </div>
      </div>
    </div>
  );
}
